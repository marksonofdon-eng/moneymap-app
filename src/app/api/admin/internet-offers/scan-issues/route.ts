import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin/requireAdmin";
import { OFFER_ISSUE_LABELS } from "@/server/admin/internetOffers/issueRules";
import { scanInternetOfferIssues } from "@/server/data/internetOffers";

/** POST — scan catalog for defects and sync the ISSUE flag. */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const result = await scanInternetOfferIssues();
  return NextResponse.json({
    ...result,
    labels: OFFER_ISSUE_LABELS,
  });
}
