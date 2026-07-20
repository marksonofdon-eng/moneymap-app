import type { CategorySource, TransactionFlow } from "@prisma/client";
import { withOwnerContext } from "@/server/data/dbContext";
import {
  categoriseTransaction,
  extractBasiqCodes,
  extractBasiqTxClass,
  primaryHasL4,
} from "@/server/taxonomy/categoriser";
import { CREDIT_MATCHER_VERSION } from "@/server/taxonomy/creditTaxonomy";
import { EXPENSE_MAPPING_MATCHER_VERSION } from "@/server/taxonomy/expenseMapping";
import {
  loadMerchantCategoryMap,
  MERCHANT_MAP_MATCHER_VERSION,
} from "@/server/taxonomy/merchantMap";
import { applySecondaryEnrichment } from "@/server/taxonomy/secondaryPatterns/applySecondaryEnrichment";
import { loadActiveGlobalSecondaryRules } from "@/server/taxonomy/secondaryPatterns/loadRules";
import { SECONDARY_MATCHER_VERSION } from "@/server/taxonomy/secondaryPatterns/matcher";
import {
  loadCategoryModel,
  MODEL_MATCHER_PREFIX,
  resolveModelVersion,
} from "@/server/taxonomy/secondaryModel";

/**
 * Denormalize Basiq ANZSIC codes from the raw payload only.
 * Never invent L3/L4 — if Basiq left them empty, columns stay null.
 */
function basiqCodesForPersist(
  payload: unknown,
  knownSubclasses: Set<string>,
): { subclassCode: string | null; groupCode: number | null } {
  const { l4, l3 } = extractBasiqCodes(payload);
  const subclassCode =
    l4 && l4 !== "0" && knownSubclasses.has(l4) ? l4 : null;
  const groupCode =
    l3 && l3 !== "0" && Number.isFinite(Number(l3)) ? Number(l3) : null;
  return { subclassCode, groupCode };
}
export type CategorisationRun = {
  transactionsScanned: number;
  updated: number;
  matched: number;
  unmatched: number;
  primaryL4Matched: number;
  secondaryMatched: number;
  merchantMapMatched: number;
  keywordMatched: number;
  basiqClassMatched: number;
  modelMatched: number;
  modelShadowSkipped: number;
  matcherVersion: string;
};

const BATCH_SIZE = 40;

function activeMatcherVersions(): string[] {
  const versions = [
    EXPENSE_MAPPING_MATCHER_VERSION,
    CREDIT_MATCHER_VERSION,
    SECONDARY_MATCHER_VERSION,
    MERCHANT_MAP_MATCHER_VERSION,
  ];
  const modelVer = resolveModelVersion();
  if (modelVer) {
    versions.push(
      modelVer.startsWith(MODEL_MATCHER_PREFIX)
        ? modelVer
        : `${MODEL_MATCHER_PREFIX}${modelVer}`,
    );
  }
  const loaded = loadCategoryModel();
  if (loaded?.version && !versions.includes(loaded.version)) {
    versions.push(loaded.version);
  }
  return versions;
}

export async function categoriseTransactionsForOwner(
  ownerUserId: string,
  options?: { force?: boolean; shadowModel?: boolean },
): Promise<CategorisationRun> {
  const force = options?.force === true;
  const shadowModel = options?.shadowModel;

  const knownSubclasses = await withOwnerContext(ownerUserId, async (db) => {
    const rows = await db.spendCategory.findMany({
      select: { subclassCode: true },
    });
    return new Set(rows.map((row) => row.subclassCode));
  });

  const [secondaryRules, merchantMap] = await Promise.all([
    loadActiveGlobalSecondaryRules(),
    loadMerchantCategoryMap(),
  ]);

  const matcherVersions = activeMatcherVersions();

  const transactions = await withOwnerContext(ownerUserId, async (db) =>
    db.basiqTransaction.findMany({
      where: {
        ownerUserId,
        ...(force
          ? {}
          : {
              OR: [
                { categorySource: null },
                {
                  categoryMatcherVersion: {
                    notIn: matcherVersions,
                  },
                },
                { categoryMatcherVersion: null },
                { categorySource: "UNMATCHED" },
              ],
            }),
      },
      select: {
        transactionId: true,
        rawPayload: true,
        direction: true,
        parentCategory: true,
        expenseCategory: true,
        categorySource: true,
        categoryRuleId: true,
        subclassCode: true,
      },
    }),
  );

  let updated = 0;
  let matched = 0;
  let unmatched = 0;
  let primaryL4Matched = 0;
  let secondaryMatched = 0;
  let merchantMapMatched = 0;
  let keywordMatched = 0;
  let basiqClassMatched = 0;
  let modelMatched = 0;
  let modelShadowSkipped = 0;
  const now = new Date();

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    await withOwnerContext(
      ownerUserId,
      async (db) => {
        for (const row of batch) {
          const payload =
            row.rawPayload && typeof row.rawPayload === "object"
              ? {
                  ...(row.rawPayload as Record<string, unknown>),
                  direction:
                    (row.rawPayload as Record<string, unknown>).direction ??
                    row.direction,
                }
              : { direction: row.direction };

          const primary = categoriseTransaction(payload);
          if (primaryHasL4(primary)) primaryL4Matched += 1;

          const secondary = applySecondaryEnrichment(primary, {
            payload,
            direction: row.direction,
            secondaryRules,
            merchantMap,
            shadowModel,
          });

          const assignment = secondary.assignment;
          const categoryRuleId = secondary.categoryRuleId;

          if (secondary.merchantMapMatched) {
            merchantMapMatched += 1;
            secondaryMatched += 1;
          } else if (secondary.secondaryRuleMatched) {
            secondaryMatched += 1;
          } else if (secondary.keywordMatched) {
            keywordMatched += 1;
            secondaryMatched += 1;
          } else if (secondary.basiqClassMatched) {
            basiqClassMatched += 1;
            secondaryMatched += 1;
          } else if (secondary.modelMatched) {
            modelMatched += 1;
            secondaryMatched += 1;
          }
          if (secondary.modelShadowSkipped) modelShadowSkipped += 1;

          // Basiq source columns: only denormalize what Basiq sent (never invent).
          const basiqCodes = basiqCodesForPersist(payload, knownSubclasses);
          // UI enrichment only — Parent/Expense/flow/source/confidence/etc.
          const matchedUi =
            Boolean(assignment.parentCategory) &&
            Boolean(assignment.expenseCategory) &&
            assignment.categorySource !== "UNMATCHED";
          if (!matchedUi) unmatched += 1;
          else matched += 1;

          const fromParent = row.parentCategory;
          const fromExpense = row.expenseCategory;
          const fromSource = row.categorySource;

          await db.basiqTransaction.update({
            where: { transactionId: row.transactionId },
            data: {
              subclassCode: basiqCodes.subclassCode,
              groupCode: basiqCodes.groupCode,
              parentCategory: assignment.parentCategory,
              expenseCategory: assignment.expenseCategory,
              flowType: assignment.flowType,
              basiqTxClass:
                extractBasiqTxClass(payload) ?? assignment.basiqTxClass,
              categoryConfidence: assignment.categoryConfidence,
              categorySource: assignment.categorySource,
              categoryMatcherVersion: assignment.categoryMatcherVersion,
              categoryRuleId,
              categorisedAt: now,
            },
          });

          const changed =
            fromParent !== assignment.parentCategory ||
            fromExpense !== assignment.expenseCategory ||
            fromSource !== assignment.categorySource ||
            row.categoryRuleId !== categoryRuleId;

          if (changed) {
            await db.categoryAssignmentEvent.create({
              data: {
                transactionId: row.transactionId,
                ownerUserId,
                ruleId: categoryRuleId,
                categorySource: assignment.categorySource,
                fromParent,
                fromExpense,
                fromSource: fromSource as CategorySource | null,
                toParent: assignment.parentCategory,
                toExpense: assignment.expenseCategory,
                toSource: assignment.categorySource,
                toFlowType: assignment.flowType as TransactionFlow | null,
                matcherVersion: assignment.categoryMatcherVersion,
                reason: assignment.reasons[0] ?? "categorise",
              },
            });
          }

          updated += 1;
        }
      },
      { timeoutMs: 60_000 },
    );
  }

  const modelVer = resolveModelVersion() ?? "none";
  return {
    transactionsScanned: transactions.length,
    updated,
    matched,
    unmatched,
    primaryL4Matched,
    secondaryMatched,
    merchantMapMatched,
    keywordMatched,
    basiqClassMatched,
    modelMatched,
    modelShadowSkipped,
    matcherVersion: `${EXPENSE_MAPPING_MATCHER_VERSION}+${CREDIT_MATCHER_VERSION}+${SECONDARY_MATCHER_VERSION}+${MERCHANT_MAP_MATCHER_VERSION}+model:${modelVer}`,
  };
}
