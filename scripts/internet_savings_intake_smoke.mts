import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getIngestPrisma } from "../src/server/data/dbContext";
import {
  getInternetSavingsState,
  upsertInternetSavingsIntake,
} from "../src/server/data/internetSavings";

const db = getIngestPrisma();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const ownerUserId = `savings-user-${suffix}`;

async function main() {
  await db.user.create({
    data: {
      id: ownerUserId,
      email: `internet-savings-${suffix}@example.invalid`,
      passwordHash: "not-a-login-account",
    },
  });

  let state = await getInternetSavingsState(ownerUserId);
  assert.equal(state.buttonTone, "amber");
  assert.equal(state.hasDetectedBill, false);

  const blocked = await upsertInternetSavingsIntake(ownerUserId, {
    line1: "12 Example Street",
    suburb: "Sydney",
    state: "NSW",
    postcode: "2000",
    minDownloadMbps: 100,
    allowWired: true,
    allow5g: true,
    allowStarlink: false,
  });
  assert.equal(blocked.ok, false);

  await db.detectedBill.create({
    data: {
      ownerUserId,
      category: "INTERNET",
      seriesKey: `aussie-broadband:account-${suffix}`,
      providerKey: "aussie-broadband",
      providerName: "Aussie Broadband",
      estimatedMonthlyCostAud: new Prisma.Decimal(89),
      cadence: "MONTHLY",
      confidence: 92,
      status: "DETECTED",
      occurrenceCount: 3,
      firstSeenAt: new Date("2026-01-01T00:00:00Z"),
      lastSeenAt: new Date("2026-03-01T00:00:00Z"),
      matcherVersion: "internet-v1",
    },
  });

  state = await getInternetSavingsState(ownerUserId);
  assert.equal(state.buttonTone, "green");
  assert.equal(state.hasDetectedBill, true);

  const saved = await upsertInternetSavingsIntake(ownerUserId, {
    line1: "12 Example Street",
    suburb: "Sydney",
    state: "NSW",
    postcode: "2000",
    minDownloadMbps: 250,
    allowWired: true,
    allow5g: false,
    allowStarlink: true,
  });
  assert.equal(saved.ok, true);
  if (saved.ok) {
    assert.equal(saved.data.prefs.minDownloadMbps, 250);
    assert.equal(saved.data.prefs.allow5g, false);
    assert.equal(saved.data.prefs.readyForAssess, true);
    assert.equal(saved.data.address.postcode, "2000");
  }

  state = await getInternetSavingsState(ownerUserId);
  assert.equal(state.intakeReady, true);

  console.log("Internet savings intake persistence smoke test passed");
}

main()
  .finally(async () => {
    await db.user.deleteMany({ where: { id: ownerUserId } });
    await db.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
