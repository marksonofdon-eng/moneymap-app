import type { CategorySource, TransactionFlow } from "@prisma/client";
import { extractTransactionMatchText } from "@/server/internetBills/detector";
import {
  extractBasiqCodes,
  extractBasiqTxClass,
  primaryHasL4,
  type CategoryAssignment,
} from "@/server/taxonomy/categoriser";
import {
  CREDIT_MATCHER_VERSION,
  mapCreditClass,
  matchCreditKeywordRule,
} from "@/server/taxonomy/creditTaxonomy";
import {
  EXPENSE_MAPPING_MATCHER_VERSION,
  isL4UnderL3,
  lookupByL4Code,
  lookupByParentExpense,
} from "@/server/taxonomy/expenseMapping";
import { matchKeywordRule } from "@/server/taxonomy/keywordRules";
import {
  applyMerchantMapToPayload,
  type MerchantMapHit,
} from "@/server/taxonomy/merchantMap";
import {
  type ActiveSecondaryRule,
} from "@/server/taxonomy/secondaryPatterns/loadRules";
import {
  matchSecondaryRule,
  descriptionFromPayload,
  basiqSubclassCodeFromPayload,
} from "@/server/taxonomy/secondaryPatterns/matcher";
import { applyModelToPayload } from "@/server/taxonomy/secondaryModel";

export type SecondaryEnrichmentResult = {
  assignment: CategoryAssignment;
  categoryRuleId: string | null;
  merchantMapMatched: boolean;
  secondaryRuleMatched: boolean;
  modelMatched: boolean;
  keywordMatched: boolean;
  basiqClassMatched: boolean;
  modelShadowSkipped: boolean;
  skippedBecausePrimaryL4: boolean;
  rejectedOutsideBasiqL3: number;
};

type MerchantMapCache = Parameters<typeof applyMerchantMapToPayload>[0];

/**
 * Candidate L4 for L3-scope checks only — never persisted as a Basiq source field.
 * Persisted subclass/group codes come only from what Basiq actually sent.
 */
function candidateL4ForScope(
  parentCategory: string,
  expenseCategory: string,
  explicitL4?: string | null,
): string | null {
  if (explicitL4) return explicitL4;
  return lookupByParentExpense(parentCategory, expenseCategory)?.basiqL4Code ?? null;
}

function fromLabels(input: {
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  categorySource: CategorySource;
  categoryMatcherVersion: string;
  categoryConfidence: number;
  basiqTxClass: string | null;
  reasons: string[];
  /** Basiq L3 from raw payload only (null if Basiq did not send L3). */
  basiqGroupCode: number | null;
  /** Mapping L4 used solely to validate against Basiq L3 scope; not persisted. */
  explicitL4?: string | null;
}): CategoryAssignment & { scopeL4: string | null } {
  return {
    // Never invent Basiq L4 — secondary only enriches UI Parent/Expense.
    subclassCode: null,
    groupCode: input.basiqGroupCode,
    parentCategory: input.parentCategory,
    expenseCategory: input.expenseCategory,
    flowType: input.flowType,
    basiqTxClass: input.basiqTxClass,
    categoryConfidence: input.categoryConfidence,
    categorySource: input.categorySource,
    categoryMatcherVersion: input.categoryMatcherVersion,
    reasons: input.reasons,
    scopeL4: candidateL4ForScope(
      input.parentCategory,
      input.expenseCategory,
      input.explicitL4,
    ),
  };
}

function emptyResult(
  primary: CategoryAssignment,
  extras?: Partial<SecondaryEnrichmentResult>,
): SecondaryEnrichmentResult {
  return {
    assignment: primary,
    categoryRuleId: null,
    merchantMapMatched: false,
    secondaryRuleMatched: false,
    modelMatched: false,
    keywordMatched: false,
    basiqClassMatched: false,
    modelShadowSkipped: false,
    skippedBecausePrimaryL4: false,
    rejectedOutsideBasiqL3: 0,
    ...extras,
  };
}

/**
 * Basiq hierarchy scope for secondary:
 * - If Basiq gave a real L4 → secondary is skipped by primaryHasL4 (primary owns the label).
 * - If Basiq gave an L3 (or L4 that implies L3 while L4 unmapped) → secondary may only
 *   assign an L4 that belongs under that L3 in end_user_expense_mapping.csv.
 */
function basiqL3Scope(payload: unknown): string | null {
  const { l4, l3 } = extractBasiqCodes(payload);
  if (l4) {
    const row = lookupByL4Code(l4);
    if (row) return String(row.basiqL3Code);
    // Unknown L4 code: still prefer explicit L3 from payload if present.
  }
  if (l3 && l3 !== "0") return l3;
  return null;
}

function assignmentWithinBasiqL3Scope(
  assignment: CategoryAssignment & { scopeL4?: string | null },
  scopeL3: string | null,
): boolean {
  if (!scopeL3) return true;
  // Credits / non-expense labels have no ANZSIC L4 constraint.
  if (assignment.flowType && assignment.flowType !== "EXPENSE") return true;

  const candidateL4 =
    assignment.scopeL4 ??
    (assignment.parentCategory && assignment.expenseCategory
      ? candidateL4ForScope(
          assignment.parentCategory,
          assignment.expenseCategory,
        )
      : null);

  if (candidateL4) {
    return isL4UnderL3(candidateL4, scopeL3);
  }

  // No mapping L4 for this label — constrain via Parent/Expense L3 if any.
  if (assignment.parentCategory && assignment.expenseCategory) {
    const row = lookupByParentExpense(
      assignment.parentCategory,
      assignment.expenseCategory,
    );
    if (!row) {
      // Income-style labels etc. not in expense map — allow.
      return true;
    }
    return String(row.basiqL3Code) === scopeL3;
  }

  return true;
}

/**
 * Secondary enrichment: fills UI Parent/Expense when primary left L4 empty.
 * Never invents or writes Basiq L4 into subclassCode; groupCode mirrors Basiq L3 only.
 * When Basiq provided an L3, candidate labels must map to an L4 under that L3.
 */
export function applySecondaryEnrichment(
  primary: CategoryAssignment,
  input: {
    payload: unknown;
    direction: string;
    secondaryRules: ActiveSecondaryRule[];
    merchantMap: MerchantMapCache;
    shadowModel?: boolean;
  },
): SecondaryEnrichmentResult {
  // Basiq L4 already mapped in primary → do not run secondary at all.
  if (primaryHasL4(primary)) {
    return emptyResult(primary, { skippedBecausePrimaryL4: true });
  }

  const text = extractTransactionMatchText(input.payload);
  const basiqTxClass =
    primary.basiqTxClass ?? extractBasiqTxClass(input.payload);
  const scopeL3 = basiqL3Scope(input.payload);
  /** Denormalized Basiq L3 only — never invent L3/L4 for secondary. */
  const basiqGroupCode = scopeL3 ? Number(scopeL3) : null;
  const isCredit = input.direction.toLowerCase() === "credit";
  let rejectedOutsideBasiqL3 = 0;

  const accept = (
    labelled: CategoryAssignment & { scopeL4: string | null },
    flags: Partial<SecondaryEnrichmentResult>,
  ): SecondaryEnrichmentResult | null => {
    if (!assignmentWithinBasiqL3Scope(labelled, scopeL3)) {
      rejectedOutsideBasiqL3 += 1;
      return null;
    }
    const { scopeL4: _scopeL4, ...assignment } = labelled;
    return {
      ...emptyResult(primary),
      assignment,
      rejectedOutsideBasiqL3,
      ...flags,
    };
  };

  // 1) Description keywords
  if (isCredit) {
    const creditKw = matchCreditKeywordRule(text);
    if (creditKw) {
      const hit = accept(
        fromLabels({
          parentCategory: creditKw.parentCategory,
          expenseCategory: creditKw.incomeCategory,
          flowType: creditKw.flowType,
          categorySource: "KEYWORD",
          categoryMatcherVersion: CREDIT_MATCHER_VERSION,
          categoryConfidence: creditKw.confidence,
          basiqTxClass,
          reasons: [`credit_keyword:${creditKw.incomeCategory}`],
          basiqGroupCode,
        }),
        { keywordMatched: true },
      );
      if (hit) return hit;
    }
  } else {
    const keyword = matchKeywordRule(text);
    if (keyword) {
      const hit = accept(
        fromLabels({
          parentCategory: keyword.parentCategory,
          expenseCategory: keyword.expenseCategory,
          flowType: "EXPENSE",
          categorySource: "KEYWORD",
          categoryMatcherVersion: EXPENSE_MAPPING_MATCHER_VERSION,
          categoryConfidence: keyword.confidence,
          basiqTxClass,
          reasons: [keyword.reason],
          explicitL4: keyword.basiqL4Code,
          basiqGroupCode,
        }),
        { keywordMatched: true },
      );
      if (hit) return hit;
    }
  }

  // 2) Credits: Basiq transaction class
  if (isCredit) {
    const classMap = mapCreditClass(basiqTxClass);
    if (classMap) {
      const hit = accept(
        fromLabels({
          parentCategory: classMap.parentCategory,
          expenseCategory: classMap.incomeCategory,
          flowType: classMap.flowType,
          categorySource: "BASIQ_CLASS",
          categoryMatcherVersion: CREDIT_MATCHER_VERSION,
          categoryConfidence: 70,
          basiqTxClass: classMap.basiqTxClass,
          reasons: [`credit_class:${classMap.basiqTxClass}`],
          basiqGroupCode,
        }),
        { basiqClassMatched: true },
      );
      if (hit) return hit;
    }
  }

  // 3) Merchant map
  const mapHit: MerchantMapHit | null = applyMerchantMapToPayload(
    input.merchantMap,
    input.payload,
  );
  if (mapHit) {
    const hit = accept(
      fromLabels({
        parentCategory: mapHit.parentCategory,
        expenseCategory: mapHit.expenseCategory,
        flowType: mapHit.flowType,
        categorySource: mapHit.categorySource,
        categoryMatcherVersion: mapHit.categoryMatcherVersion,
        categoryConfidence: mapHit.categoryConfidence,
        basiqTxClass,
        reasons: mapHit.reasons,
        basiqGroupCode,
      }),
      {
        categoryRuleId: mapHit.categoryRuleId,
        merchantMapMatched: true,
      },
    );
    if (hit) return hit;
  }

  // 4) Deterministic secondary rules — try in order; skip any outside Basiq L3 scope
  for (const rule of input.secondaryRules) {
    if (
      scopeL3 &&
      rule.patternType === "BASIQ_L3" &&
      rule.patternValue !== scopeL3
    ) {
      continue;
    }
    const ruleHit = matchSecondaryRule(rule, {
      direction: input.direction,
      description: descriptionFromPayload(input.payload),
      basiqSubclassCode: basiqSubclassCodeFromPayload(input.payload),
    });
    if (!ruleHit) continue;

    const hit = accept(
      fromLabels({
        parentCategory: rule.parentCategory,
        expenseCategory: rule.expenseCategory,
        flowType: rule.flowType,
        categorySource: "SECONDARY_PATTERN",
        categoryMatcherVersion: rule.matcherVersion,
        categoryConfidence: rule.confidence,
        basiqTxClass,
        reasons: [ruleHit.reason],
        basiqGroupCode,
      }),
      {
        categoryRuleId: rule.id,
        secondaryRuleMatched: true,
      },
    );
    if (hit) return hit;
  }

  // 5) Confidence-gated model
  const modelHit = applyModelToPayload(input.payload, input.direction, {
    shadow: input.shadowModel,
  });
  if (modelHit) {
    const hit = accept(
      fromLabels({
        parentCategory: modelHit.parentCategory,
        expenseCategory: modelHit.expenseCategory,
        flowType: modelHit.flowType,
        categorySource: modelHit.categorySource,
        categoryMatcherVersion: modelHit.categoryMatcherVersion,
        categoryConfidence: modelHit.confidence,
        basiqTxClass,
        reasons: modelHit.reasons,
        basiqGroupCode,
      }),
      { modelMatched: true },
    );
    if (hit) return hit;
  }

  const shadowSkipped =
    input.shadowModel === true ||
    process.env.CATEGORY_MODEL_SHADOW === "1" ||
    process.env.CATEGORY_MODEL_SHADOW === "true";

  return emptyResult(primary, {
    modelShadowSkipped: shadowSkipped,
    rejectedOutsideBasiqL3,
  });
}
