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

function at(raw: unknown, path: string[]): unknown {
  let value: unknown = raw;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = value[key];
  }
  return value;
}

function str(raw: unknown, path: string[]): string {
  const value = at(raw, path);
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

async function main() {
  const prisma = getIngestPrisma();
  const rows = await prisma.basiqTransaction.findMany({
    orderBy: [{ postDate: "desc" }, { transactionId: "desc" }],
    select: {
      transactionId: true,
      accountId: true,
      amount: true,
      direction: true,
      postDate: true,
      status: true,
      rawPayload: true,
      account: { select: { name: true, currency: true, basiqUserId: true } },
    },
  });

  const header = [
    "transaction_id",
    "account_id",
    "account_name",
    "basiq_user_id",
    "post_date",
    "direction",
    "amount",
    "currency",
    "status",
    "basiq_class",
    "basiq_subclass_code",
    "basiq_subclass_title",
    "basiq_enrich_category_code",
    "basiq_enrich_category_title",
    "basiq_enrich_subclass_code",
    "basiq_enrich_subclass_title",
    "description",
    "reference",
    "merchant_business_name",
    "merchant_name",
    "raw_payload_json",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    const raw = row.rawPayload;
    lines.push(
      [
        row.transactionId,
        row.accountId,
        row.account.name,
        row.account.basiqUserId,
        row.postDate?.toISOString() ??
          (str(raw, ["postDate"]) || str(raw, ["transactionDate"])),
        row.direction || str(raw, ["direction"]),
        row.amount.toString(),
        row.account.currency,
        row.status ?? str(raw, ["status"]),
        str(raw, ["class"]),
        str(raw, ["subClass", "code"]),
        str(raw, ["subClass", "title"]),
        str(raw, ["enrich", "category", "code"]),
        str(raw, ["enrich", "category", "title"]),
        str(raw, ["enrich", "subClass", "code"]),
        str(raw, ["enrich", "subClass", "title"]),
        str(raw, ["description"]),
        str(raw, ["reference"]),
        str(raw, ["enrich", "merchant", "businessName"]),
        str(raw, ["enrich", "merchant", "name"]),
        JSON.stringify(raw),
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(process.cwd(), `basiq_original_transactions_${stamp}.csv`);
  writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ count: rows.length, path: outPath }));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
