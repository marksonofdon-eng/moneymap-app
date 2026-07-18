/** Shared first-year economics for ingest + defect trapping. */

export type OfferCostInputs = {
  promoDurationMonths: number;
  promoMonthlyCost: number;
  ongoingMonthlyCost: number;
  modemCost: number;
  setupFee: number;
  typicalEveningSpeed: number;
};

export type CalculatedCosts = {
  calculatedFirstYearTotalCostAud: number;
  calculatedTrueAverageMonthlyCostAud: number;
  calculatedCostPerMbpsMetric: number;
};

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Recompute derived cost metrics from source market fields.
 * Returns null when evening speed is invalid (cannot divide).
 */
export function computeCalculatedCosts(
  row: OfferCostInputs,
): CalculatedCosts | null {
  const promoMonths = row.promoDurationMonths;
  const promoPrice = row.promoMonthlyCost;
  const standardPrice = row.ongoingMonthlyCost;
  const modem = row.modemCost;
  const setup = row.setupFee;
  const eveningMbps = row.typicalEveningSpeed;

  if (!Number.isFinite(eveningMbps) || eveningMbps <= 0) return null;
  if (!Number.isFinite(promoMonths) || promoMonths < 0 || promoMonths > 12) {
    return null;
  }

  const firstYearTotal =
    promoMonths > 0
      ? promoPrice * promoMonths +
        standardPrice * (12 - promoMonths) +
        modem +
        setup
      : standardPrice * 12 + modem + setup;

  const trueAverageMonthly = firstYearTotal / 12;
  const costPerMbps = trueAverageMonthly / eveningMbps;

  return {
    calculatedFirstYearTotalCostAud: round(firstYearTotal, 2),
    calculatedTrueAverageMonthlyCostAud: round(trueAverageMonthly, 4),
    calculatedCostPerMbpsMetric: round(costPerMbps, 6),
  };
}

export function costsNearlyEqual(
  a: number,
  b: number,
  tolerance: number,
): boolean {
  return Math.abs(a - b) <= tolerance;
}
