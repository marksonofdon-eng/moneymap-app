import {
  CONNECTION_TYPE_VALUES,
  DATA_ALLOWANCE_VALUES,
  DATE_FILTER_COLUMN_IDS,
  FACET_FILTER_COLUMN_IDS,
  NUMBER_FILTER_COLUMN_IDS,
  OFFER_STATUS_VALUES,
  type OfferColumnId,
} from "@/lib/internetOffersColumns";

/**
 * Fields supported by GET /api/admin/internet-offers/facets.
 * Derived from column valueKinds so newly filterable columns are included
 * when they use facet/date/number checklist UIs.
 */
export type FacetFieldId =
  | (typeof FACET_FILTER_COLUMN_IDS)[number]
  | (typeof DATE_FILTER_COLUMN_IDS)[number]
  | (typeof NUMBER_FILTER_COLUMN_IDS)[number];

export const FACET_FIELD_IDS: readonly FacetFieldId[] = [
  ...new Set<OfferColumnId>([
    ...FACET_FILTER_COLUMN_IDS,
    ...DATE_FILTER_COLUMN_IDS,
    ...NUMBER_FILTER_COLUMN_IDS,
  ]),
] as FacetFieldId[];

export const FACET_DEFAULT_LIMIT = 100;
export const FACET_MAX_LIMIT = 500;

export function isFacetFieldId(value: string): value is FacetFieldId {
  return (FACET_FIELD_IDS as readonly string[]).includes(value);
}

export function staticFacetValues(field: FacetFieldId): string[] | null {
  switch (field) {
    case "status":
      return [...OFFER_STATUS_VALUES];
    case "connectionType":
      return [...CONNECTION_TYPE_VALUES];
    case "dataAllowance":
      return [...DATA_ALLOWANCE_VALUES];
    case "top5":
    case "issue":
      return ["true", "false"];
    default:
      return null;
  }
}
