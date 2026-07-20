import type { Prisma, TransactionFlow } from "@prisma/client";
import { getIngestPrisma } from "@/server/data/dbContext";
import { upsertMerchantMapEntry } from "@/server/taxonomy/merchantMap";
import {
  newSecondaryRuleId,
  SECONDARY_MATCHER_VERSION,
  type SecondaryMatchSpec,
} from "@/server/taxonomy/secondaryPatterns/matcher";
import { invalidateSecondaryRuleCache } from "@/server/taxonomy/secondaryPatterns/loadRules";

/** High-certainty L3-only secondary seeds from unmatched audit. */
const L3_SEED_RULES: Array<{
  l3: string;
  parentCategory: string;
  expenseCategory: string;
  confidence: number;
  supportCount: number;
  notes: string;
}> = [
  {
    l3: "452",
    parentCategory: "Food & Dining",
    expenseCategory: "Bars & Pubs",
    confidence: 92,
    supportCount: 13,
    notes: "Seed: Pubs/Taverns L3 → Bars & Pubs",
  },
  {
    l3: "431",
    parentCategory: "Miscellaneous",
    expenseCategory: "Post & Shipping",
    confidence: 90,
    supportCount: 3,
    notes: "Seed: Non-Store Retailing L3 → Post & Shipping",
  },
  {
    l3: "751",
    parentCategory: "Finance, Legal & Ins",
    expenseCategory: "Gov Fees & Duties",
    confidence: 90,
    supportCount: 1,
    notes: "Seed: Central Government Administration L3",
  },
  {
    l3: "840",
    parentCategory: "Health & Medical",
    expenseCategory: "Doctor & GP",
    confidence: 88,
    supportCount: 5,
    notes: "Seed: Hospitals L3 → Doctor & GP",
  },
  {
    l3: "117",
    parentCategory: "Food & Dining",
    expenseCategory: "Bakery Direct",
    confidence: 88,
    supportCount: 3,
    notes: "Seed: Bakery Product Manufacturing L3",
  },
  {
    l3: "423",
    parentCategory: "Clothes & Fashion",
    expenseCategory: "Clothing",
    confidence: 90,
    supportCount: 5,
    notes: "Seed: Apparel & Footwear Retailing L3 → Clothing",
  },
];

/** Merchant-token seeds for known unmatched clusters (promoted into map + scr_). */
const MERCHANT_SEED_RULES: Array<{
  merchantKey: string;
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  confidence: number;
  supportCount: number;
  notes: string;
}> = [
  {
    merchantKey: "mcdonalds",
    parentCategory: "Food & Dining",
    expenseCategory: "Takeaway",
    flowType: "EXPENSE",
    confidence: 94,
    supportCount: 10,
    notes: "Seed: McDonald's → Takeaway (Basiq often L3-only 451)",
  },
  {
    merchantKey: "dominos",
    parentCategory: "Food & Dining",
    expenseCategory: "Takeaway",
    flowType: "EXPENSE",
    confidence: 94,
    supportCount: 5,
    notes: "Seed: Domino's → Takeaway",
  },
  {
    merchantKey: "uber",
    parentCategory: "Food & Dining",
    expenseCategory: "Takeaway",
    flowType: "EXPENSE",
    confidence: 90,
    supportCount: 5,
    notes: "Seed: Uber Eats (token uber) → Takeaway",
  },
  {
    merchantKey: "chemist",
    parentCategory: "Health & Medical",
    expenseCategory: "Medical Wholesale",
    flowType: "EXPENSE",
    confidence: 92,
    supportCount: 5,
    notes: "Seed: Chemist / pharmacy merchants",
  },
  {
    merchantKey: "chemistwarehouse",
    parentCategory: "Health & Medical",
    expenseCategory: "Medical Wholesale",
    flowType: "EXPENSE",
    confidence: 94,
    supportCount: 5,
    notes: "Seed: Chemist Warehouse",
  },
  {
    merchantKey: "priceline",
    parentCategory: "Personal Care",
    expenseCategory: "Cosmetics",
    flowType: "EXPENSE",
    confidence: 92,
    supportCount: 3,
    notes: "Seed: Priceline",
  },
  {
    merchantKey: "yd",
    parentCategory: "Clothes & Fashion",
    expenseCategory: "Clothing",
    flowType: "EXPENSE",
    confidence: 92,
    supportCount: 4,
    notes: "Seed: YD clothing",
  },
  {
    merchantKey: "amazon",
    parentCategory: "Entertainment",
    expenseCategory: "Streaming",
    flowType: "EXPENSE",
    confidence: 88,
    supportCount: 3,
    notes: "Seed: Amazon Prime / media (review if mixed retail)",
  },
  {
    merchantKey: "vicroads",
    parentCategory: "Finance, Legal & Ins",
    expenseCategory: "Gov Fees & Duties",
    flowType: "EXPENSE",
    confidence: 94,
    supportCount: 3,
    notes: "Seed: VicRoads registration / fees",
  },
  {
    merchantKey: "hoolibank",
    parentCategory: "Income",
    expenseCategory: "Transfers In",
    flowType: "TRANSFER",
    confidence: 90,
    supportCount: 5,
    notes: "Seed: HooliBank sandbox savings transfers",
  },
];

export type SeedSecondaryL3Result = {
  created: number;
  updated: number;
  merchantMapUpserted: number;
  rules: Array<{ id: string; patternValue: string; status: string }>;
};

export async function seedSecondaryL3Rules(): Promise<SeedSecondaryL3Result> {
  const db = getIngestPrisma();
  let created = 0;
  let updated = 0;
  let merchantMapUpserted = 0;
  const rules: SeedSecondaryL3Result["rules"] = [];
  const now = new Date();

  for (const seed of L3_SEED_RULES) {
    const matchSpec: SecondaryMatchSpec = {
      direction: "debit",
      basiqL3Code: seed.l3,
    };

    const existing = await db.secondaryCategoryRule.findFirst({
      where: {
        patternType: "BASIQ_L3",
        patternValue: seed.l3,
        ownerScope: "GLOBAL",
        ownerUserId: null,
      },
    });

    if (existing) {
      const row = await db.secondaryCategoryRule.update({
        where: { id: existing.id },
        data: {
          parentCategory: seed.parentCategory,
          expenseCategory: seed.expenseCategory,
          confidence: seed.confidence,
          supportCount: Math.max(existing.supportCount, seed.supportCount),
          matchSpec: matchSpec as Prisma.InputJsonValue,
          notes: seed.notes,
          status: existing.status === "REVOKED" ? existing.status : "ACTIVE",
          activatedAt:
            existing.status === "REVOKED"
              ? existing.activatedAt
              : existing.activatedAt ?? now,
          requiresApproval: false,
          matcherVersion: SECONDARY_MATCHER_VERSION,
        },
      });
      updated += 1;
      rules.push({
        id: row.id,
        patternValue: row.patternValue,
        status: row.status,
      });
      continue;
    }

    const id = newSecondaryRuleId();
    const row = await db.secondaryCategoryRule.create({
      data: {
        id,
        status: "ACTIVE",
        patternType: "BASIQ_L3",
        patternValue: seed.l3,
        matchSpec: matchSpec as Prisma.InputJsonValue,
        parentCategory: seed.parentCategory,
        expenseCategory: seed.expenseCategory,
        flowType: "EXPENSE",
        confidence: seed.confidence,
        supportCount: seed.supportCount,
        ownerScope: "GLOBAL",
        ownerUserId: null,
        requiresApproval: false,
        matcherVersion: SECONDARY_MATCHER_VERSION,
        createdBy: "system:l3-seed",
        notes: seed.notes,
        activatedAt: now,
      },
    });
    created += 1;
    rules.push({
      id: row.id,
      patternValue: row.patternValue,
      status: row.status,
    });
  }

  for (const seed of MERCHANT_SEED_RULES) {
    const result = await upsertMerchantMapEntry({
      merchantKey: seed.merchantKey,
      parentCategory: seed.parentCategory,
      expenseCategory: seed.expenseCategory,
      flowType: seed.flowType,
      supportCount: seed.supportCount,
      agreementPct: seed.confidence,
      source: "MANUAL",
      createdBy: "system:merchant-seed",
      notes: seed.notes,
      promoteRule: true,
    });
    merchantMapUpserted += 1;
    if (result.ruleId) {
      rules.push({
        id: result.ruleId,
        patternValue: seed.merchantKey,
        status: "ACTIVE",
      });
    }
  }

  invalidateSecondaryRuleCache();
  return { created, updated, merchantMapUpserted, rules };
}
