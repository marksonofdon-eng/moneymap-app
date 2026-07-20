import type { InternetConnectionType, InternetAccessFamily } from "@prisma/client";

export type RecommendAccessOption = {
  accessFamily: InternetAccessFamily | "NBN" | "FIVE_G" | "STARLINK";
  connectionType: InternetConnectionType | string | null;
  available: boolean;
  maxDownMbps: number | null;
};

export type RecommendCatalogOffer = {
  id: number;
  providerName: string;
  planName: string;
  connectionType: InternetConnectionType | string;
  maxDownloadSpeed: number;
  typicalEveningSpeed: number;
  uploadSpeed: number;
  monthlyCostAud: number;
  deepLinkUrl: string | null;
  networkOwner: string;
  targetPostcode: string;
};

export type RankedOffer = RecommendCatalogOffer & {
  savingMonthlyAud: number;
  accessFamily: "NBN" | "FIVE_G" | "STARLINK";
};

export type RecommendationOutcome =
  | "ALREADY_BEST"
  | "SWITCH_RECOMMENDED"
  | "NO_ELIGIBLE"
  | "NOT_READY";

export type RecommendationResult = {
  outcome: RecommendationOutcome;
  reason: string | null;
  currentMonthlyAud: number;
  eligibleCount: number;
  bestDeal: RankedOffer | null;
  topOffers: RankedOffer[];
  savingMonthlyAud: number;
};

/** Plans cheaper than this vs current bill are treated as already-best. */
export const BEST_DEAL_SAVING_THRESHOLD_AUD = 2;

const CONNECTION_TO_FAMILY: Record<string, "NBN" | "FIVE_G" | "STARLINK"> = {
  FTTP: "NBN",
  FTTN: "NBN",
  FTTC: "NBN",
  HFC: "NBN",
  FIXED_WIRELESS: "NBN",
  "Fixed Wireless": "NBN",
  FIVE_G_WIRELESS: "FIVE_G",
  "5G Wireless": "FIVE_G",
};

export function connectionTypeAccessFamily(
  connectionType: string,
): "NBN" | "FIVE_G" | "STARLINK" | null {
  return CONNECTION_TO_FAMILY[connectionType] ?? null;
}

function familyAllowed(
  family: "NBN" | "FIVE_G" | "STARLINK",
  prefs: { allowWired: boolean; allow5g: boolean; allowStarlink: boolean },
): boolean {
  if (family === "NBN") return prefs.allowWired;
  if (family === "FIVE_G") return prefs.allow5g;
  return prefs.allowStarlink;
}

/**
 * An offer is eligible when:
 * - its access family is allowed by prefs
 * - a matching available capability option exists
 * - download speed meets the user's minimum
 * - download speed does not exceed the path's max (when known)
 * - postcode targets ALL or the user's postcode
 */
export function isOfferEligible(
  offer: RecommendCatalogOffer,
  input: {
    minDownloadMbps: number;
    postcode: string;
    prefs: { allowWired: boolean; allow5g: boolean; allowStarlink: boolean };
    accessOptions: RecommendAccessOption[];
  },
): boolean {
  const family = connectionTypeAccessFamily(String(offer.connectionType));
  if (!family) return false;
  if (!familyAllowed(family, input.prefs)) return false;
  if (offer.maxDownloadSpeed < input.minDownloadMbps) return false;

  const target = offer.targetPostcode?.trim().toUpperCase() || "ALL";
  if (target !== "ALL" && target !== input.postcode.trim().toUpperCase()) {
    return false;
  }

  const available = input.accessOptions.filter((o) => o.available);
  const match = available.find((option) => {
    if (option.accessFamily !== family && String(option.accessFamily) !== family) {
      return false;
    }
    if (option.connectionType == null) {
      // Family-level availability (e.g. Starlink) — allow any plan in that family
      return true;
    }
    return String(option.connectionType) === String(offer.connectionType);
  });

  if (!match) return false;

  if (
    match.maxDownMbps != null &&
    offer.maxDownloadSpeed > match.maxDownMbps
  ) {
    return false;
  }

  return true;
}

export function filterEligibleOffers(
  offers: RecommendCatalogOffer[],
  input: {
    minDownloadMbps: number;
    postcode: string;
    prefs: { allowWired: boolean; allow5g: boolean; allowStarlink: boolean };
    accessOptions: RecommendAccessOption[];
  },
): Array<RecommendCatalogOffer & { accessFamily: "NBN" | "FIVE_G" | "STARLINK" }> {
  return offers
    .filter((offer) => isOfferEligible(offer, input))
    .map((offer) => ({
      ...offer,
      accessFamily: connectionTypeAccessFamily(String(offer.connectionType))!,
    }));
}

/**
 * Prefer plans that meet the requested speed. If none exist on the available
 * path, fall back to the best plans that still match technology/postcode.
 */
export function filterEligibleOffersWithSpeedFallback(
  offers: RecommendCatalogOffer[],
  input: {
    minDownloadMbps: number;
    postcode: string;
    prefs: { allowWired: boolean; allow5g: boolean; allowStarlink: boolean };
    accessOptions: RecommendAccessOption[];
  },
): {
  eligible: Array<
    RecommendCatalogOffer & { accessFamily: "NBN" | "FIVE_G" | "STARLINK" }
  >;
  relaxedSpeed: boolean;
} {
  const strict = filterEligibleOffers(offers, input);
  if (strict.length > 0) {
    return { eligible: strict, relaxedSpeed: false };
  }

  const relaxed = filterEligibleOffers(offers, {
    ...input,
    minDownloadMbps: 0,
  });
  return { eligible: relaxed, relaxedSpeed: relaxed.length > 0 };
}

export function rankOffersBySaving(
  eligible: Array<
    RecommendCatalogOffer & { accessFamily: "NBN" | "FIVE_G" | "STARLINK" }
  >,
  currentMonthlyAud: number,
  opts?: { preferSpeedMbps?: number },
): RankedOffer[] {
  const preferSpeed = opts?.preferSpeedMbps;
  return eligible
    .map((offer) => ({
      ...offer,
      savingMonthlyAud:
        Math.round((currentMonthlyAud - offer.monthlyCostAud) * 100) / 100,
    }))
    .sort((a, b) => {
      if (preferSpeed != null) {
        const aGap = Math.max(0, preferSpeed - a.maxDownloadSpeed);
        const bGap = Math.max(0, preferSpeed - b.maxDownloadSpeed);
        if (aGap !== bGap) return aGap - bGap;
        if (b.maxDownloadSpeed !== a.maxDownloadSpeed) {
          return b.maxDownloadSpeed - a.maxDownloadSpeed;
        }
      }
      if (b.savingMonthlyAud !== a.savingMonthlyAud) {
        return b.savingMonthlyAud - a.savingMonthlyAud;
      }
      if (a.monthlyCostAud !== b.monthlyCostAud) {
        return a.monthlyCostAud - b.monthlyCostAud;
      }
      return b.maxDownloadSpeed - a.maxDownloadSpeed;
    });
}

/** Prefer top saver, then diversify remaining slots across access families. */
export function pickTopOffers(ranked: RankedOffer[], limit = 3): RankedOffer[] {
  if (ranked.length === 0) return [];
  const picked: RankedOffer[] = [ranked[0]];
  const usedFamilies = new Set<string>([ranked[0].accessFamily]);

  for (const offer of ranked.slice(1)) {
    if (picked.length >= limit) break;
    if (!usedFamilies.has(offer.accessFamily)) {
      picked.push(offer);
      usedFamilies.add(offer.accessFamily);
    }
  }

  for (const offer of ranked.slice(1)) {
    if (picked.length >= limit) break;
    if (!picked.some((p) => p.id === offer.id)) {
      picked.push(offer);
    }
  }

  return picked;
}

export function buildRecommendationResult(input: {
  currentMonthlyAud: number;
  ranked: RankedOffer[];
}): RecommendationResult {
  const topOffers = pickTopOffers(input.ranked, 3);
  const bestDeal = topOffers[0] ?? null;
  const savingMonthlyAud = bestDeal?.savingMonthlyAud ?? 0;

  if (!bestDeal) {
    return {
      outcome: "NO_ELIGIBLE",
      reason: "No market plans match this address and speed need.",
      currentMonthlyAud: input.currentMonthlyAud,
      eligibleCount: 0,
      bestDeal: null,
      topOffers: [],
      savingMonthlyAud: 0,
    };
  }

  if (savingMonthlyAud <= BEST_DEAL_SAVING_THRESHOLD_AUD) {
    return {
      outcome: "ALREADY_BEST",
      reason:
        "Your current plan looks competitive — no worthwhile switch found.",
      currentMonthlyAud: input.currentMonthlyAud,
      eligibleCount: input.ranked.length,
      bestDeal,
      topOffers,
      savingMonthlyAud,
    };
  }

  return {
    outcome: "SWITCH_RECOMMENDED",
    reason: `A better plan could save about $${savingMonthlyAud.toFixed(0)} per month.`,
    currentMonthlyAud: input.currentMonthlyAud,
    eligibleCount: input.ranked.length,
    bestDeal,
    topOffers,
    savingMonthlyAud,
  };
}
