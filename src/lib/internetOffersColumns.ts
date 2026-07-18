export type OfferColumnId =
  | "id"
  | "top5"
  | "status"
  | "statusUpdatedAt"
  | "lastUpdated"
  | "providerName"
  | "planName"
  | "connectionType"
  | "maxDownloadSpeed"
  | "typicalEveningSpeed"
  | "uploadSpeed"
  | "ongoingMonthlyCost"
  | "promoMonthlyCost"
  | "promoDurationMonths"
  | "modemCost"
  | "setupFee"
  | "exitFee"
  | "dataAllowance"
  | "contractTermMonths"
  | "targetPostcode"
  | "networkOwner"
  | "calculatedFirstYearTotalCostAud"
  | "yearTwoTotalCostAud"
  | "calculatedTrueAverageMonthlyCostAud"
  | "calculatedCostPerMbpsMetric"
  | "deepLinkUrl"
  | "bundledPerksNotes"
  | "issue";

/**
 * Semantic value kind for a column. In-column filter UI is derived from this
 * so newly visible columns pick up the right filter without extra wiring.
 */
export type OfferColumnValueKind =
  | "number"
  | "money"
  | "boolean"
  | "enum"
  | "categorical"
  | "date"
  | "text"
  | "url";

/** In-column filter UI derived from {@link OfferColumnValueKind}. */
export type OfferColumnFilterKind = "number" | "facet" | "date" | "text";

export type OfferColumnDef = {
  id: OfferColumnId;
  label: string;
  defaultVisible: boolean;
  sortable: boolean;
  sortKey?: Exclude<OfferColumnId, never>;
  /** Excel export width; defaults from valueKind when omitted. */
  excelWidth?: number;
  align?: "left" | "right" | "center";
  /**
   * Declares the field’s value type. Required so filters auto-attach when the
   * column is shown. UI column width is measured from the heading (label +
   * grip + filter), not from this kind.
   */
  valueKind: OfferColumnValueKind;
};

export function filterKindForValueKind(
  valueKind: OfferColumnValueKind,
): OfferColumnFilterKind {
  switch (valueKind) {
    case "number":
    case "money":
      return "number";
    case "boolean":
    case "enum":
    case "categorical":
      return "facet";
    case "date":
      return "date";
    case "text":
    case "url":
      return "text";
  }
}

export function columnFilterKind(col: OfferColumnDef): OfferColumnFilterKind {
  return filterKindForValueKind(col.valueKind);
}

/** Body cells may ellipsis; heading stays fully visible and drives column width. */
export function columnClipsContent(col: OfferColumnDef): boolean {
  switch (col.valueKind) {
    case "categorical":
    case "enum":
    case "text":
    case "url":
    case "date":
    case "money":
    case "number":
      return true;
    default:
      return false;
  }
}

export function excelWidthForValueKind(valueKind: OfferColumnValueKind): number {
  switch (valueKind) {
    case "boolean":
      return 6;
    case "number":
      return 7;
    case "money":
      return 10;
    case "enum":
      return 10;
    case "date":
      return 12;
    case "categorical":
      return 14;
    case "url":
      return 16;
    case "text":
      return 28;
  }
}

export function columnExcelWidth(col: OfferColumnDef): number {
  return col.excelWidth ?? excelWidthForValueKind(col.valueKind);
}

export const OFFER_COLUMNS: OfferColumnDef[] = [
  { id: "id", label: "ID", defaultVisible: true, sortable: true, sortKey: "id", align: "right", valueKind: "number" },
  { id: "top5", label: "TOP5", defaultVisible: true, sortable: true, sortKey: "top5", align: "center", valueKind: "boolean" },
  { id: "status", label: "Status", defaultVisible: true, sortable: true, sortKey: "status", valueKind: "enum" },
  { id: "statusUpdatedAt", label: "Status at", defaultVisible: true, sortable: true, sortKey: "statusUpdatedAt", valueKind: "date" },
  { id: "lastUpdated", label: "Plan at", defaultVisible: true, sortable: true, sortKey: "lastUpdated", valueKind: "date" },
  { id: "providerName", label: "Provider", defaultVisible: true, sortable: true, sortKey: "providerName", valueKind: "categorical" },
  { id: "planName", label: "Plan", defaultVisible: true, sortable: true, sortKey: "planName", valueKind: "categorical" },
  { id: "connectionType", label: "Type", defaultVisible: true, sortable: true, sortKey: "connectionType", valueKind: "enum" },
  { id: "maxDownloadSpeed", label: "Down", defaultVisible: true, sortable: true, sortKey: "maxDownloadSpeed", align: "right", valueKind: "number" },
  { id: "typicalEveningSpeed", label: "Eve", defaultVisible: true, sortable: true, sortKey: "typicalEveningSpeed", align: "right", valueKind: "number" },
  { id: "uploadSpeed", label: "Up", defaultVisible: false, sortable: true, sortKey: "uploadSpeed", align: "right", valueKind: "number" },
  { id: "ongoingMonthlyCost", label: "Ongoing", defaultVisible: true, sortable: true, sortKey: "ongoingMonthlyCost", align: "right", valueKind: "money" },
  { id: "promoMonthlyCost", label: "Promo", defaultVisible: true, sortable: true, sortKey: "promoMonthlyCost", align: "right", valueKind: "money" },
  { id: "promoDurationMonths", label: "Promo mo", defaultVisible: false, sortable: true, sortKey: "promoDurationMonths", align: "right", valueKind: "number" },
  { id: "modemCost", label: "Modem", defaultVisible: false, sortable: true, sortKey: "modemCost", align: "right", valueKind: "money" },
  { id: "setupFee", label: "Setup", defaultVisible: false, sortable: true, sortKey: "setupFee", align: "right", valueKind: "money" },
  { id: "exitFee", label: "Exit", defaultVisible: false, sortable: true, sortKey: "exitFee", align: "right", valueKind: "money" },
  { id: "dataAllowance", label: "Data", defaultVisible: false, sortable: true, sortKey: "dataAllowance", valueKind: "enum" },
  { id: "contractTermMonths", label: "Contract", defaultVisible: true, sortable: true, sortKey: "contractTermMonths", align: "right", valueKind: "number" },
  { id: "targetPostcode", label: "Postcode", defaultVisible: false, sortable: true, sortKey: "targetPostcode", valueKind: "categorical" },
  { id: "networkOwner", label: "Network", defaultVisible: true, sortable: true, sortKey: "networkOwner", valueKind: "categorical" },
  { id: "calculatedFirstYearTotalCostAud", label: "PROMO $/YR1", defaultVisible: true, sortable: true, sortKey: "calculatedFirstYearTotalCostAud", align: "right", valueKind: "money" },
  { id: "yearTwoTotalCostAud", label: "$/YR2", defaultVisible: true, sortable: true, sortKey: "yearTwoTotalCostAud", align: "right", valueKind: "money" },
  { id: "calculatedTrueAverageMonthlyCostAud", label: "True $/mo", defaultVisible: false, sortable: true, sortKey: "calculatedTrueAverageMonthlyCostAud", align: "right", valueKind: "money" },
  { id: "calculatedCostPerMbpsMetric", label: "$/Mbps", defaultVisible: false, sortable: true, sortKey: "calculatedCostPerMbpsMetric", align: "right", valueKind: "money" },
  { id: "deepLinkUrl", label: "Deep link", defaultVisible: false, sortable: false, valueKind: "url" },
  { id: "bundledPerksNotes", label: "Notes", defaultVisible: false, sortable: false, valueKind: "text" },
  { id: "issue", label: "ISSUE", defaultVisible: true, sortable: true, sortKey: "issue", align: "center", valueKind: "boolean" },
];

/** Keep in sync with valueKind number|money columns above. */
export type NumberFilterColumnId =
  | "id"
  | "maxDownloadSpeed"
  | "typicalEveningSpeed"
  | "uploadSpeed"
  | "ongoingMonthlyCost"
  | "promoMonthlyCost"
  | "promoDurationMonths"
  | "modemCost"
  | "setupFee"
  | "exitFee"
  | "contractTermMonths"
  | "calculatedFirstYearTotalCostAud"
  | "yearTwoTotalCostAud"
  | "calculatedTrueAverageMonthlyCostAud"
  | "calculatedCostPerMbpsMetric";

export type MoneyNumberColumnId =
  | "ongoingMonthlyCost"
  | "promoMonthlyCost"
  | "modemCost"
  | "setupFee"
  | "exitFee"
  | "calculatedFirstYearTotalCostAud"
  | "yearTwoTotalCostAud"
  | "calculatedTrueAverageMonthlyCostAud"
  | "calculatedCostPerMbpsMetric";

export type TextFilterColumnId = "deepLinkUrl" | "bundledPerksNotes";

export type FacetFilterColumnId =
  | "top5"
  | "status"
  | "providerName"
  | "planName"
  | "connectionType"
  | "dataAllowance"
  | "targetPostcode"
  | "networkOwner"
  | "issue";

export type DateFilterColumnId = "statusUpdatedAt" | "lastUpdated";

/** Every OfferColumnId must appear in OFFER_COLUMNS with a valueKind. */
type AssertColumnsCoverIds = Exclude<
  OfferColumnId,
  (typeof OFFER_COLUMNS)[number]["id"]
>;
type _AssertNoMissingColumnIds = AssertColumnsCoverIds extends never
  ? true
  : AssertColumnsCoverIds;
const _assertNoMissingColumnIds: _AssertNoMissingColumnIds = true;
void _assertNoMissingColumnIds;

export const DEFAULT_VISIBLE_COLUMN_IDS = OFFER_COLUMNS.filter(
  (c) => c.defaultVisible,
).map((c) => c.id);

export const SORTABLE_COLUMN_IDS = OFFER_COLUMNS.filter(
  (c) => c.sortable && c.sortKey,
).map((c) => c.sortKey!) as [OfferColumnId, ...OfferColumnId[]];

export const NUMBER_FILTER_COLUMN_IDS = OFFER_COLUMNS.filter(
  (c) => c.valueKind === "number" || c.valueKind === "money",
).map((c) => c.id as NumberFilterColumnId);

export const MONEY_NUMBER_COLUMN_IDS = OFFER_COLUMNS.filter(
  (c) => c.valueKind === "money",
).map((c) => c.id as MoneyNumberColumnId);

export const TEXT_FILTER_COLUMN_IDS = OFFER_COLUMNS.filter(
  (c) => c.valueKind === "text" || c.valueKind === "url",
).map((c) => c.id as TextFilterColumnId);

export const FACET_FILTER_COLUMN_IDS = OFFER_COLUMNS.filter(
  (c) =>
    c.valueKind === "boolean" ||
    c.valueKind === "enum" ||
    c.valueKind === "categorical",
).map((c) => c.id as FacetFilterColumnId);

export const DATE_FILTER_COLUMN_IDS = OFFER_COLUMNS.filter(
  (c) => c.valueKind === "date",
).map((c) => c.id as DateFilterColumnId);

export function isNumberFilterColumnId(
  value: string,
): value is NumberFilterColumnId {
  return (NUMBER_FILTER_COLUMN_IDS as readonly string[]).includes(value);
}

export function isMoneyNumberColumnId(
  value: string,
): value is MoneyNumberColumnId {
  return (MONEY_NUMBER_COLUMN_IDS as readonly string[]).includes(value);
}

export function isTextFilterColumnId(
  value: string,
): value is TextFilterColumnId {
  return (TEXT_FILTER_COLUMN_IDS as readonly string[]).includes(value);
}

export const OFFER_STATUS_VALUES = [
  "Active",
  "Expired",
  "Draft",
  "Hold",
] as const;

export type OfferStatusValue = (typeof OFFER_STATUS_VALUES)[number];

export const CONNECTION_TYPE_VALUES = [
  "FTTP",
  "FTTN",
  "FTTC",
  "HFC",
  "FIXED_WIRELESS",
  "FIVE_G_WIRELESS",
] as const;

export const DATA_ALLOWANCE_VALUES = ["Unlimited", "Capped"] as const;

export const SPEED_TIER_VALUES = [12, 25, 50, 100, 250] as const;

export const COLUMNS_STORAGE_KEY = "mm.admin.internetOffers.visibleColumns.v4";

export function connectionTypeLabel(value: string): string {
  if (value === "FIXED_WIRELESS") return "Fixed Wireless";
  if (value === "FIVE_G_WIRELESS") return "5G Wireless";
  return value;
}
