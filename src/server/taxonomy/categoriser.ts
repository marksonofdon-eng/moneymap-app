import { CategorySource, TransactionFlow } from "@prisma/client";
import { normalizeBasiqTxClass } from "@/server/taxonomy/creditTaxonomy";
import {
  EXPENSE_MAPPING_MATCHER_VERSION,
  classifyBasiqAnzsicCode,
  lookupByL4Code,
  mappingToAssignmentFields,
  type ExpenseMappingRow,
} from "@/server/taxonomy/expenseMapping";

export type CategoryAssignment = {
  subclassCode: string | null;
  groupCode: number | null;
  parentCategory: string | null;
  expenseCategory: string | null;
  flowType: TransactionFlow | null;
  basiqTxClass: string | null;
  categoryConfidence: number;
  categorySource: CategorySource;
  categoryMatcherVersion: string;
  reasons: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAtPath(raw: unknown, path: readonly string[]): unknown {
  let value: unknown = raw;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = value[key];
  }
  return value;
}

function extractDirection(raw: unknown): "credit" | "debit" | null {
  const direction = valueAtPath(raw, ["direction"]);
  if (typeof direction !== "string") return null;
  const normalized = direction.trim().toLowerCase();
  if (normalized === "credit" || normalized === "debit") return normalized;
  return null;
}

export function extractBasiqTxClass(raw: unknown): string | null {
  return (
    normalizeBasiqTxClass(valueAtPath(raw, ["class"])) ||
    normalizeBasiqTxClass(valueAtPath(raw, ["_class"])) ||
    normalizeBasiqTxClass(valueAtPath(raw, ["enrich", "class"]))
  );
}

/**
 * Extract Basiq ANZSIC codes from the payload only (no invented labels).
 * When a real L4 is present it is master: L3 is taken from that L4's mapping parent.
 */
export function extractBasiqCodes(raw: unknown): {
  l4: string | null;
  l3: string | null;
} {
  const fromSubClass = classifyBasiqAnzsicCode(
    valueAtPath(raw, ["subClass", "code"]) ??
      valueAtPath(raw, ["enrich", "subClass", "code"]),
  );
  const fromEnrichSub = classifyBasiqAnzsicCode(
    valueAtPath(raw, ["enrich", "subClass", "code"]),
  );
  const fromCategory = classifyBasiqAnzsicCode(
    valueAtPath(raw, ["enrich", "category", "code"]),
  );

  const l4 =
    fromSubClass.l4 || fromEnrichSub.l4 || fromCategory.l4 || null;

  // L4 is master: parent L3 must be the mapping parent of that L4.
  if (l4) {
    const row = lookupByL4Code(l4);
    return {
      l4,
      l3: row ? String(row.basiqL3Code) : fromSubClass.l3 || fromCategory.l3,
    };
  }

  const l3 =
    fromSubClass.l3 || fromEnrichSub.l3 || fromCategory.l3 || null;
  return { l4: null, l3 };
}

function fromMapping(
  row: ExpenseMappingRow,
  source: CategorySource,
  confidence: number,
  reason: string,
  basiqTxClass: string | null,
): CategoryAssignment {
  const fields = mappingToAssignmentFields(row);
  return {
    ...fields,
    flowType: "EXPENSE",
    basiqTxClass,
    categoryConfidence: confidence,
    categorySource: source,
    categoryMatcherVersion: EXPENSE_MAPPING_MATCHER_VERSION,
    reasons: [reason],
  };
}

function emptyPrimary(
  basiqTxClass: string | null,
  matcherVersion: string,
  reason: string,
): CategoryAssignment {
  return {
    subclassCode: null,
    groupCode: null,
    parentCategory: null,
    expenseCategory: null,
    flowType: null,
    basiqTxClass,
    categoryConfidence: 0,
    categorySource: "UNMATCHED",
    categoryMatcherVersion: matcherVersion,
    reasons: [reason],
  };
}

/**
 * Credits have no ANZSIC L4 — primary leaves user categories empty.
 * Basiq class / description labelling happens in secondary.
 */
function categoriseCreditPrimary(raw: unknown): CategoryAssignment {
  return emptyPrimary(
    extractBasiqTxClass(raw),
    EXPENSE_MAPPING_MATCHER_VERSION,
    "credit_primary_no_l4",
  );
}

/**
 * Debits primary: ONLY when Basiq provides a real L4 → map Parent/Expense.
 * L3-only, enrich-empty, merchant-empty, title-only → leave user categories untouched.
 */
function categoriseDebitPrimary(raw: unknown): CategoryAssignment {
  const { l4 } = extractBasiqCodes(raw);
  const basiqTxClass = extractBasiqTxClass(raw);

  if (l4 && l4 !== "0") {
    const byL4 = lookupByL4Code(l4);
    if (byL4) {
      return fromMapping(
        byL4,
        "BASIQ_ENRICH",
        90,
        `basiq_l4:${byL4.basiqL4Code}`,
        basiqTxClass ?? "payment",
      );
    }
  }

  return emptyPrimary(
    basiqTxClass,
    EXPENSE_MAPPING_MATCHER_VERSION,
    "primary_no_basiq_l4",
  );
}

/** True when primary already stamped a Basiq L4 (secondary must not touch). */
export function primaryHasL4(assignment: CategoryAssignment): boolean {
  return Boolean(assignment.subclassCode && assignment.subclassCode !== "0");
}

/**
 * Primary categoriser: user expense categories only when Basiq L4 is populated.
 */
export function categoriseTransaction(rawPayload: unknown): CategoryAssignment {
  const direction = extractDirection(rawPayload);
  if (direction === "credit") {
    return categoriseCreditPrimary(rawPayload);
  }
  return categoriseDebitPrimary(rawPayload);
}
