import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin/requireAdmin";
import { updateOfferFlagsSchema } from "@/server/admin/internetOffers/flagsSchema";
import { updateInternetOfferFlags } from "@/server/data/internetOffers";

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

  const parsed = updateOfferFlagsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_flags" }, { status: 400 });
  }

  const result = await updateInternetOfferFlags(id, parsed.data);
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "top5_requires_active" },
      { status: 409 },
    );
  }

  return NextResponse.json(result.data);
}
