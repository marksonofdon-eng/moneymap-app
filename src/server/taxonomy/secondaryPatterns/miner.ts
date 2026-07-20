import type { Prisma, TransactionFlow } from "@prisma/client";
import { getIngestPrisma } from "@/server/data/dbContext";
import {
  basiqSubclassCodeFromPayload,
  descriptionFromPayload,
  extractMerchantToken,
  normalizeDescription,
  newSecondaryRuleId,
  SECONDARY_CONFIDENCE_FLOOR,
  SECONDARY_MATCHER_VERSION,
  SECONDARY_MIN_SUPPORT,
  type SecondaryMatchSpec,
} from "@/server/taxonomy/secondaryPatterns/matcher";
import { invalidateSecondaryRuleCache } from "@/server/taxonomy/secondaryPatterns/loadRules";
import { lookupByL3Code } from "@/server/taxonomy/expenseMapping";

export type MineSecondaryPatternsResult = {
  scannedUnmatched: number;
  candidatesCreated: number;
  activated: number;
  skippedAmbiguous: number;
  rules: Array<{ id: string; patternType: string; patternValue: string; status: string }>;
};

type Cluster = {
  patternType: "DESC_NORMALIZED" | "BASIQ_L3" | "MERCHANT_TOKEN";
  patternValue: string;
  supportCount: number;
  direction: "credit" | "debit" | "any";
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  confidence: number;
  notes: string;
};

function proposeFromL3(code: string, title: string): Omit<Cluster, "supportCount" | "direction"> | null {
  const single = lookupByL3Code(code);
  if (single) {
    return {
      patternType: "BASIQ_L3",
      patternValue: code,
      parentCategory: single.parentCategory,
      expenseCategory: single.expenseCategory,
      flowType: "EXPENSE",
      confidence: 90,
      notes: `Single-child L3 ${code} → ${single.basiqL4Code}`,
    };
  }

  // Curated high-certainty L3 title → UI label (multi-child parents).
  const curated: Record<string, { parent: string; expense: string; confidence: number }> = {
    "452": { parent: "Food & Dining", expense: "Bars & Pubs", confidence: 92 },
    "840": { parent: "Health & Medical", expense: "Doctor & GP", confidence: 88 },
    "117": { parent: "Food & Dining", expense: "Bakery Direct", confidence: 88 },
    "431": { parent: "Miscellaneous", expense: "Post & Shipping", confidence: 90 },
    "751": { parent: "Finance, Legal & Ins", expense: "Gov Fees & Duties", confidence: 90 },
  };
  const hit = curated[code];
  if (hit) {
    return {
      patternType: "BASIQ_L3",
      patternValue: code,
      parentCategory: hit.parent,
      expenseCategory: hit.expense,
      flowType: "EXPENSE",
      confidence: hit.confidence,
      notes: `Curated L3 ${code} (${title || "n/a"})`,
    };
  }
  return null;
}

/**
 * Mine UNMATCHED txs globally and auto-promote high-certainty patterns to ACTIVE.
 */
export async function mineSecondaryPatterns(): Promise<MineSecondaryPatternsResult> {
  const db = getIngestPrisma();
  const unmatched = await db.basiqTransaction.findMany({
    where: {
      OR: [{ categorySource: "UNMATCHED" }, { categorySource: null }],
    },
    select: {
      transactionId: true,
      direction: true,
      rawPayload: true,
    },
  });

  const descClusters = new Map<string, { count: number; debit: number; credit: number }>();
  const merchantClusters = new Map<string, { count: number; debit: number; credit: number }>();
  const l3Clusters = new Map<
    string,
    { count: number; title: string; debit: number; credit: number }
  >();

  for (const row of unmatched) {
    const desc = descriptionFromPayload(row.rawPayload);
    const norm = normalizeDescription(desc);
    const merchant = extractMerchantToken(desc);
    const l3 = basiqSubclassCodeFromPayload(row.rawPayload);
    const dir = row.direction === "credit" ? "credit" : "debit";

    if (norm) {
      const cur = descClusters.get(norm) ?? { count: 0, debit: 0, credit: 0 };
      cur.count += 1;
      cur[dir] += 1;
      descClusters.set(norm, cur);
    }
    if (merchant) {
      const cur = merchantClusters.get(merchant) ?? { count: 0, debit: 0, credit: 0 };
      cur.count += 1;
      cur[dir] += 1;
      merchantClusters.set(merchant, cur);
    }
    if (l3 && l3 !== "0") {
      const title =
        typeof (row.rawPayload as { subClass?: { title?: string } })?.subClass
          ?.title === "string"
          ? (row.rawPayload as { subClass: { title: string } }).subClass.title
          : "";
      const cur = l3Clusters.get(l3) ?? { count: 0, title, debit: 0, credit: 0 };
      cur.count += 1;
      cur[dir] += 1;
      if (title) cur.title = title;
      l3Clusters.set(l3, cur);
    }
  }

  const proposals: Cluster[] = [];

  for (const [code, stats] of l3Clusters) {
    if (stats.count < SECONDARY_MIN_SUPPORT) continue;
    const proposed = proposeFromL3(code, stats.title);
    if (!proposed || proposed.confidence < SECONDARY_CONFIDENCE_FLOOR) continue;
    proposals.push({
      ...proposed,
      supportCount: stats.count,
      direction: stats.debit >= stats.credit ? "debit" : "credit",
    });
  }

  for (const [norm, stats] of descClusters) {
    if (stats.count < SECONDARY_MIN_SUPPORT) continue;
    // Description clusters alone are weaker unless very repetitive; require higher support.
    if (stats.count < 5) continue;
    proposals.push({
      patternType: "DESC_NORMALIZED",
      patternValue: norm,
      supportCount: stats.count,
      direction: stats.debit >= stats.credit ? "debit" : "credit",
      parentCategory: "Miscellaneous",
      expenseCategory: "General Services",
      flowType: "EXPENSE",
      confidence: Math.min(88, 70 + stats.count),
      notes: `Repeated description cluster (n=${stats.count})`,
    });
  }

  let candidatesCreated = 0;
  let activated = 0;
  let skippedAmbiguous = 0;
  const touched: MineSecondaryPatternsResult["rules"] = [];

  for (const proposal of proposals) {
    if (proposal.confidence < SECONDARY_CONFIDENCE_FLOOR) {
      skippedAmbiguous += 1;
      continue;
    }

    const matchSpec: SecondaryMatchSpec = {
      direction: proposal.direction,
      basiqL3Code:
        proposal.patternType === "BASIQ_L3" ? proposal.patternValue : undefined,
      descriptionNormalized:
        proposal.patternType === "DESC_NORMALIZED"
          ? proposal.patternValue
          : undefined,
      merchantToken:
        proposal.patternType === "MERCHANT_TOKEN"
          ? proposal.patternValue
          : undefined,
    };

    const existing = await db.secondaryCategoryRule.findFirst({
      where: {
        patternType: proposal.patternType,
        patternValue: proposal.patternValue,
        ownerScope: "GLOBAL",
        ownerUserId: null,
      },
    });

    const shouldActivate = proposal.confidence >= SECONDARY_CONFIDENCE_FLOOR;
    const now = new Date();

    if (existing) {
      const updated = await db.secondaryCategoryRule.update({
        where: { id: existing.id },
        data: {
          supportCount: proposal.supportCount,
          confidence: Math.max(existing.confidence, proposal.confidence),
          parentCategory: proposal.parentCategory,
          expenseCategory: proposal.expenseCategory,
          flowType: proposal.flowType,
          matchSpec: matchSpec as Prisma.InputJsonValue,
          notes: proposal.notes,
          ...(shouldActivate && existing.status === "CANDIDATE"
            ? { status: "ACTIVE", activatedAt: now }
            : {}),
          ...(shouldActivate && existing.status === "ACTIVE"
            ? {}
            : {}),
        },
      });
      if (shouldActivate && existing.status === "CANDIDATE") activated += 1;
      touched.push({
        id: updated.id,
        patternType: updated.patternType,
        patternValue: updated.patternValue,
        status: updated.status,
      });
      continue;
    }

    const id = newSecondaryRuleId();
    const created = await db.secondaryCategoryRule.create({
      data: {
        id,
        status: shouldActivate ? "ACTIVE" : "CANDIDATE",
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
        requiresApproval: false,
        matcherVersion: SECONDARY_MATCHER_VERSION,
        createdBy: "system:pattern-miner",
        notes: proposal.notes,
        activatedAt: shouldActivate ? now : null,
      },
    });
    candidatesCreated += 1;
    if (shouldActivate) activated += 1;
    touched.push({
      id: created.id,
      patternType: created.patternType,
      patternValue: created.patternValue,
      status: created.status,
    });
  }

  invalidateSecondaryRuleCache();

  return {
    scannedUnmatched: unmatched.length,
    candidatesCreated,
    activated,
    skippedAmbiguous,
    rules: touched,
  };
}
