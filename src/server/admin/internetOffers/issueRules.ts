import {
  computeCalculatedCosts,
  costsNearlyEqual,
} from "@/lib/internetOfferCosts";

export type OfferIssueCode =
  | "missing_deep_link"
  | "invalid_deep_link"
  | "invalid_evening_speed"
  | "evening_exceeds_download"
  | "upload_exceeds_download"
  | "invalid_promo_duration"
  | "promo_price_incoherent"
  | "non_positive_ongoing"
  | "negative_fee"
  | "missing_calculated_costs"
  | "stale_calculated_costs"
  | "duplicate_plan"
  | "top5_inactive_status";

export const OFFER_ISSUE_LABELS: Record<OfferIssueCode, string> = {
  missing_deep_link: "Missing deep link",
  invalid_deep_link: "Deep link is not a valid URL",
  invalid_evening_speed: "Evening speed ≤ 0",
  evening_exceeds_download: "Evening speed > download speed",
  upload_exceeds_download: "Upload speed > download speed",
  invalid_promo_duration: "Promo duration outside 0–12",
  promo_price_incoherent: "Promo price/duration inconsistent with ongoing",
  non_positive_ongoing: "Ongoing monthly cost ≤ 0",
  negative_fee: "Modem, setup, or exit fee is negative",
  missing_calculated_costs: "Calculated costs missing/zero",
  stale_calculated_costs: "Calculated costs do not match source fields",
  duplicate_plan: "Duplicate provider+plan+type",
  top5_inactive_status: "TOP5 set while status is not Active",
};

/** Codes that block promoting a row to Active. */
export const HARD_BLOCK_ACTIVE_CODES: readonly OfferIssueCode[] = [
  "missing_deep_link",
  "invalid_deep_link",
  "invalid_evening_speed",
  "evening_exceeds_download",
  "upload_exceeds_download",
  "invalid_promo_duration",
  "promo_price_incoherent",
  "non_positive_ongoing",
  "negative_fee",
  "missing_calculated_costs",
  "stale_calculated_costs",
] as const;

export type OfferIssueInput = {
  id: number;
  providerName: string;
  planName: string;
  connectionType: string;
  status: string;
  top5: boolean;
  maxDownloadSpeed: number;
  typicalEveningSpeed: number;
  uploadSpeed: number;
  promoDurationMonths: number;
  ongoingMonthlyCost: number;
  promoMonthlyCost: number;
  modemCost: number;
  setupFee: number;
  exitFee: number;
  calculatedFirstYearTotalCostAud: number;
  calculatedTrueAverageMonthlyCostAud: number;
  calculatedCostPerMbpsMetric: number;
  deepLinkUrl: string | null;
};

function moneyPositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Pure per-row rules (duplicate detection applied separately with a set). */
export function evaluateOfferIssues(
  row: OfferIssueInput,
  duplicateIds: Set<number>,
): OfferIssueCode[] {
  const issues: OfferIssueCode[] = [];

  const link = row.deepLinkUrl?.trim() ?? "";
  if (!link) {
    issues.push("missing_deep_link");
  } else if (!isHttpUrl(link)) {
    issues.push("invalid_deep_link");
  }

  if (!Number.isFinite(row.typicalEveningSpeed) || row.typicalEveningSpeed <= 0) {
    issues.push("invalid_evening_speed");
  } else if (
    Number.isFinite(row.maxDownloadSpeed) &&
    row.typicalEveningSpeed > row.maxDownloadSpeed
  ) {
    issues.push("evening_exceeds_download");
  }

  if (
    Number.isFinite(row.uploadSpeed) &&
    Number.isFinite(row.maxDownloadSpeed) &&
    row.uploadSpeed > row.maxDownloadSpeed
  ) {
    issues.push("upload_exceeds_download");
  }

  if (
    !Number.isFinite(row.promoDurationMonths) ||
    row.promoDurationMonths < 0 ||
    row.promoDurationMonths > 12
  ) {
    issues.push("invalid_promo_duration");
  }

  if (
    row.promoDurationMonths > 0 &&
    (row.promoMonthlyCost <= 0 ||
      row.promoMonthlyCost >= row.ongoingMonthlyCost)
  ) {
    issues.push("promo_price_incoherent");
  }

  if (!Number.isFinite(row.ongoingMonthlyCost) || row.ongoingMonthlyCost <= 0) {
    issues.push("non_positive_ongoing");
  }

  if (row.modemCost < 0 || row.setupFee < 0 || row.exitFee < 0) {
    issues.push("negative_fee");
  }

  const recomputed = computeCalculatedCosts({
    promoDurationMonths: row.promoDurationMonths,
    promoMonthlyCost: row.promoMonthlyCost,
    ongoingMonthlyCost: row.ongoingMonthlyCost,
    modemCost: row.modemCost,
    setupFee: row.setupFee,
    typicalEveningSpeed: row.typicalEveningSpeed,
  });

  if (
    (moneyPositive(row.ongoingMonthlyCost) || moneyPositive(row.promoMonthlyCost)) &&
    (!moneyPositive(row.calculatedFirstYearTotalCostAud) ||
      !moneyPositive(row.calculatedTrueAverageMonthlyCostAud) ||
      !Number.isFinite(row.calculatedCostPerMbpsMetric) ||
      row.calculatedCostPerMbpsMetric <= 0)
  ) {
    issues.push("missing_calculated_costs");
  } else if (recomputed) {
    const stale =
      !costsNearlyEqual(
        row.calculatedFirstYearTotalCostAud,
        recomputed.calculatedFirstYearTotalCostAud,
        0.02,
      ) ||
      !costsNearlyEqual(
        row.calculatedTrueAverageMonthlyCostAud,
        recomputed.calculatedTrueAverageMonthlyCostAud,
        0.0001,
      ) ||
      !costsNearlyEqual(
        row.calculatedCostPerMbpsMetric,
        recomputed.calculatedCostPerMbpsMetric,
        0.000001,
      );
    if (stale) issues.push("stale_calculated_costs");
  }

  if (duplicateIds.has(row.id)) {
    issues.push("duplicate_plan");
  }

  if (row.top5 && row.status !== "Active") {
    issues.push("top5_inactive_status");
  }

  return issues;
}

export function hasHardBlockForActive(issues: OfferIssueCode[]): boolean {
  return issues.some((code) =>
    (HARD_BLOCK_ACTIVE_CODES as readonly string[]).includes(code),
  );
}

export function buildDuplicateIdSet(
  rows: Array<{
    id: number;
    providerName: string;
    planName: string;
    connectionType: string;
  }>,
): Set<number> {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = `${row.providerName}\0${row.planName}\0${row.connectionType}`;
    const list = groups.get(key) ?? [];
    list.push(row.id);
    groups.set(key, list);
  }
  const dupes = new Set<number>();
  for (const ids of groups.values()) {
    if (ids.length > 1) {
      for (const id of ids) dupes.add(id);
    }
  }
  return dupes;
}

export function summarizeIssues(
  rows: Array<{ issues: OfferIssueCode[] }>,
): Record<OfferIssueCode, number> {
  const summary = Object.fromEntries(
    Object.keys(OFFER_ISSUE_LABELS).map((code) => [code, 0]),
  ) as Record<OfferIssueCode, number>;
  for (const row of rows) {
    for (const code of row.issues) {
      summary[code] += 1;
    }
  }
  return summary;
}

export function issueLabels(codes: OfferIssueCode[]): string[] {
  return codes.map((code) => OFFER_ISSUE_LABELS[code]);
}
