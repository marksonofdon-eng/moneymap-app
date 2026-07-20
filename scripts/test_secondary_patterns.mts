import assert from "node:assert/strict";
import {
  extractMerchantToken,
  extractTxFeatures,
  featuresToTokenBag,
  normalizeDescription,
} from "../src/server/taxonomy/features";
import {
  applyMerchantMapToPayload,
  MERCHANT_MAP_MATCHER_VERSION,
} from "../src/server/taxonomy/merchantMap";
import {
  predictWithModel,
  trainCategoryModel,
  type CategoryModelArtefact,
  type TrainExample,
} from "../src/server/taxonomy/secondaryModel";
import {
  matchSecondaryRule,
  newSecondaryRuleId,
  SECONDARY_MATCHER_VERSION,
} from "../src/server/taxonomy/secondaryPatterns/matcher";
import { categoriseTransaction } from "../src/server/taxonomy/categoriser";

// --- matcher / features ---
const ruleId = newSecondaryRuleId();
assert.ok(ruleId.startsWith("scr_"));
assert.equal(normalizeDescription("Hello 12345 World!!"), "hello # world");
assert.equal(extractMerchantToken("CHEMIST WAREHOUSE MELB"), "chemist");

const hit = matchSecondaryRule(
  {
    id: ruleId,
    patternType: "BASIQ_L3",
    patternValue: "452",
    matchSpec: { direction: "debit", basiqL3Code: "452" },
    parentCategory: "Food & Dining",
    expenseCategory: "Bars & Pubs",
    flowType: "EXPENSE",
    confidence: 92,
    matcherVersion: SECONDARY_MATCHER_VERSION,
  },
  {
    direction: "debit",
    description: "LOCAL PUB",
    basiqSubclassCode: "452",
  },
);
assert.equal(hit?.ruleId, ruleId);

const merchantHit = matchSecondaryRule(
  {
    id: ruleId,
    patternType: "MERCHANT_TOKEN",
    patternValue: "yd",
    matchSpec: { direction: "any", merchantToken: "yd" },
    parentCategory: "Clothes & Fashion",
    expenseCategory: "Clothing",
    flowType: "EXPENSE",
    confidence: 92,
    matcherVersion: SECONDARY_MATCHER_VERSION,
  },
  {
    direction: "debit",
    description: "YD CHADSTONE",
    basiqSubclassCode: null,
  },
);
assert.equal(merchantHit?.expenseCategory, "Clothing");

// --- merchant map lookup ---
const map = new Map([
  [
    "chemistwarehouse",
    {
      merchantKey: "chemistwarehouse",
      parentCategory: "Health & Medical",
      expenseCategory: "Medical Wholesale",
      flowType: "EXPENSE" as const,
      supportCount: 5,
      agreementPct: 95,
      ruleId: "scr_test",
      matcherVersion: MERCHANT_MAP_MATCHER_VERSION,
    },
  ],
]);
const mapHit = applyMerchantMapToPayload(map, {
  direction: "debit",
  description: "CHEMISTWAREHOUSE ONLINE",
});
assert.equal(mapHit?.parentCategory, "Health & Medical");
assert.equal(mapHit?.categoryRuleId, "scr_test");

const mapMiss = applyMerchantMapToPayload(map, {
  direction: "debit",
  description: "UNKNOWN MERCHANT XYZ",
});
assert.equal(mapMiss, null);

const lowAgreement = applyMerchantMapToPayload(
  new Map([
    [
      "mixed",
      {
        merchantKey: "mixed",
        parentCategory: "Food & Dining",
        expenseCategory: "Groceries",
        flowType: "EXPENSE" as const,
        supportCount: 10,
        agreementPct: 70,
        ruleId: null,
        matcherVersion: MERCHANT_MAP_MATCHER_VERSION,
      },
    ],
  ]),
  { direction: "debit", description: "MIXED STORE" },
);
assert.equal(lowAgreement, null);

// --- model train/predict ---
const examples: TrainExample[] = [];
const labels = [
  { parent: "Food & Dining", expense: "Groceries", desc: "COLES SUPERMARKET" },
  { parent: "Food & Dining", expense: "Groceries", desc: "WOOLWORTHS MARKET" },
  { parent: "Transport & Auto", expense: "Refinery Oils", desc: "SHELL PETROL" },
  { parent: "Transport & Auto", expense: "Refinery Oils", desc: "BP FUEL STOP" },
  { parent: "Clothes & Fashion", expense: "Clothing", desc: "YD APPAREL" },
  { parent: "Clothes & Fashion", expense: "Clothing", desc: "YD FASHION" },
  { parent: "Health & Medical", expense: "Medical Wholesale", desc: "CHEMIST WAREHOUSE" },
  { parent: "Health & Medical", expense: "Medical Wholesale", desc: "CHEMIST DISCOUNT" },
  { parent: "Tech & Electronics", expense: "App Store Purchases", desc: "NETFLIX SUBSCRIPTION" },
  { parent: "Tech & Electronics", expense: "App Store Purchases", desc: "SPOTIFY PREMIUM" },
  { parent: "Food & Dining", expense: "Groceries", desc: "IGA LOCAL" },
  { parent: "Transport & Auto", expense: "Refinery Oils", desc: "AMPOL FUEL" },
];
for (const row of labels) {
  const payload = { direction: "debit", description: row.desc };
  examples.push({
    features: extractTxFeatures(payload, "debit"),
    parentCategory: row.parent,
    expenseCategory: row.expense,
    flowType: "EXPENSE",
    merchantKey: extractMerchantToken(row.desc),
  });
}
assert.ok(featuresToTokenBag(examples[0]!.features).includes("merch:"));

const artefact: CategoryModelArtefact = trainCategoryModel(examples, {
  version: "clf-test",
  epochs: 12,
});
assert.equal(artefact.version, "clf-test");
assert.ok(artefact.labels.length >= 2);
assert.ok(artefact.metrics.accuracy >= 0);

const pred = predictWithModel(
  artefact,
  extractTxFeatures({ direction: "debit", description: "COLES TOWN HALL" }, "debit"),
);
assert.ok(pred);
assert.equal(pred!.parentCategory, "Food & Dining");

// Primary path does not invent from description (keywords are secondary).
const grocery = categoriseTransaction({
  direction: "debit",
  description: "COLES 1234",
});
assert.equal(grocery.categorySource, "UNMATCHED");
assert.equal(grocery.expenseCategory, null);

console.log("hybrid secondary categorisation tests passed");
