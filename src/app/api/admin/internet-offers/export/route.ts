import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin/requireAdmin";
import { OFFER_COLUMNS, columnExcelWidth } from "@/server/admin/internetOffers/columns";
import { parseInternetOffersQuery } from "@/server/admin/internetOffers/querySchema";
import { exportInternetOffers } from "@/server/data/internetOffers";

function cellValue(
  row: Record<string, unknown>,
  columnId: string,
): string | number | boolean {
  if (columnId === "connectionType") {
    return String(row.connectionTypeLabel ?? row.connectionType ?? "");
  }
  if (columnId === "top5" || columnId === "issue") {
    return row[columnId] ? "Y" : "N";
  }
  const value = row[columnId];
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const parsed = parseInternetOffersQuery(url.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const exported = await exportInternetOffers(parsed.data);
  if (!exported.ok) {
    return NextResponse.json(
      { error: exported.error, cap: exported.cap },
      { status: 413 },
    );
  }

  const visibleParam = url.searchParams.get("columns");
  const visibleIds = visibleParam
    ? visibleParam.split(",").map((s) => s.trim()).filter(Boolean)
    : OFFER_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);

  const columns = OFFER_COLUMNS.filter((c) => visibleIds.includes(c.id));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MoneyMap";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Internet offers");

  sheet.columns = columns.map((c) => ({
    header: c.label,
    key: c.id,
    width: columnExcelWidth(c),
  }));

  for (const row of exported.rows) {
    const record: Record<string, string | number | boolean> = {};
    for (const col of columns) {
      record[col.id] = cellValue(
        row as unknown as Record<string, unknown>,
        col.id,
      );
    }
    sheet.addRow(record);
  }

  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `moneymap-internet-offers-${stamp}.xlsx`;

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
