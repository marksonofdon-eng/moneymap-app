import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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

function normCode(value: string): string {
  if (!value) return "";
  return value
    .trim()
    .replace(/^[A-Za-z]+/, "")
    .replace(/[^0-9]/g, "");
}

type Missing = {
  title: string;
  count: number;
  rawCodes: Set<string>;
};

const uncPath = resolve(process.cwd(), "uncategorised_transactions.csv");
const mapPath = resolve(process.cwd(), "end_user_expense_mapping.csv");

const unc = parseCsv(readFileSync(uncPath, "utf8"));
const [uh, ...udata] = unc;
const uidx = Object.fromEntries(uh.map((h, i) => [h, i]));

const mapRows = parseCsv(readFileSync(mapPath, "utf8"));
const [mh, ...mdata] = mapRows;
const midx = Object.fromEntries(mh.map((h, i) => [h, i]));
const l4Set = new Set(
  mdata.map((r) => String(r[midx.basiq_l4_code] ?? "").trim()).filter(Boolean),
);

const missingCodes = new Map<string, Missing>();
const presentButUnmatched = new Map<string, { title: string; count: number }>();
const titleOnly = new Map<string, number>();
let withSubclass = 0;

for (const r of udata) {
  if (!r.length || r.every((c) => !c)) continue;
  const codeRaw = (r[uidx.basiq_subclass_code] ?? "").trim();
  const title = (r[uidx.basiq_subclass_title] ?? "").trim();
  const code = normCode(codeRaw);
  if (!code && !title) continue;
  withSubclass += 1;

  if (code) {
    if (!l4Set.has(code)) {
      const cur = missingCodes.get(code) ?? {
        title,
        count: 0,
        rawCodes: new Set<string>(),
      };
      cur.count += 1;
      cur.title = cur.title || title;
      cur.rawCodes.add(codeRaw);
      missingCodes.set(code, cur);
    } else {
      const cur = presentButUnmatched.get(code) ?? { title, count: 0 };
      cur.count += 1;
      presentButUnmatched.set(code, cur);
    }
  } else {
    titleOnly.set(title, (titleOnly.get(title) ?? 0) + 1);
  }
}

const missingList = [...missingCodes.entries()]
  .sort((a, b) => b[1].count - a[1].count)
  .map(([code, v]) => ({
    basiq_l4_code: code,
    basiq_subclass_title: v.title,
    raw_codes: [...v.rawCodes].join("|"),
    txn_count: v.count,
  }));

const summary = {
  uncategorisedTotal: udata.filter((r) => r.length && r.some((c) => c)).length,
  withSubclassSignal: withSubclass,
  missingFromMasterDistinctL4: missingList.length,
  missingFromMasterTxnCount: missingList.reduce((s, x) => s + x.txn_count, 0),
  presentInMasterButStillUnmatched: [...presentButUnmatched.entries()].map(
    ([code, v]) => ({ code, title: v.title, count: v.count }),
  ),
  titleOnlyNoCode: [...titleOnly.entries()].map(([title, count]) => ({
    title,
    count,
  })),
  missingCodes: missingList,
};

const reportPath = resolve(process.cwd(), "missing_basiq_subclasses.csv");
const reportLines = [
  "basiq_l4_code,basiq_subclass_title,raw_codes,txn_count",
  ...missingList.map((row) =>
    [row.basiq_l4_code, row.basiq_subclass_title, row.raw_codes, row.txn_count]
      .map((v) => {
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(","),
  ),
];
writeFileSync(reportPath, `${reportLines.join("\n")}\n`, "utf8");

console.log(JSON.stringify({ ...summary, reportPath }, null, 2));
