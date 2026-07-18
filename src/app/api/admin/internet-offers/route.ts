import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin/requireAdmin";
import { parseInternetOffersQuery } from "@/server/admin/internetOffers/querySchema";
import { listInternetOffers } from "@/server/data/internetOffers";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const parsed = parseInternetOffersQuery(url.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await listInternetOffers(parsed.data);
  return NextResponse.json(result);
}
