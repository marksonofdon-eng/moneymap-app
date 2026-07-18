import assert from "node:assert/strict";
import { StubHfcCapabilityProvider } from "../src/server/internetSavings/capabilityProvider";

const provider = new StubHfcCapabilityProvider();
const result = await provider.assess({
  line1: "12 Example Street",
  line2: null,
  suburb: "Sydney",
  state: "NSW",
  postcode: "2000",
  country: "AU",
  lat: null,
  lng: null,
});

assert.equal(result.provider, "stub-hfc-v1");
assert.equal(result.rawPayload.stub, true);
assert.equal(result.options.length, 1);
assert.equal(result.options[0].accessFamily, "NBN");
assert.equal(result.options[0].connectionType, "HFC");
assert.equal(result.options[0].available, true);
assert.equal(result.options[0].maxDownMbps, 1000);
assert.equal(result.options[0].maxUpMbps, 50);

console.log("HFC capability provider tests passed");
