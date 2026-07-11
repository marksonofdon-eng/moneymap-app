import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { exportTransactionsForOwner } from "@/server/data/bankData";

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function descriptionFromPayload(raw: unknown): string {
  if (raw && typeof raw === "object" && "description" in raw) {
    const d = (raw as { description?: unknown }).description;
    if (typeof d === "string") return d;
  }
  return "";
}

/**
 * GET /api/transactions/export
 * Downloads all bank transactions for the signed-in user as CSV.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const rows = await exportTransactionsForOwner(user.id);

    const header = [
      "transaction_id",
      "post_date",
      "account_name",
      "account_id",
      "account_type",
      "direction",
      "amount",
      "currency",
      "status",
      "description",
    ].join(",");

    const lines = rows.map((row) => {
      const postDate = row.postDate ? row.postDate.toISOString() : "";
      const amount = row.amount.toString();
      return [
        row.transactionId,
        postDate,
        row.account.name || "",
        row.accountId,
        row.account.type || "",
        row.direction,
        amount,
        row.account.currency || "AUD",
        row.status || "",
        descriptionFromPayload(row.rawPayload),
      ]
        .map((cell) => csvEscape(String(cell)))
        .join(",");
    });

    const csv = `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `moneymap-transactions-${stamp}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[transactions/export]", error);
    return NextResponse.json(
      {
        error: "export_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
