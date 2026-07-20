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
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function descriptionFromPayload(raw: unknown): string {
  const parts = [
    stringAt(raw, ["description"]),
    stringAt(raw, ["reference"]),
    stringAt(raw, ["enrich", "merchant", "businessName"]),
    stringAt(raw, ["enrich", "merchant", "name"]),
  ].filter((part) => part.trim().length > 0);
  return parts.join(" | ");
}

function isCategorised(row: {
  categorySource: string | null;
  parentCategory: string | null;
  expenseCategory: string | null;
}): boolean {
  return (
    Boolean(row.parentCategory) &&
    Boolean(row.expenseCategory) &&
    row.categorySource != null &&
    row.categorySource !== "UNMATCHED"
  );
}

async function main() {
  const prisma = getIngestPrisma();

  const rows = await prisma.basiqTransaction.findMany({
    orderBy: [{ postDate: "desc" }, { transactionId: "desc" }],
    select: {
      transactionId: true,
      ownerUserId: true,
      accountId: true,
      amount: true,
      direction: true,
      postDate: true,
      status: true,
      flowType: true,
      basiqTxClass: true,
      categorySource: true,
      categoryConfidence: true,
      categoryMatcherVersion: true,
      categoryRuleId: true,
      parentCategory: true,
      expenseCategory: true,
      subclassCode: true,
      groupCode: true,
      categorisedAt: true,
      rawPayload: true,
      account: { select: { name: true, currency: true } },
    },
  });

  const header = [
    "categorised",
    "transaction_id",
    "owner_user_id",
    "account_id",
    "account_name",
    "post_date",
    "direction",
    "amount",
    "currency",
    "status",
    "flow_type",
    "basiq_tx_class",
    "category_source",
    "category_confidence",
    "category_matcher_version",
    "category_rule_id",
    "parent_category",
    "expense_category",
    "basiq_l4",
    "basiq_l3",
    "description",
    "basiq_class_title",
    "basiq_subclass_title",
    "basiq_class_code",
    "basiq_subclass_code",
    "categorised_at",
  ];

  const lines = [header.join(",")];
  let matched = 0;
  let unmatched = 0;

  for (const row of rows) {
    const categorised = isCategorised(row);
    if (categorised) matched += 1;
    else unmatched += 1;

    const raw = row.rawPayload;
    lines.push(
      [
        categorised ? "yes" : "no",
        row.transactionId,
        row.ownerUserId,
        row.accountId,
        row.account.name,
        row.postDate?.toISOString() ?? "",
        row.direction,
        row.amount.toString(),
        row.account.currency,
        row.status,
        row.flowType,
        row.basiqTxClass,
        row.categorySource,
        row.categoryConfidence,
        row.categoryMatcherVersion,
        row.categoryRuleId,
        row.parentCategory,
        row.expenseCategory,
        row.subclassCode,
        row.groupCode,
        descriptionFromPayload(raw),
        stringAt(raw, ["class", "title"]),
        stringAt(raw, ["subClass", "title"]),
        stringAt(raw, ["class", "code"]),
        stringAt(raw, ["subClass", "code"]),
        row.categorisedAt?.toISOString() ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(process.cwd(), `all_categorised_transactions_${stamp}.csv`);
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(
    JSON.stringify({
      total: rows.length,
      categorised: matched,
      notCategorised: unmatched,
      path: outPath,
    }),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
