import { getIngestPrisma } from "@/server/data/dbContext";
import { invalidateSecondaryRuleCache } from "@/server/taxonomy/secondaryPatterns/loadRules";
import { SECONDARY_MATCHER_VERSION } from "@/server/taxonomy/secondaryPatterns/matcher";

export type RevokeSecondaryRuleResult = {
  ruleId: string;
  status: string;
  rolledBack: number;
};

export async function disableSecondaryRule(ruleId: string): Promise<{
  ruleId: string;
  status: string;
}> {
  const db = getIngestPrisma();
  const row = await db.secondaryCategoryRule.update({
    where: { id: ruleId },
    data: {
      status: "DISABLED",
      disabledAt: new Date(),
    },
  });
  invalidateSecondaryRuleCache();
  return { ruleId: row.id, status: row.status };
}

/**
 * Revoke a secondary rule and roll back txs stamped with that rule id to UNMATCHED.
 * Clears UI enrichment fields only — does not invent or mutate Basiq source columns
 * (`rawPayload`, `subclassCode`, `groupCode`). Re-run force categorise to re-sync denorm codes.
 */
export async function revokeSecondaryRule(
  ruleId: string,
  options?: { rollback?: boolean },
): Promise<RevokeSecondaryRuleResult> {
  const db = getIngestPrisma();
  const rollback = options?.rollback !== false;
  const now = new Date();

  const rule = await db.secondaryCategoryRule.update({
    where: { id: ruleId },
    data: {
      status: "REVOKED",
      revokedAt: now,
      disabledAt: now,
    },
  });

  let rolledBack = 0;
  if (rollback) {
    const txs = await db.basiqTransaction.findMany({
      where: { categoryRuleId: ruleId },
      select: {
        transactionId: true,
        ownerUserId: true,
        parentCategory: true,
        expenseCategory: true,
        categorySource: true,
      },
    });

    for (const tx of txs) {
      await db.basiqTransaction.update({
        where: { transactionId: tx.transactionId },
        data: {
          // UI enrichment rollback only — do not invent or clear Basiq denorm codes here.
          // Force categorise re-syncs subclass/group from rawPayload.
          parentCategory: null,
          expenseCategory: null,
          flowType: null,
          categorySource: "UNMATCHED",
          categoryConfidence: 0,
          categoryMatcherVersion: SECONDARY_MATCHER_VERSION,
          categoryRuleId: null,
          categorisedAt: now,
        },
      });

      await db.categoryAssignmentEvent.create({
        data: {
          transactionId: tx.transactionId,
          ownerUserId: tx.ownerUserId,
          ruleId,
          categorySource: "SECONDARY_PATTERN",
          fromParent: tx.parentCategory,
          fromExpense: tx.expenseCategory,
          fromSource: tx.categorySource,
          toParent: null,
          toExpense: null,
          toSource: "UNMATCHED",
          toFlowType: null,
          matcherVersion: SECONDARY_MATCHER_VERSION,
          reason: `revoke_rollback:${ruleId}`,
        },
      });
      rolledBack += 1;
    }
  }

  invalidateSecondaryRuleCache();
  return { ruleId: rule.id, status: rule.status, rolledBack };
}
