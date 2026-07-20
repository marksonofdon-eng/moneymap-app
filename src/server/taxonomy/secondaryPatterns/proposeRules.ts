import type { Prisma, TransactionFlow } from "@prisma/client";
import { getIngestPrisma } from "@/server/data/dbContext";
import {
  descriptionFromPayload,
  extractMerchantToken,
  normalizeDescription,
} from "@/server/taxonomy/features";
import { getExpenseMappingRows } from "@/server/taxonomy/expenseMapping";
import {
  newSecondaryRuleId,
  SECONDARY_MATCHER_VERSION,
  type SecondaryMatchSpec,
} from "@/server/taxonomy/secondaryPatterns/matcher";
import { invalidateSecondaryRuleCache } from "@/server/taxonomy/secondaryPatterns/loadRules";
import { upsertMerchantMapEntry } from "@/server/taxonomy/merchantMap";

export const PROPOSE_RULES_PROMPT_VERSION = "propose-rules-v1";
export const PROPOSE_MIN_SUPPORT = 5;
export const PROPOSE_AUTO_ACTIVE_SUPPORT = 10;
export const PROPOSE_AUTO_ACTIVE_PRECISION = 0.95;

export type ProposedRule = {
  patternType: "MERCHANT_TOKEN" | "DESC_NORMALIZED" | "BASIQ_L3";
  patternValue: string;
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  confidence: number;
  supportCount: number;
  rationale: string;
  source: "labelled-lookup" | "llm" | "heuristic";
};

export type ProposeRulesResult = {
  unmatchedScanned: number;
  clusters: number;
  proposed: number;
  createdCandidate: number;
  createdActive: number;
  skipped: number;
  proposals: Array<{
    id: string;
    status: string;
    patternType: string;
    patternValue: string;
    parentCategory: string;
    expenseCategory: string;
  }>;
};

type Cluster = {
  key: string;
  patternType: "MERCHANT_TOKEN" | "DESC_NORMALIZED";
  patternValue: string;
  supportCount: number;
  samples: string[];
};

function vocabulary(): { parents: Set<string>; expenses: Set<string>; pairs: Set<string> } {
  const rows = getExpenseMappingRows();
  const parents = new Set<string>();
  const expenses = new Set<string>();
  const pairs = new Set<string>();
  for (const row of rows) {
    parents.add(row.parentCategory);
    expenses.add(row.expenseCategory);
    pairs.add(`${row.parentCategory}||${row.expenseCategory}`);
  }
  // Credit labels
  parents.add("Income");
  expenses.add("Transfers In");
  pairs.add("Income||Transfers In");
  return { parents, expenses, pairs };
}

function isAllowedLabel(
  parent: string,
  expense: string,
  vocab: ReturnType<typeof vocabulary>,
): boolean {
  return vocab.pairs.has(`${parent}||${expense}`);
}

async function labelledLookupForMerchant(
  merchantKey: string,
): Promise<{ parentCategory: string; expenseCategory: string; flowType: TransactionFlow; agreement: number; support: number } | null> {
  const db = getIngestPrisma();
  const rows = await db.basiqTransaction.findMany({
    where: {
      categorySource: {
        in: ["BASIQ_ENRICH", "KEYWORD", "BASIQ_CLASS", "INCOME_API", "SECONDARY_PATTERN"],
      },
      parentCategory: { not: null },
      expenseCategory: { not: null },
    },
    select: {
      rawPayload: true,
      parentCategory: true,
      expenseCategory: true,
      flowType: true,
    },
    take: 50_000,
  });

  const counts = new Map<string, { n: number; flowType: TransactionFlow }>();
  let total = 0;
  for (const row of rows) {
    const token = extractMerchantToken(descriptionFromPayload(row.rawPayload));
    if (token !== merchantKey || !row.parentCategory || !row.expenseCategory) continue;
    const key = `${row.parentCategory}||${row.expenseCategory}`;
    const prev = counts.get(key) ?? {
      n: 0,
      flowType: (row.flowType ?? "EXPENSE") as TransactionFlow,
    };
    prev.n += 1;
    counts.set(key, prev);
    total += 1;
  }
  if (total < 2) return null;
  let best: { key: string; n: number; flowType: TransactionFlow } | null = null;
  for (const [key, stats] of counts) {
    if (!best || stats.n > best.n) best = { key, n: stats.n, flowType: stats.flowType };
  }
  if (!best) return null;
  const agreement = best.n / total;
  if (agreement < 0.9) return null;
  const [parentCategory, expenseCategory] = best.key.split("||");
  return {
    parentCategory,
    expenseCategory,
    flowType: best.flowType,
    agreement,
    support: total,
  };
}

async function proposeWithLlm(
  cluster: Cluster,
  vocab: ReturnType<typeof vocabulary>,
): Promise<ProposedRule | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const parentList = [...vocab.parents].slice(0, 80).join(", ");
  const expenseList = [...vocab.expenses].slice(0, 120).join(", ");
  const prompt = [
    "You categorise Australian bank transactions into Parent/Expense labels.",
    "Return ONLY JSON: {parentCategory, expenseCategory, confidence, rationale}",
    "parentCategory must be one of:",
    parentList,
    "expenseCategory must be one of:",
    expenseList,
    `Pattern type: ${cluster.patternType}`,
    `Pattern value: ${cluster.patternValue}`,
    `Support: ${cluster.supportCount}`,
    "Samples:",
    ...cluster.samples.slice(0, 8).map((s) => `- ${s}`),
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a careful finance taxonomy assistant." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      console.warn("[propose-rules:llm]", res.status, await res.text());
      return null;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as {
      parentCategory?: string;
      expenseCategory?: string;
      confidence?: number;
      rationale?: string;
    };
    if (
      typeof parsed.parentCategory !== "string" ||
      typeof parsed.expenseCategory !== "string" ||
      !isAllowedLabel(parsed.parentCategory, parsed.expenseCategory, vocab)
    ) {
      return null;
    }
    return {
      patternType: cluster.patternType,
      patternValue: cluster.patternValue,
      parentCategory: parsed.parentCategory,
      expenseCategory: parsed.expenseCategory,
      flowType: "EXPENSE",
      confidence: Math.max(70, Math.min(99, Math.round(parsed.confidence ?? 85))),
      supportCount: cluster.supportCount,
      rationale: parsed.rationale ?? "llm proposal",
      source: "llm",
    };
  } catch (error) {
    console.warn("[propose-rules:llm]", error);
    return null;
  }
}

function clusterUnmatched(
  rows: Array<{ rawPayload: unknown }>,
  minSupport: number,
): Cluster[] {
  const merchant = new Map<string, Cluster>();
  const desc = new Map<string, Cluster>();

  for (const row of rows) {
    const description = descriptionFromPayload(row.rawPayload);
    const token = extractMerchantToken(description);
    const descNorm = normalizeDescription(description);
    if (token) {
      const existing = merchant.get(token) ?? {
        key: `merch:${token}`,
        patternType: "MERCHANT_TOKEN" as const,
        patternValue: token,
        supportCount: 0,
        samples: [] as string[],
      };
      existing.supportCount += 1;
      if (existing.samples.length < 10 && description) existing.samples.push(description.slice(0, 160));
      merchant.set(token, existing);
    } else if (descNorm) {
      const existing = desc.get(descNorm) ?? {
        key: `desc:${descNorm}`,
        patternType: "DESC_NORMALIZED" as const,
        patternValue: descNorm,
        supportCount: 0,
        samples: [] as string[],
      };
      existing.supportCount += 1;
      if (existing.samples.length < 10 && description) existing.samples.push(description.slice(0, 160));
      desc.set(descNorm, existing);
    }
  }

  return [...merchant.values(), ...desc.values()]
    .filter((c) => c.supportCount >= minSupport)
    .sort((a, b) => b.supportCount - a.supportCount);
}

async function validateProposal(
  proposal: ProposedRule,
): Promise<{ precision: number; support: number }> {
  if (proposal.patternType !== "MERCHANT_TOKEN") {
    return { precision: proposal.confidence / 100, support: proposal.supportCount };
  }
  const lookup = await labelledLookupForMerchant(proposal.patternValue);
  if (!lookup) return { precision: 0, support: proposal.supportCount };
  const match =
    lookup.parentCategory === proposal.parentCategory &&
    lookup.expenseCategory === proposal.expenseCategory;
  return { precision: match ? lookup.agreement : 0, support: lookup.support };
}

export async function proposeSecondaryRules(options?: {
  sampleCap?: number;
  minSupport?: number;
  useLlm?: boolean;
}): Promise<ProposeRulesResult> {
  const db = getIngestPrisma();
  const sampleCap = options?.sampleCap ?? 50_000;
  const minSupport = options?.minSupport ?? PROPOSE_MIN_SUPPORT;
  const useLlm = options?.useLlm !== false;

  const unmatched = await db.basiqTransaction.findMany({
    where: {
      OR: [{ categorySource: "UNMATCHED" }, { categorySource: null }],
    },
    select: { rawPayload: true },
    take: sampleCap,
  });

  const clusters = clusterUnmatched(unmatched, minSupport);
  const vocab = vocabulary();
  const proposals: ProposedRule[] = [];

  for (const cluster of clusters.slice(0, 100)) {
    let proposal: ProposedRule | null = null;

    if (cluster.patternType === "MERCHANT_TOKEN") {
      const lookup = await labelledLookupForMerchant(cluster.patternValue);
      if (lookup && isAllowedLabel(lookup.parentCategory, lookup.expenseCategory, vocab)) {
        proposal = {
          patternType: "MERCHANT_TOKEN",
          patternValue: cluster.patternValue,
          parentCategory: lookup.parentCategory,
          expenseCategory: lookup.expenseCategory,
          flowType: lookup.flowType,
          confidence: Math.round(lookup.agreement * 100),
          supportCount: Math.max(cluster.supportCount, lookup.support),
          rationale: `labelled lookup agreement ${Math.round(lookup.agreement * 100)}%`,
          source: "labelled-lookup",
        };
      }
    }

    if (!proposal && useLlm) {
      proposal = await proposeWithLlm(cluster, vocab);
    }

    if (proposal) proposals.push(proposal);
  }

  let createdCandidate = 0;
  let createdActive = 0;
  let skipped = 0;
  const out: ProposeRulesResult["proposals"] = [];
  const now = new Date();

  for (const proposal of proposals) {
    const validation = await validateProposal(proposal);
    const autoActive =
      proposal.source === "labelled-lookup" &&
      validation.precision >= PROPOSE_AUTO_ACTIVE_PRECISION &&
      proposal.supportCount >= PROPOSE_AUTO_ACTIVE_SUPPORT;

    const status = autoActive ? "ACTIVE" : "CANDIDATE";
    const matchSpec: SecondaryMatchSpec & {
      llmProposal?: Record<string, unknown>;
    } = {
      direction: "any",
      ...(proposal.patternType === "MERCHANT_TOKEN"
        ? { merchantToken: proposal.patternValue }
        : { descriptionNormalized: proposal.patternValue }),
      llmProposal: {
        promptVersion: PROPOSE_RULES_PROMPT_VERSION,
        source: proposal.source,
        rationale: proposal.rationale,
        validation,
      },
    };

    const existing = await db.secondaryCategoryRule.findFirst({
      where: {
        patternType: proposal.patternType,
        patternValue: proposal.patternValue,
        ownerScope: "GLOBAL",
        ownerUserId: null,
      },
    });

    if (existing) {
      if (existing.status === "REVOKED" || existing.status === "ACTIVE") {
        skipped += 1;
        continue;
      }
      const row = await db.secondaryCategoryRule.update({
        where: { id: existing.id },
        data: {
          status,
          parentCategory: proposal.parentCategory,
          expenseCategory: proposal.expenseCategory,
          flowType: proposal.flowType,
          confidence: proposal.confidence,
          supportCount: proposal.supportCount,
          matchSpec: matchSpec as Prisma.InputJsonValue,
          notes: `${proposal.source}: ${proposal.rationale}`.slice(0, 500),
          activatedAt: status === "ACTIVE" ? now : existing.activatedAt,
          requiresApproval: status === "CANDIDATE",
          matcherVersion: SECONDARY_MATCHER_VERSION,
        },
      });
      if (status === "ACTIVE") createdActive += 1;
      else createdCandidate += 1;
      out.push({
        id: row.id,
        status: row.status,
        patternType: row.patternType,
        patternValue: row.patternValue,
        parentCategory: row.parentCategory,
        expenseCategory: row.expenseCategory,
      });
    } else {
      const id = newSecondaryRuleId();
      const row = await db.secondaryCategoryRule.create({
        data: {
          id,
          status,
          patternType: proposal.patternType,
          patternValue: proposal.patternValue,
          matchSpec: matchSpec as Prisma.InputJsonValue,
          parentCategory: proposal.parentCategory,
          expenseCategory: proposal.expenseCategory,
          flowType: proposal.flowType,
          confidence: proposal.confidence,
          supportCount: proposal.supportCount,
          ownerScope: "GLOBAL",
          ownerUserId: null,
          requiresApproval: status === "CANDIDATE",
          matcherVersion: SECONDARY_MATCHER_VERSION,
          createdBy: `system:propose-rules:${proposal.source}`,
          notes: `${proposal.source}: ${proposal.rationale}`.slice(0, 500),
          activatedAt: status === "ACTIVE" ? now : null,
        },
      });
      if (status === "ACTIVE") createdActive += 1;
      else createdCandidate += 1;
      out.push({
        id: row.id,
        status: row.status,
        patternType: row.patternType,
        patternValue: row.patternValue,
        parentCategory: row.parentCategory,
        expenseCategory: row.expenseCategory,
      });
    }

    if (status === "ACTIVE" && proposal.patternType === "MERCHANT_TOKEN") {
      await upsertMerchantMapEntry({
        merchantKey: proposal.patternValue,
        parentCategory: proposal.parentCategory,
        expenseCategory: proposal.expenseCategory,
        flowType: proposal.flowType,
        supportCount: proposal.supportCount,
        agreementPct: Math.round(validation.precision * 100),
        source: "RULE",
        createdBy: "system:propose-rules",
        notes: proposal.rationale,
        promoteRule: true,
      });
    }
  }

  invalidateSecondaryRuleCache();

  return {
    unmatchedScanned: unmatched.length,
    clusters: clusters.length,
    proposed: proposals.length,
    createdCandidate,
    createdActive,
    skipped,
    proposals: out,
  };
}
