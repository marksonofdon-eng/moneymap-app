import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  FACET_DEFAULT_LIMIT,
  FACET_MAX_LIMIT,
  type FacetFieldId,
  staticFacetValues,
} from "@/server/admin/internetOffers/facetFields";
import {
  isNumberFilterColumnId,
  NUMBER_FILTER_SQL_EXPR,
} from "@/server/admin/internetOffers/numberFilterColumns";

export type FacetQueryResult = {
  field: FacetFieldId;
  values: string[];
  total: number;
  truncated: boolean;
};

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return FACET_DEFAULT_LIMIT;
  return Math.min(FACET_MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

function filterStatic(
  field: FacetFieldId,
  values: string[],
  q: string,
  limit: number,
): FacetQueryResult {
  const needle = q.trim().toLowerCase();
  const matched = needle
    ? values.filter((v) => v.toLowerCase().includes(needle))
    : values;
  const truncated = matched.length > limit;
  return {
    field,
    values: matched.slice(0, limit),
    total: matched.length,
    truncated,
  };
}

async function queryNumericDistinct(
  field: FacetFieldId,
  sqlExpr: string,
  needle: string,
  limit: number,
): Promise<FacetQueryResult> {
  const expr = Prisma.raw(sqlExpr);
  const rows = needle
    ? await prisma.$queryRaw<{ value: string }[]>`
        SELECT DISTINCT (${expr})::text AS value
        FROM internet_market_offers
        WHERE (${expr})::text ILIKE ${"%" + needle + "%"}
        ORDER BY 1 ASC
        LIMIT ${limit + 1}
      `
    : await prisma.$queryRaw<{ value: string }[]>`
        SELECT DISTINCT (${expr})::text AS value
        FROM internet_market_offers
        ORDER BY 1 ASC
        LIMIT ${limit + 1}
      `;
  const truncated = rows.length > limit;
  return {
    field,
    values: rows.slice(0, limit).map((r) => trimNumericText(r.value)),
    total: truncated ? limit + 1 : rows.length,
    truncated,
  };
}

/** Normalize Postgres numeric text (e.g. "12.50" → "12.5", "100.00" → "100"). */
function trimNumericText(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw;
}

export async function queryInternetOfferFacets(
  field: FacetFieldId,
  q: string,
  limitInput?: number,
): Promise<FacetQueryResult> {
  const limit = clampLimit(limitInput);
  const staticValues = staticFacetValues(field);
  if (staticValues) {
    return filterStatic(field, staticValues, q, limit);
  }

  const needle = q.trim();

  if (isNumberFilterColumnId(field)) {
    return queryNumericDistinct(
      field,
      NUMBER_FILTER_SQL_EXPR[field],
      needle,
      limit,
    );
  }

  const categoricalSql: Partial<Record<FacetFieldId, string>> = {
    providerName: "provider_name",
    planName: "plan_name",
    networkOwner: "network_owner",
    targetPostcode: "target_postcode",
  };
  const categoricalExpr = categoricalSql[field];
  if (categoricalExpr) {
    return queryStringDistinct(field, categoricalExpr, needle, limit);
  }

  switch (field) {
    case "statusUpdatedAt": {
      const rows = needle
        ? await prisma.$queryRaw<{ day: string }[]>`
            SELECT DISTINCT to_char(status_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
            FROM internet_market_offers
            WHERE to_char(status_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') ILIKE ${"%" + needle + "%"}
            ORDER BY day DESC
            LIMIT ${limit + 1}
          `
        : await prisma.$queryRaw<{ day: string }[]>`
            SELECT DISTINCT to_char(status_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
            FROM internet_market_offers
            ORDER BY day DESC
            LIMIT ${limit + 1}
          `;
      const truncated = rows.length > limit;
      return {
        field,
        values: rows.slice(0, limit).map((r) => r.day),
        total: truncated ? limit + 1 : rows.length,
        truncated,
      };
    }
    case "lastUpdated": {
      const rows = needle
        ? await prisma.$queryRaw<{ day: string }[]>`
            SELECT DISTINCT to_char(last_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
            FROM internet_market_offers
            WHERE to_char(last_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD') ILIKE ${"%" + needle + "%"}
            ORDER BY day DESC
            LIMIT ${limit + 1}
          `
        : await prisma.$queryRaw<{ day: string }[]>`
            SELECT DISTINCT to_char(last_updated AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
            FROM internet_market_offers
            ORDER BY day DESC
            LIMIT ${limit + 1}
          `;
      const truncated = rows.length > limit;
      return {
        field,
        values: rows.slice(0, limit).map((r) => r.day),
        total: truncated ? limit + 1 : rows.length,
        truncated,
      };
    }
    default:
      return { field, values: [], total: 0, truncated: false };
  }
}

async function queryStringDistinct(
  field: FacetFieldId,
  sqlExpr: string,
  needle: string,
  limit: number,
): Promise<FacetQueryResult> {
  const expr = Prisma.raw(sqlExpr);
  const rows = needle
    ? await prisma.$queryRaw<{ value: string }[]>`
        SELECT DISTINCT ${expr} AS value
        FROM internet_market_offers
        WHERE ${expr} ILIKE ${"%" + needle + "%"}
        ORDER BY 1 ASC
        LIMIT ${limit + 1}
      `
    : await prisma.$queryRaw<{ value: string }[]>`
        SELECT DISTINCT ${expr} AS value
        FROM internet_market_offers
        ORDER BY 1 ASC
        LIMIT ${limit + 1}
      `;
  const truncated = rows.length > limit;
  return {
    field,
    values: rows.slice(0, limit).map((r) => r.value),
    total: truncated ? limit + 1 : rows.length,
    truncated,
  };
}
