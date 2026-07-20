import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ExpenseMappingRow = {
  basiqL3Code: number;
  basiqL3Name: string;
  basiqL4Code: string;
  basiqL4Name: string;
  parentCategory: string;
  expenseCategory: string;
};

export const EXPENSE_MAPPING_CSV = "end_user_expense_mapping.csv";
export const EXPENSE_MAPPING_MATCHER_VERSION = "expense-map-v5";

/** Canonical Basiq L4 for home broadband / internet retail. */
export const INTERNET_BASIQ_L4 = "5801";
export const INTERNET_BASIQ_L3 = 580;
export const INTERNET_PARENT_CATEGORY = "Utilities & Bills";
export const INTERNET_EXPENSE_CATEGORY = "Internet";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function normalizeBasiqCode(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const digits = raw.replace(/^[A-Za-z]+/, "").replace(/[^0-9]/g, "");
  return digits || null;
}

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function loadMappingRows(): ExpenseMappingRow[] {
  const csvPath = resolve(process.cwd(), EXPENSE_MAPPING_CSV);
  const raw = readFileSync(csvPath, "utf8");
  const rows = parseCsv(raw);
  const [header, ...dataRows] = rows;
  if (!header || header[0] !== "basiq_l3_code") {
    throw new Error(`Unexpected expense mapping header in ${csvPath}`);
  }

  const out: ExpenseMappingRow[] = [];
  for (const cols of dataRows) {
    if (cols.length < 6) continue;
    const l3 = Number(cols[0]);
    const l4 = normalizeBasiqCode(cols[2]);
    const parent = cols[4]?.trim();
    const expense = cols[5]?.trim();
    if (!Number.isFinite(l3) || !l4 || !parent || !expense) continue;
    out.push({
      basiqL3Code: l3,
      basiqL3Name: cols[1]?.trim() || `L3 ${l3}`,
      basiqL4Code: l4,
      basiqL4Name: cols[3]?.trim() || `L4 ${l4}`,
      parentCategory: parent,
      expenseCategory: expense,
    });
  }
  return out;
}

let cachedRows: ExpenseMappingRow[] | null = null;
let byL4: Map<string, ExpenseMappingRow> | null = null;
let byL3: Map<number, ExpenseMappingRow[]> | null = null;
let byL4Title: Map<string, ExpenseMappingRow> | null = null;

function ensureIndexes() {
  if (cachedRows && byL4 && byL3 && byL4Title) return;
  cachedRows = loadMappingRows();
  byL4 = new Map();
  byL3 = new Map();
  byL4Title = new Map();
  for (const row of cachedRows) {
    byL4.set(row.basiqL4Code, row);
    const list = byL3.get(row.basiqL3Code) ?? [];
    list.push(row);
    byL3.set(row.basiqL3Code, list);
    byL4Title.set(normalizeTitle(row.basiqL4Name), row);
  }
}

export function getExpenseMappingRows(): ExpenseMappingRow[] {
  ensureIndexes();
  return cachedRows!;
}

export function lookupByL4Code(code: unknown): ExpenseMappingRow | null {
  ensureIndexes();
  const normalized = normalizeBasiqCode(code);
  if (!normalized) return null;
  return byL4!.get(normalized) ?? null;
}

/** True when code is a known Basiq L3 group in the end-user mapping. */
export function isKnownL3Code(code: unknown): boolean {
  ensureIndexes();
  const normalized = normalizeBasiqCode(code);
  if (!normalized) return false;
  return byL3!.has(Number(normalized));
}

/**
 * Classify a Basiq ANZSIC-like code as L4 and/or L3.
 *
 * Important: short codes often collide (e.g. `411` is both an L3 supermarket group
 * and a bogus L4 coal-mining row). Prefer **known L3 groups** over L4 lookup so
 * Basiq's coarse `subClass.code` is not mistaken for a fine L4.
 * True L4s (typically 4+ digits, or L4-only codes) still win via L4 lookup.
 */
export function classifyBasiqAnzsicCode(code: unknown): {
  l4: string | null;
  l3: string | null;
} {
  const normalized = normalizeBasiqCode(code);
  if (!normalized || normalized === "0") return { l4: null, l3: null };

  // Known L3 group in the mapping → never treat as L4 (avoids 411 → Bulk Fuel).
  if (isKnownL3Code(normalized)) {
    return { l4: null, l3: normalized };
  }

  const asL4 = lookupByL4Code(normalized);
  if (asL4) {
    return { l4: normalized, l3: String(asL4.basiqL3Code) };
  }

  // Unknown: 4+ digits → attempt as L4; shorter → L3 group only.
  if (normalized.length >= 4) return { l4: normalized, l3: null };
  return { l4: null, l3: normalized };
}

export function lookupByL3Code(code: unknown): ExpenseMappingRow | null {
  ensureIndexes();
  const normalized = normalizeBasiqCode(code);
  if (!normalized) return null;
  const list = byL3!.get(Number(normalized));
  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];
  return null;
}

/** All mapping rows under a Basiq L3 group. */
export function listL4RowsForL3(code: unknown): ExpenseMappingRow[] {
  ensureIndexes();
  const normalized = normalizeBasiqCode(code);
  if (!normalized) return [];
  return [...(byL3!.get(Number(normalized)) ?? [])];
}

/** True when L4 belongs to the given L3 in the end-user mapping. */
export function isL4UnderL3(l4Code: unknown, l3Code: unknown): boolean {
  const l4 = normalizeBasiqCode(l4Code);
  const l3 = normalizeBasiqCode(l3Code);
  if (!l4 || !l3) return false;
  const row = lookupByL4Code(l4);
  if (!row) return false;
  return String(row.basiqL3Code) === l3;
}

export function lookupByL4Title(title: string): ExpenseMappingRow | null {
  ensureIndexes();
  const key = normalizeTitle(title);
  if (!key) return null;
  const exact = byL4Title!.get(key);
  if (exact) return exact;
  for (const [mappedTitle, row] of byL4Title!) {
    if (key.includes(mappedTitle) || mappedTitle.includes(key)) return row;
  }
  return null;
}

export function mappingToAssignmentFields(row: ExpenseMappingRow) {
  return {
    subclassCode: row.basiqL4Code,
    groupCode: row.basiqL3Code,
    parentCategory: row.parentCategory,
    expenseCategory: row.expenseCategory,
  };
}

/** First mapping row for a Parent/Expense pair (used when secondary fills L4). */
export function lookupByParentExpense(
  parentCategory: string,
  expenseCategory: string,
): ExpenseMappingRow | null {
  ensureIndexes();
  for (const row of cachedRows!) {
    if (
      row.parentCategory === parentCategory &&
      row.expenseCategory === expenseCategory
    ) {
      return row;
    }
  }
  return null;
}
