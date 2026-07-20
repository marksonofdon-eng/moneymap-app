import type { CategorySource, Prisma, TransactionFlow } from "@prisma/client";
import { getIngestPrisma } from "@/server/data/dbContext";
import {
  basiqSubclassCodeFromPayload,
  descriptionFromPayload,
  matchFirstSecondaryRule,
  SECONDARY_MATCHER_VERSION,
} from "@/server/taxonomy/secondaryPatterns/matcher";

export type ActiveSecondaryRule = {
  id: string;
  patternType: "DESC_NORMALIZED" | "BASIQ_L3" | "MERCHANT_TOKEN";
  patternValue: string;
  matchSpec: Prisma.JsonValue;
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  confidence: number;
  matcherVersion: string;
};

let cachedRules: ActiveSecondaryRule[] | null = null;
let cachedAt = 0;
const CACHE_MS = 30_000;

export async function loadActiveGlobalSecondaryRules(
  forceRefresh = false,
): Promise<ActiveSecondaryRule[]> {
  const now = Date.now();
  if (!forceRefresh && cachedRules && now - cachedAt < CACHE_MS) {
    return cachedRules;
  }

  const db = getIngestPrisma();
  const rows = await db.secondaryCategoryRule.findMany({
    where: {
      status: "ACTIVE",
      ownerScope: "GLOBAL",
      requiresApproval: false,
    },
    orderBy: [{ confidence: "desc" }, { supportCount: "desc" }, { id: "asc" }],
    select: {
      id: true,
      patternType: true,
      patternValue: true,
      matchSpec: true,
      parentCategory: true,
      expenseCategory: true,
      flowType: true,
      confidence: true,
      matcherVersion: true,
    },
  });

  cachedRules = rows;
  cachedAt = now;
  return rows;
}

export function invalidateSecondaryRuleCache() {
  cachedRules = null;
  cachedAt = 0;
}

export function applySecondaryToPayload(
  rules: ActiveSecondaryRule[],
  payload: unknown,
  direction: string,
): {
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  categoryConfidence: number;
  categorySource: CategorySource;
  categoryMatcherVersion: string;
  categoryRuleId: string;
  reasons: string[];
} | null {
  const hit = matchFirstSecondaryRule(rules, {
    direction,
    description: descriptionFromPayload(payload),
    basiqSubclassCode: basiqSubclassCodeFromPayload(payload),
  });
  if (!hit) return null;

  return {
    parentCategory: hit.parentCategory,
    expenseCategory: hit.expenseCategory,
    flowType: hit.flowType,
    categoryConfidence: hit.confidence,
    categorySource: "SECONDARY_PATTERN",
    categoryMatcherVersion: hit.matcherVersion || SECONDARY_MATCHER_VERSION,
    categoryRuleId: hit.ruleId,
    reasons: [hit.reason],
  };
}
