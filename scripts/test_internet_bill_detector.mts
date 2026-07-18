import assert from "node:assert/strict";
import {
  detectInternetBillSeries,
  extractTransactionMatchText,
  matchInternetProvider,
} from "../src/server/internetBills/detector";

function tx(
  id: string,
  date: string,
  amount: number,
  description: string,
  accountId = "account-1",
) {
  return {
    transactionId: id,
    accountId,
    amount,
    postDate: new Date(`${date}T00:00:00Z`),
    rawPayload: { description },
  };
}

assert.equal(
  extractTransactionMatchText({
    description: "Payment",
    enrich: { merchant: { businessName: "Aussie Broadband" } },
  }),
  "Payment | Aussie Broadband",
);

assert.equal(
  matchInternetProvider({
    enrich: { merchant: { businessName: "Superloop" } },
  })?.providerKey,
  "superloop",
);

const provider = matchInternetProvider({
  description: "AUSSIE BROADBAND NBN",
});
assert.equal(provider?.providerKey, "aussie-broadband");
assert(provider?.reasons.includes("internet_service_cue"));

const aussie = detectInternetBillSeries([
  tx("a1", "2026-01-03", 89, "Aussie Broadband"),
  tx("a2", "2026-02-03", 89, "Aussie Broadband"),
  tx("a3", "2026-03-03", 91, "Aussie Broadband"),
]);
assert.equal(aussie.length, 1);
assert.equal(aussie[0].providerName, "Aussie Broadband");
assert.equal(aussie[0].estimatedMonthlyCostAud, 89);
assert.equal(aussie[0].occurrenceCount, 3);
assert(aussie[0].confidence >= 90);
assert(
  aussie[0].evidence[0].matchReasons.includes("recurring_monthly_series"),
);

const multiService = detectInternetBillSeries([
  tx("t1", "2026-01-10", 110, "Telstra"),
  tx("t2", "2026-02-10", 110, "Telstra"),
  tx("t3", "2026-03-10", 110, "Telstra"),
]);
assert.equal(multiService.length, 1);
assert(
  multiService[0].evidence[0].matchReasons.includes(
    "multi_service_provider",
  ),
);
assert(multiService[0].confidence < aussie[0].confidence);

const notRecurring = detectInternetBillSeries([
  tx("s1", "2026-01-01", 120, "Starlink"),
  tx("s2", "2026-01-08", 40, "Starlink"),
]);
assert.equal(notRecurring.length, 0);

const unrelated = detectInternetBillSeries([
  tx("g1", "2026-01-03", 80, "Woolworths"),
  tx("g2", "2026-02-03", 80, "Woolworths"),
]);
assert.equal(unrelated.length, 0);

console.log("Internet bill detector tests passed");
