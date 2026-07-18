import assert from "node:assert/strict";
import { internetSavingsIntakeSchema } from "../src/server/internetSavings/intakeSchema";

const valid = internetSavingsIntakeSchema.safeParse({
  line1: "12 Example Street",
  suburb: "Sydney",
  state: "NSW",
  postcode: "2000",
  minDownloadMbps: 100,
  allowWired: true,
  allow5g: false,
  allowStarlink: false,
});
assert.equal(valid.success, true);

const badPostcode = internetSavingsIntakeSchema.safeParse({
  line1: "12 Example Street",
  suburb: "Sydney",
  state: "NSW",
  postcode: "200",
  minDownloadMbps: 100,
  allowWired: true,
  allow5g: true,
  allowStarlink: true,
});
assert.equal(badPostcode.success, false);

const noDelivery = internetSavingsIntakeSchema.safeParse({
  line1: "12 Example Street",
  suburb: "Sydney",
  state: "NSW",
  postcode: "2000",
  minDownloadMbps: 50,
  allowWired: false,
  allow5g: false,
  allowStarlink: false,
});
assert.equal(noDelivery.success, false);

console.log("Internet savings intake schema tests passed");
