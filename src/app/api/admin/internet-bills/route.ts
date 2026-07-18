import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin/requireAdmin";
import {
  detectInternetBillsForOwner,
  listInternetBillsForOwner,
} from "@/server/data/internetBills";

/**
 * GET — inspect internet bills detected for the signed-in admin's transactions.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const bills = await listInternetBillsForOwner(admin.user.id);
    return NextResponse.json({ bills });
  } catch (error) {
    console.error("[admin/internet-bills:get]", error);
    return NextResponse.json(
      { error: "internet_bill_list_failed" },
      { status: 500 },
    );
  }
}

/**
 * POST — rerun the explainable recurring ISP detector, then return its results.
 */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const run = await detectInternetBillsForOwner(admin.user.id);
    const bills = await listInternetBillsForOwner(admin.user.id);
    return NextResponse.json({ run, bills });
  } catch (error) {
    console.error("[admin/internet-bills:detect]", error);
    return NextResponse.json(
      { error: "internet_bill_detection_failed" },
      { status: 500 },
    );
  }
}
