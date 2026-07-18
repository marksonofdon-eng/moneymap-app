import {
  NUMBER_FILTER_COLUMN_IDS,
  MONEY_NUMBER_COLUMN_IDS,
  isMoneyNumberColumnId,
  isNumberFilterColumnId,
  type NumberFilterColumnId,
} from "@/lib/internetOffersColumns";

export {
  NUMBER_FILTER_COLUMN_IDS,
  MONEY_NUMBER_COLUMN_IDS,
  isMoneyNumberColumnId,
  isNumberFilterColumnId,
  type NumberFilterColumnId,
};

/**
 * Prisma where field for a number filter column.
 * yearTwoTotalCostAud is derived (ongoing * 12) — handled specially in buildWhere.
 */
export const NUMBER_FILTER_PRISMA_FIELD: Record<
  NumberFilterColumnId,
  | Exclude<NumberFilterColumnId, "yearTwoTotalCostAud">
  | "yearTwo"
> = {
  id: "id",
  maxDownloadSpeed: "maxDownloadSpeed",
  typicalEveningSpeed: "typicalEveningSpeed",
  uploadSpeed: "uploadSpeed",
  ongoingMonthlyCost: "ongoingMonthlyCost",
  promoMonthlyCost: "promoMonthlyCost",
  promoDurationMonths: "promoDurationMonths",
  modemCost: "modemCost",
  setupFee: "setupFee",
  exitFee: "exitFee",
  contractTermMonths: "contractTermMonths",
  calculatedFirstYearTotalCostAud: "calculatedFirstYearTotalCostAud",
  yearTwoTotalCostAud: "yearTwo",
  calculatedTrueAverageMonthlyCostAud: "calculatedTrueAverageMonthlyCostAud",
  calculatedCostPerMbpsMetric: "calculatedCostPerMbpsMetric",
};

/** Allowlisted SQL expressions for DISTINCT facet queries. */
export const NUMBER_FILTER_SQL_EXPR: Record<NumberFilterColumnId, string> = {
  id: "id",
  maxDownloadSpeed: "max_download_speed",
  typicalEveningSpeed: "typical_evening_speed",
  uploadSpeed: "upload_speed",
  ongoingMonthlyCost: "ongoing_monthly_cost",
  promoMonthlyCost: "promo_monthly_cost",
  promoDurationMonths: "promo_duration_months",
  modemCost: "modem_cost",
  setupFee: "setup_fee",
  exitFee: "exit_fee",
  contractTermMonths: "contract_term_months",
  calculatedFirstYearTotalCostAud: "calculated_first_year_total_cost_aud",
  yearTwoTotalCostAud: "(ongoing_monthly_cost * 12)",
  calculatedTrueAverageMonthlyCostAud: "calculated_true_average_monthly_cost_aud",
  calculatedCostPerMbpsMetric: "calculated_cost_per_mbps_metric",
};
