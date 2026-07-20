import type { MerchantMapSource, Prisma, TransactionFlow } from "@prisma/client";
import { getIngestPrisma } from "@/server/data/dbContext";
import { extractMerchantToken, descriptionFromPayload } from "@/server/taxonomy/features";
import {
  newSecondaryRuleId,
  SECONDARY_MATCHER_VERSION,
  type SecondaryMatchSpec,
} from "@/server/taxonomy/secondaryPatterns/matcher";
import { invalidateSecondaryRuleCache } from "@/server/taxonomy/secondaryPatterns/loadRules";

export const MERCHANT_MAP_MATCHER_VERSION = "merchant-map-v1";
export const MERCHANT_MAP_MIN_SUPPORT = 3;
export const MERCHANT_MAP_MIN_AGREEMENT = 90;

export type MerchantMapHit = {
  merchantKey: string;
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  categoryConfidence: number;
  categorySource: "SECONDARY_PATTERN";
  categoryMatcherVersion: string;
  categoryRuleId: string | null;
  reasons: string[];
};

type CachedMapRow = {
  merchantKey: string;
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  supportCount: number;
  agreementPct: number;
  ruleId: string | null;
  matcherVersion: string;
};

let cachedMap: Map<string, CachedMapRow> | null = null;
let cachedAt = 0;
const CACHE_MS = 30_000;

export function invalidateMerchantMapCache() {
  cachedMap = null;
  cachedAt = 0;
}

export async function loadMerchantCategoryMap(
  forceRefresh = false,
): Promise<Map<string, CachedMapRow>> {
  const now = Date.now();
  if (!forceRefresh && cachedMap && now - cachedAt < CACHE_MS) {
    return cachedMap;
  }

  const db = getIngestPrisma();
  const rows = await db.merchantCategoryMap.findMany({
    select: {
      merchantKey: true,
      parentCategory: true,
      expenseCategory: true,
      flowType: true,
      supportCount: true,
      agreementPct: true,
      ruleId: true,
      matcherVersion: true,
    },
  });

  const map = new Map<string, CachedMapRow>();
  for (const row of rows) {
    map.set(row.merchantKey, row);
  }
  cachedMap = map;
  cachedAt = now;
  return map;
}

export function applyMerchantMapToPayload(
  map: Map<string, CachedMapRow>,
  payload: unknown,
): MerchantMapHit | null {
  const merchantKey = extractMerchantToken(descriptionFromPayload(payload));
  if (!merchantKey) return null;
  const row = map.get(merchantKey);
  if (!row) return null;
  if (row.agreementPct < MERCHANT_MAP_MIN_AGREEMENT) return null;

  return {
    merchantKey,
    parentCategory: row.parentCategory,
    expenseCategory: row.expenseCategory,
    flowType: row.flowType,
    categoryConfidence: Math.min(99, Math.max(row.agreementPct, 90)),
    categorySource: "SECONDARY_PATTERN",
    categoryMatcherVersion: row.matcherVersion || MERCHANT_MAP_MATCHER_VERSION,
    categoryRuleId: row.ruleId,
    reasons: [`merchant-map:${merchantKey}`],
  };
}

async function upsertMerchantTokenRule(input: {
  merchantKey: string;
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  confidence: number;
  supportCount: number;
  createdBy: string;
  notes: string;
}): Promise<string> {
  const db = getIngestPrisma();
  const matchSpec: SecondaryMatchSpec = {
    direction: "any",
    merchantToken: input.merchantKey,
  };

  const existing = await db.secondaryCategoryRule.findFirst({
    where: {
      patternType: "MERCHANT_TOKEN",
      patternValue: input.merchantKey,
      ownerScope: "GLOBAL",
      ownerUserId: null,
    },
  });

  const now = new Date();
  if (existing) {
    if (existing.status === "REVOKED") return existing.id;
    const row = await db.secondaryCategoryRule.update({
      where: { id: existing.id },
      data: {
        parentCategory: input.parentCategory,
        expenseCategory: input.expenseCategory,
        flowType: input.flowType,
        confidence: input.confidence,
        supportCount: Math.max(existing.supportCount, input.supportCount),
        matchSpec: matchSpec as Prisma.InputJsonValue,
        notes: input.notes,
        status: "ACTIVE",
        activatedAt: existing.activatedAt ?? now,
        requiresApproval: false,
        matcherVersion: SECONDARY_MATCHER_VERSION,
      },
    });
    return row.id;
  }

  const id = newSecondaryRuleId();
  await db.secondaryCategoryRule.create({
    data: {
      id,
      status: "ACTIVE",
      patternType: "MERCHANT_TOKEN",
      patternValue: input.merchantKey,
      matchSpec: matchSpec as Prisma.InputJsonValue,
      parentCategory: input.parentCategory,
      expenseCategory: input.expenseCategory,
      flowType: input.flowType,
      confidence: input.confidence,
      supportCount: input.supportCount,
      ownerScope: "GLOBAL",
      ownerUserId: null,
      requiresApproval: false,
      matcherVersion: SECONDARY_MATCHER_VERSION,
      createdBy: input.createdBy,
      notes: input.notes,
      activatedAt: now,
    },
  });
  return id;
}

export type UpsertMerchantMapInput = {
  merchantKey: string;
  parentCategory: string;
  expenseCategory: string;
  flowType?: TransactionFlow;
  supportCount: number;
  agreementPct: number;
  source: MerchantMapSource;
  createdBy: string;
  notes?: string;
  promoteRule?: boolean;
};

export async function upsertMerchantMapEntry(
  input: UpsertMerchantMapInput,
): Promise<{ merchantKey: string; ruleId: string | null }> {
  const db = getIngestPrisma();
  const flowType = input.flowType ?? "EXPENSE";
  const promoteRule = input.promoteRule !== false;
  let ruleId: string | null = null;

  if (promoteRule) {
    ruleId = await upsertMerchantTokenRule({
      merchantKey: input.merchantKey,
      parentCategory: input.parentCategory,
      expenseCategory: input.expenseCategory,
      flowType,
      confidence: Math.min(99, Math.max(input.agreementPct, 90)),
      supportCount: input.supportCount,
      createdBy: input.createdBy,
      notes: input.notes ?? `Merchant map: ${input.merchantKey}`,
    });
  }

  await db.merchantCategoryMap.upsert({
    where: { merchantKey: input.merchantKey },
    create: {
      merchantKey: input.merchantKey,
      parentCategory: input.parentCategory,
      expenseCategory: input.expenseCategory,
      flowType,
      supportCount: input.supportCount,
      agreementPct: input.agreementPct,
      source: input.source,
      matcherVersion: MERCHANT_MAP_MATCHER_VERSION,
      ruleId,
      createdBy: input.createdBy,
      notes: input.notes,
    },
    update: {
      parentCategory: input.parentCategory,
      expenseCategory: input.expenseCategory,
      flowType,
      supportCount: input.supportCount,
      agreementPct: input.agreementPct,
      source: input.source,
      matcherVersion: MERCHANT_MAP_MATCHER_VERSION,
      ruleId,
      createdBy: input.createdBy,
      notes: input.notes,
    },
  });

  invalidateMerchantMapCache();
  invalidateSecondaryRuleCache();
  return { merchantKey: input.merchantKey, ruleId };
}

export type BuildMerchantMapResult = {
  candidates: number;
  upserted: number;
  skippedLowSupport: number;
  skippedLowAgreement: number;
};

/**
 * Aggregate labelled txs by merchant token; upsert map rows meeting support/agreement floors.
 */
export async function buildMerchantMapFromLabels(options?: {
  minSupport?: number;
  minAgreement?: number;
}): Promise<BuildMerchantMapResult> {
  const minSupport = options?.minSupport ?? MERCHANT_MAP_MIN_SUPPORT;
  const minAgreement = options?.minAgreement ?? MERCHANT_MAP_MIN_AGREEMENT;
  const db = getIngestPrisma();

  const labelled = await db.basiqTransaction.findMany({
    where: {
      categorySource: {
        in: [
          "BASIQ_ENRICH",
          "KEYWORD",
          "BASIQ_CLASS",
          "INCOME_API",
          "SECONDARY_PATTERN",
        ],
      },
      parentCategory: { not: null },
      expenseCategory: { not: null },
    },
    select: {
      rawPayload: true,
      parentCategory: true,
      expenseCategory: true,
      flowType: true,
      categorySource: true,
      categoryConfidence: true,
    },
    take: 100_000,
  });

  type Agg = {
    total: number;
    byLabel: Map<string, { count: number; flowType: TransactionFlow; primaryWeight: number }>;
  };
  const byMerchant = new Map<string, Agg>();

  for (const row of labelled) {
    const merchant = extractMerchantToken(descriptionFromPayload(row.rawPayload));
    if (!merchant || !row.parentCategory || !row.expenseCategory) continue;

    // Do not learn from title/L3-inferred BASIQ_ENRICH (confidence < 90).
    if (
      row.categorySource === "BASIQ_ENRICH" &&
      (row.categoryConfidence == null || row.categoryConfidence < 90)
    ) {
      continue;
    }

    const labelKey = `${row.parentCategory}||${row.expenseCategory}`;
    const isPrimary =
      row.categorySource === "BASIQ_ENRICH" ||
      row.categorySource === "KEYWORD" ||
      row.categorySource === "BASIQ_CLASS" ||
      row.categorySource === "INCOME_API";
    const weight =
      isPrimary || (row.categoryConfidence != null && row.categoryConfidence >= 90)
        ? 1
        : 0.5;

    let agg = byMerchant.get(merchant);
    if (!agg) {
      agg = { total: 0, byLabel: new Map() };
      byMerchant.set(merchant, agg);
    }
    agg.total += weight;
    const prev = agg.byLabel.get(labelKey) ?? {
      count: 0,
      flowType: (row.flowType ?? "EXPENSE") as TransactionFlow,
      primaryWeight: 0,
    };
    prev.count += weight;
    prev.primaryWeight += isPrimary ? weight : 0;
    agg.byLabel.set(labelKey, prev);
  }

  let upserted = 0;
  let skippedLowSupport = 0;
  let skippedLowAgreement = 0;

  for (const [merchantKey, agg] of byMerchant) {
    if (agg.total < minSupport) {
      skippedLowSupport += 1;
      continue;
    }

    let bestKey: string | null = null;
    let best = { count: 0, flowType: "EXPENSE" as TransactionFlow, primaryWeight: 0 };
    for (const [key, stats] of agg.byLabel) {
      if (stats.count > best.count) {
        bestKey = key;
        best = stats;
      }
    }
    if (!bestKey) continue;

    const agreementPct = Math.round((best.count / agg.total) * 100);
    if (agreementPct < minAgreement) {
      skippedLowAgreement += 1;
      continue;
    }

    const [parentCategory, expenseCategory] = bestKey.split("||");
    await upsertMerchantMapEntry({
      merchantKey,
      parentCategory,
      expenseCategory,
      flowType: best.flowType,
      supportCount: Math.round(agg.total),
      agreementPct,
      source: "LABELLED",
      createdBy: "system:merchant-map-build",
      notes: `Built from labels (agreement ${agreementPct}%)`,
      promoteRule: true,
    });
    upserted += 1;
  }

  return {
    candidates: byMerchant.size,
    upserted,
    skippedLowSupport,
    skippedLowAgreement,
  };
}
