import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getIngestPrisma } from "../src/server/data/dbContext";

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringAt(raw: unknown, path: string[]): string {
  let value: unknown = raw;
  for (const key of path) {
    if (!isRecord(value)) return "";
    value = value[key];
  }
  return typeof value === "string" ? value : "";
}

function descriptionFromPayload(raw: unknown): string {
  const parts = [
    stringAt(raw, ["description"]),
    stringAt(raw, ["reference"]),
    stringAt(raw, ["enrich", "merchant", "businessName"]),
    stringAt(raw, ["enrich", "merchant", "name"]),
    stringAt(raw, ["class", "title"]),
    stringAt(raw, ["subClass", "title"]),
    stringAt(raw, ["class", "code"]),
    stringAt(raw, ["subClass", "code"]),
  ].filter((part) => part.trim().length > 0);
  return parts.join(" | ");
}

async function main() {
  const prisma = getIngestPrisma();

  const rows = await prisma.basiqTransaction.findMany({
    where: {
      OR: [
        { categorySource: "UNMATCHED" },
        { categorySource: null },
        { expenseCategory: null },
        { parentCategory: null },
      ],
    },
    orderBy: [{ postDate: "desc" }, { transactionId: "desc" }],
    select: {
      transactionId: true,
      ownerUserId: true,
      accountId: true,
      amount: true,
      direction: true,
      postDate: true,
      status: true,
      categorySource: true,
      categoryConfidence: true,
      parentCategory: true,
      expenseCategory: true,
      subclassCode: true,
      groupCode: true,
      rawPayload: true,
      account: { select: { name: true, currency: true } },
    },
  });

  const header = [
    "transaction_id",
    "owner_user_id",
    "account_id",
    "account_name",
    "post_date",
    "direction",
    "amount",
    "currency",
    "status",
    "category_source",
    "category_confidence",
    "parent_category",
    "expense_category",
    "basiq_l4",
    "basiq_l3",
    "description",
    "basiq_class_title",
    "basiq_subclass_title",
    "basiq_class_code",
    "basiq_subclass_code",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    const raw = row.rawPayload;
    lines.push(
      [
        row.transactionId,
        row.ownerUserId,
        row.accountId,
        row.account.name,
        row.postDate?.toISOString() ?? "",
        row.direction,
        row.amount.toString(),
        row.account.currency,
        row.status,
        row.categorySource,
        row.categoryConfidence,
        row.parentCategory,
        row.expenseCategory,
        row.subclassCode,
        row.groupCode,
        descriptionFromPayload(raw),
        stringAt(raw, ["class", "title"]),
        stringAt(raw, ["subClass", "title"]),
        stringAt(raw, ["class", "code"]),
        stringAt(raw, ["subClass", "code"]),
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(
    process.cwd(),
    `uncategorised_transactions_${stamp}.csv`,
  );
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ count: rows.length, path: outPath }));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
