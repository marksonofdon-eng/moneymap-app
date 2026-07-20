import assert from "node:assert/strict";
import { categoriseTransaction } from "../src/server/taxonomy/categoriser";
import { applySecondaryEnrichment } from "../src/server/taxonomy/secondaryPatterns/applySecondaryEnrichment";
import { matchKeywordRule } from "../src/server/taxonomy/keywordRules";
import {
  expenseCategoriesForPill,
  INTERNET_BASIQ_L4,
  INTERNET_EXPENSE_CATEGORY,
} from "../src/server/taxonomy/pillMap";
import { lookupByL4Code } from "../src/server/taxonomy/expenseMapping";

assert.deepEqual(expenseCategoriesForPill("internet"), ["Internet"]);
assert.deepEqual(expenseCategoriesForPill("gas"), ["Gas"]);
assert.deepEqual(expenseCategoriesForPill("electricity"), ["Electricity"]);

assert.equal(lookupByL4Code("5801")?.expenseCategory, "Internet");
assert.equal(lookupByL4Code("2611")?.expenseCategory, "Electricity");
assert.equal(lookupByL4Code("4110")?.parentCategory, "Food & Dining");

assert.equal(matchKeywordRule("AUSSIE BROADBAND NBN")?.expenseCategory, "Internet");
assert.equal(matchKeywordRule("AUSSIE BROADBAND NBN")?.basiqL4Code, INTERNET_BASIQ_L4);

// --- Primary: user expense ONLY when Basiq L4 present ---
const basiqL4 = categoriseTransaction({
  description: "PAYMENT",
  subClass: { code: "2611", title: "Electricity Generation / Retail" },
});
assert.equal(basiqL4.expenseCategory, "Electricity");
assert.equal(basiqL4.parentCategory, "Utilities & Bills");
assert.equal(basiqL4.categorySource, "BASIQ_ENRICH");
assert.equal(basiqL4.subclassCode, "2611");

// Basiq often sends L3 `411` for supermarkets — must NOT map as coal L4 → Bulk Fuel
const woolworthsPrimary = categoriseTransaction({
  description: "WOOLWORTHS 3298 Chatswood AUS",
  direction: "debit",
  class: "payment",
  subClass: { code: "411", title: "Supermarket and Grocery Stores" },
});
assert.equal(woolworthsPrimary.categorySource, "UNMATCHED");
assert.equal(woolworthsPrimary.expenseCategory, null);
assert.equal(woolworthsPrimary.subclassCode, null);

// No L4 (empty enrich / merchant / L3-only) → primary leaves user categories empty
const internetPrimary = categoriseTransaction({
  description: "Aussie Broadband",
  enrich: { merchant: { businessName: "Aussie Broadband" } },
});
assert.equal(internetPrimary.categorySource, "UNMATCHED");
assert.equal(internetPrimary.expenseCategory, null);
assert.equal(internetPrimary.subclassCode, null);
assert.equal(internetPrimary.groupCode, null);

const basiqL3Only = categoriseTransaction({
  description: "MCDONALDS AIRSIDE MASC",
  direction: "debit",
  class: "payment",
  subClass: {
    code: "451",
    title: "Cafes, Restaurants and Takeaway Food Services",
  },
});
assert.equal(basiqL3Only.categorySource, "UNMATCHED");
assert.equal(basiqL3Only.expenseCategory, null);
assert.equal(basiqL3Only.subclassCode, null);
assert.equal(basiqL3Only.groupCode, null);

// Credits: primary never sets user categories (no L4)
const transferPrimary = categoriseTransaction({
  direction: "credit",
  class: "transfer",
  description: "Transfer From Transaction Acc",
});
assert.equal(transferPrimary.categorySource, "UNMATCHED");
assert.equal(transferPrimary.expenseCategory, null);

// --- Secondary fills when primary left empty ---
const emptyMap = new Map();
const maccasSecondary = applySecondaryEnrichment(basiqL3Only, {
  payload: {
    description: "MCDONALDS AIRSIDE MASC",
    direction: "debit",
    class: "payment",
    subClass: {
      code: "451",
      title: "Cafes, Restaurants and Takeaway Food Services",
    },
  },
  direction: "debit",
  secondaryRules: [],
  merchantMap: emptyMap,
});
assert.equal(maccasSecondary.keywordMatched, true);
assert.equal(maccasSecondary.assignment.expenseCategory, "Takeaway");
// Secondary enriches UI only — must not invent Basiq L4; L3 denorm mirrors payload.
assert.equal(maccasSecondary.assignment.subclassCode, null);
assert.equal(maccasSecondary.assignment.categorySource, "KEYWORD");
assert.equal(maccasSecondary.assignment.groupCode, 451);

const woolworthsSecondary = applySecondaryEnrichment(woolworthsPrimary, {
  payload: {
    description: "WOOLWORTHS 3298 Chatswood AUS",
    direction: "debit",
    class: "payment",
    subClass: { code: "411", title: "Supermarket and Grocery Stores" },
  },
  direction: "debit",
  secondaryRules: [],
  merchantMap: emptyMap,
});
assert.equal(woolworthsSecondary.keywordMatched, true);
assert.equal(woolworthsSecondary.assignment.expenseCategory, "Groceries");
assert.equal(woolworthsSecondary.assignment.subclassCode, null);
assert.equal(woolworthsSecondary.assignment.groupCode, 411);
assert.equal(woolworthsSecondary.assignment.categorySource, "KEYWORD");

// Secondary must not assign an L4 outside Basiq's L3 family (451 → reject Internet/5801 keyword)
const outsideL3 = applySecondaryEnrichment(
  categoriseTransaction({
    description: "Aussie Broadband",
    direction: "debit",
    subClass: { code: "451", title: "Cafes, Restaurants and Takeaway Food Services" },
  }),
  {
    payload: {
      description: "Aussie Broadband",
      direction: "debit",
      subClass: { code: "451", title: "Cafes, Restaurants and Takeaway Food Services" },
    },
    direction: "debit",
    secondaryRules: [],
    merchantMap: emptyMap,
    shadowModel: true,
  },
);
assert.equal(outsideL3.keywordMatched, false);
assert.ok(outsideL3.rejectedOutsideBasiqL3 >= 1);
// With model shadowed and no in-family rule, remain empty
assert.equal(outsideL3.assignment.expenseCategory, null);

const internetSecondary = applySecondaryEnrichment(internetPrimary, {
  payload: {
    description: "Aussie Broadband",
    enrich: { merchant: { businessName: "Aussie Broadband" } },
  },
  direction: "debit",
  secondaryRules: [],
  merchantMap: emptyMap,
});
assert.equal(internetSecondary.assignment.expenseCategory, INTERNET_EXPENSE_CATEGORY);
// No Basiq L3/L4 on payload → denorm codes stay empty; keyword L4 is not written.
assert.equal(internetSecondary.assignment.subclassCode, null);
assert.equal(internetSecondary.assignment.groupCode, null);
assert.equal(internetSecondary.assignment.categorySource, "KEYWORD");

const transferSecondary = applySecondaryEnrichment(transferPrimary, {
  payload: {
    direction: "credit",
    class: "transfer",
    description: "CR FUNDS RECEIVED XYZ",
  },
  direction: "credit",
  secondaryRules: [],
  merchantMap: emptyMap,
});
assert.equal(transferSecondary.basiqClassMatched, true);
assert.equal(transferSecondary.assignment.expenseCategory, "Transfers In");
assert.equal(transferSecondary.assignment.categorySource, "BASIQ_CLASS");

const salaryPrimary = categoriseTransaction({
  direction: "credit",
  class: "direct-credit",
  description: "DEPOSIT-SALARY TRANSPORTSERVICE Wage/sal",
});
assert.equal(salaryPrimary.expenseCategory, null);
const salarySecondary = applySecondaryEnrichment(salaryPrimary, {
  payload: {
    direction: "credit",
    class: "direct-credit",
    description: "DEPOSIT-SALARY TRANSPORTSERVICE Wage/sal",
  },
  direction: "credit",
  secondaryRules: [],
  merchantMap: emptyMap,
});
assert.equal(salarySecondary.keywordMatched, true);
assert.equal(salarySecondary.assignment.expenseCategory, "Salary & Wages");
assert.equal(salarySecondary.assignment.categorySource, "KEYWORD");

// Secondary must not touch primary L4
const skipSecondary = applySecondaryEnrichment(basiqL4, {
  payload: {
    description: "MCDONALDS SHOULD NOT OVERRIDE",
    subClass: { code: "2611" },
  },
  direction: "debit",
  secondaryRules: [],
  merchantMap: emptyMap,
});
assert.equal(skipSecondary.skippedBecausePrimaryL4, true);
assert.equal(skipSecondary.assignment.expenseCategory, "Electricity");

console.log("taxonomy categoriser tests passed");
