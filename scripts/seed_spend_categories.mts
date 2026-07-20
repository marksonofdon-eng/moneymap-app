import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/db";
import {
  EXPENSE_MAPPING_CSV,
  normalizeBasiqCode,
} from "../src/server/taxonomy/expenseMapping";

/** Minimal CSV parser that respects double-quoted fields. */
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

async function main() {
  const csvPath = resolve(process.cwd(), EXPENSE_MAPPING_CSV);
  const raw = readFileSync(csvPath, "utf8");
  const rows = parseCsv(raw);
  const [header, ...dataRows] = rows;
  if (!header || header[0] !== "basiq_l3_code") {
    throw new Error(`Unexpected CSV header in ${csvPath}`);
  }

  let upserted = 0;
  for (const cols of dataRows) {
    if (cols.length < 6) continue;
    const groupCode = Number(cols[0]);
    const groupTitle = cols[1]?.trim();
    const subclassCode = normalizeBasiqCode(cols[2]);
    const subclassTitle = cols[3]?.trim();
    const parentCategory = cols[4]?.trim();
    const expenseCategory = cols[5]?.trim();
    if (
      !Number.isFinite(groupCode) ||
      !subclassCode ||
      !groupTitle ||
      !parentCategory ||
      !expenseCategory
    ) {
      continue;
    }

    const fullLabel = `${parentCategory} · ${expenseCategory}`;

    await prisma.spendCategory.upsert({
      where: { subclassCode },
      create: {
        groupCode,
        groupTitle,
        subclassCode,
        subclassTitle: subclassTitle || subclassCode,
        fullLabel,
        parentCategory,
        expenseCategory,
      },
      update: {
        groupCode,
        groupTitle,
        subclassTitle: subclassTitle || subclassCode,
        fullLabel,
        parentCategory,
        expenseCategory,
      },
    });
    upserted += 1;
  }

  console.log(JSON.stringify({ csvPath, upserted }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
