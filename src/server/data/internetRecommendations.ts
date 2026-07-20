import { prisma } from "@/lib/db";
import { withOwnerContext } from "@/server/data/dbContext";
import { getLatestInternetCapabilities } from "@/server/data/internetCapabilities";
import {
  buildRecommendationResult,
  filterEligibleOffersWithSpeedFallback,
  rankOffersBySaving,
  type RecommendationOutcome,
  type RecommendationResult,
  type RankedOffer,
} from "@/server/internetSavings/recommendOffers";

export type { RecommendationOutcome, RecommendationResult, RankedOffer };

export type InternetRecommendationSummary = {
  outcome: "ALREADY_BEST" | "SWITCH_RECOMMENDED" | "NO_ELIGIBLE";
  savingMonthlyAud: number;
  bestProviderName: string | null;
  bestPlanName: string | null;
  reason: string | null;
};

function money(value: { toString(): string } | number) {
  return Number(typeof value === "number" ? value : value.toString());
}

async function loadCatalogOffers() {
  const select = {
    id: true,
    providerName: true,
    planName: true,
    connectionType: true,
    maxDownloadSpeed: true,
    typicalEveningSpeed: true,
    uploadSpeed: true,
    calculatedTrueAverageMonthlyCostAud: true,
    deepLinkUrl: true,
    networkOwner: true,
    targetPostcode: true,
  } as const;

  const preferred = await prisma.internetMarketOffer.findMany({
    where: {
      issue: false,
      OR: [{ status: "Active" }, { top5: true }],
    },
    select,
    take: 500,
  });

  // Keep a broad pool so a tiny Active/top5 shortlist cannot zero out matches.
  if (preferred.length >= 50) return preferred;

  const fallback = await prisma.internetMarketOffer.findMany({
    where: { issue: false },
    select,
    orderBy: { calculatedTrueAverageMonthlyCostAud: "asc" },
    take: 500,
  });

  if (preferred.length === 0) return fallback;

  const seen = new Set(preferred.map((row) => row.id));
  return [...preferred, ...fallback.filter((row) => !seen.has(row.id))];
}

export async function getInternetRecommendations(
  ownerUserId: string,
): Promise<RecommendationResult> {
  const [capability, catalog, profileBundle] = await Promise.all([
    getLatestInternetCapabilities(ownerUserId),
    loadCatalogOffers(),
    withOwnerContext(ownerUserId, async (db) => {
      const bill = await db.detectedBill.findFirst({
        where: {
          ownerUserId,
          category: "INTERNET",
          status: { in: ["DETECTED", "CONFIRMED"] },
        },
        orderBy: [{ confidence: "desc" }, { lastSeenAt: "desc" }],
      });

      const profile = await db.userNeedProfile.findUnique({
        where: {
          ownerUserId_category: {
            ownerUserId,
            category: "INTERNET",
          },
        },
        include: { serviceAddress: true },
      });

      return { bill, profile };
    }),
  ]);

  const { bill, profile } = profileBundle;

  if (!bill || !profile?.readyForAssess || !profile.serviceAddress) {
    return {
      outcome: "NOT_READY",
      reason: "Save your address and internet use before comparing plans.",
      currentMonthlyAud: bill ? money(bill.estimatedMonthlyCostAud) : 0,
      eligibleCount: 0,
      bestDeal: null,
      topOffers: [],
      savingMonthlyAud: 0,
    };
  }

  if (!capability || capability.status !== "READY" || capability.stale) {
    return {
      outcome: "NOT_READY",
      reason: capability?.stale
        ? "Re-check what’s available at this address first."
        : "Check what’s available at this address first.",
      currentMonthlyAud: money(bill.estimatedMonthlyCostAud),
      eligibleCount: 0,
      bestDeal: null,
      topOffers: [],
      savingMonthlyAud: 0,
    };
  }

  const offers = catalog.map((row) => ({
    id: row.id,
    providerName: row.providerName,
    planName: row.planName,
    connectionType: row.connectionType,
    maxDownloadSpeed: row.maxDownloadSpeed,
    typicalEveningSpeed: row.typicalEveningSpeed,
    uploadSpeed: row.uploadSpeed,
    monthlyCostAud: money(row.calculatedTrueAverageMonthlyCostAud),
    deepLinkUrl: row.deepLinkUrl,
    networkOwner: row.networkOwner,
    targetPostcode: row.targetPostcode,
  }));

  // Delivery prefs UI was removed — always consider all access families.
  const { eligible, relaxedSpeed } = filterEligibleOffersWithSpeedFallback(
    offers,
    {
      minDownloadMbps: profile.minDownloadMbps,
      postcode: profile.serviceAddress.postcode,
      prefs: {
        allowWired: true,
        allow5g: true,
        allowStarlink: true,
      },
      accessOptions: capability.options.map((o) => ({
        accessFamily: o.accessFamily,
        connectionType: o.connectionType,
        available: o.available,
        maxDownMbps: o.maxDownMbps,
      })),
    },
  );

  const currentMonthlyAud = money(bill.estimatedMonthlyCostAud);
  const ranked = rankOffersBySaving(eligible, currentMonthlyAud, {
    preferSpeedMbps: relaxedSpeed ? profile.minDownloadMbps : undefined,
  });
  const result = buildRecommendationResult({ currentMonthlyAud, ranked });
  if (relaxedSpeed && result.outcome !== "NO_ELIGIBLE") {
    return {
      ...result,
      reason: `No ${profile.minDownloadMbps} Mbps plans on your available path — showing the closest speeds instead.`,
    };
  }
  return result;
}

export async function getInternetRecommendationSummary(
  ownerUserId: string,
): Promise<InternetRecommendationSummary | null> {
  const result = await getInternetRecommendations(ownerUserId);
  if (result.outcome === "NOT_READY") return null;
  return {
    outcome: result.outcome,
    savingMonthlyAud: result.savingMonthlyAud,
    bestProviderName: result.bestDeal?.providerName ?? null,
    bestPlanName: result.bestDeal?.planName ?? null,
    reason: result.reason,
  };
}
