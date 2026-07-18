import { NextResponse } from "next/server";
import { updateDetectedBillStatusSchema } from "@/server/admin/internetBills/statusSchema";
import { requireAdmin } from "@/server/admin/requireAdmin";
import { updateInternetBillStatusForOwner } from "@/server/data/internetBills";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = updateDetectedBillStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const updated = await updateInternetBillStatusForOwner(
    admin.user.id,
    id,
    parsed.data.status,
  );
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
