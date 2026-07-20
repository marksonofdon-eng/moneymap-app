/**
 * Smoke test for Stage 5/6 recommend filter + rank.
 * Run: npx tsx scripts/test_internet_recommend_offers.mts
 */
import assert from "node:assert/strict";
import {
  buildRecommendationResult,
  filterEligibleOffers,
  isOfferEligible,
  pickTopOffers,
  rankOffersBySaving,
} from "../src/server/internetSavings/recommendOffers";

const accessOptions = [
  {
    accessFamily: "NBN" as const,
    connectionType: "HFC",
    available: true,
    maxDownMbps: 1000,
  },
];

const prefs = { allowWired: true, allow5g: true, allowStarlink: true };

const cheap = {
  id: 1,
  providerName: "BudgetNet",
  planName: "HFC 100",
  connectionType: "HFC",
  maxDownloadSpeed: 100,
  typicalEveningSpeed: 80,
  uploadSpeed: 20,
  monthlyCostAud: 60,
  deepLinkUrl: null,
  networkOwner: "NBN",
  targetPostcode: "ALL",
};

const mid = {
  ...cheap,
  id: 2,
  providerName: "MidNet",
  planName: "HFC 250",
  maxDownloadSpeed: 250,
  monthlyCostAud: 75,
};

const pricey = {
  ...cheap,
  id: 3,
  providerName: "PriceyNet",
  planName: "HFC 1000",
  maxDownloadSpeed: 1000,
  monthlyCostAud: 110,
};

const fttp = {
  ...cheap,
  id: 4,
  providerName: "FibreCo",
  planName: "FTTP 100",
  connectionType: "FTTP",
  maxDownloadSpeed: 100,
  monthlyCostAud: 55,
};

assert.equal(
  isOfferEligible(cheap, {
    minDownloadMbps: 100,
    postcode: "3187",
    prefs,
    accessOptions,
  }),
  true,
);

assert.equal(
  isOfferEligible(fttp, {
    minDownloadMbps: 100,
    postcode: "3187",
    prefs,
    accessOptions,
  }),
  false,
  "FTTP should not match HFC-only capability",
);

assert.equal(
  isOfferEligible(cheap, {
    minDownloadMbps: 250,
    postcode: "3187",
    prefs,
    accessOptions,
  }),
  false,
  "Below min speed should be excluded",
);

const eligible = filterEligibleOffers([cheap, mid, pricey, fttp], {
  minDownloadMbps: 100,
  postcode: "3187",
  prefs,
  accessOptions,
});
assert.equal(eligible.length, 3);

const ranked = rankOffersBySaving(eligible, 89);
assert.equal(ranked[0].id, 1);
assert.ok(ranked[0].savingMonthlyAud > 0);

const switchResult = buildRecommendationResult({
  currentMonthlyAud: 89,
  ranked,
});
assert.equal(switchResult.outcome, "SWITCH_RECOMMENDED");

const alreadyBest = buildRecommendationResult({
  currentMonthlyAud: 50,
  ranked: rankOffersBySaving(eligible, 50),
});
assert.equal(alreadyBest.outcome, "ALREADY_BEST");

const none = buildRecommendationResult({ currentMonthlyAud: 89, ranked: [] });
assert.equal(none.outcome, "NO_ELIGIBLE");

const top = pickTopOffers(ranked, 3);
assert.ok(top.length <= 3);

console.log("ok — internet recommend offers smoke passed");
