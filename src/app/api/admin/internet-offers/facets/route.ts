import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin/requireAdmin";
import {
  FACET_MAX_LIMIT,
  isFacetFieldId,
} from "@/server/admin/internetOffers/facetFields";
import { queryInternetOfferFacets } from "@/server/data/internetOfferFacets";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const field = url.searchParams.get("field") ?? "";
  if (!isFacetFieldId(field)) {
    return NextResponse.json({ error: "invalid_facet_field" }, { status: 400 });
  }

  const q = url.searchParams.get("q") ?? "";
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limit != null && (!Number.isFinite(limit) || limit < 1 || limit > FACET_MAX_LIMIT)) {
    return NextResponse.json({ error: "invalid_limit" }, { status: 400 });
  }

  const result = await queryInternetOfferFacets(field, q, limit);
  return NextResponse.json(result);
}
