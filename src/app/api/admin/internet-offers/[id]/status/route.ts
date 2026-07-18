import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin/requireAdmin";
import { updateOfferStatusSchema } from "@/server/admin/internetOffers/statusSchema";
import { OFFER_ISSUE_LABELS } from "@/server/admin/internetOffers/issueRules";
import { updateInternetOfferStatus } from "@/server/data/internetOffers";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = updateOfferStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const result = await updateInternetOfferStatus(id, parsed.data.status);
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: "active_blocked",
        issues: result.issues,
        labels: result.issues.map((code) => OFFER_ISSUE_LABELS[code]),
      },
      { status: 409 },
    );
  }

  return NextResponse.json(result.data);
}
