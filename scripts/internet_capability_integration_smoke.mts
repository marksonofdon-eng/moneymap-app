import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getIngestPrisma } from "../src/server/data/dbContext";
import {
  assessInternetCapabilitiesForOwner,
  getLatestInternetCapabilities,
} from "../src/server/data/internetCapabilities";
import { upsertInternetSavingsIntake } from "../src/server/data/internetSavings";

const db = getIngestPrisma();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const ownerUserId = `capability-user-${suffix}`;

async function main() {
  await db.user.create({
    data: {
      id: ownerUserId,
      email: `capability-${suffix}@example.invalid`,
      passwordHash: "not-a-login-account",
    },
  });
  await db.detectedBill.create({
    data: {
      ownerUserId,
      category: "INTERNET",
      seriesKey: `aussie-broadband:account-${suffix}`,
      providerKey: "aussie-broadband",
      providerName: "Aussie Broadband",
      estimatedMonthlyCostAud: new Prisma.Decimal(89),
      cadence: "MONTHLY",
      confidence: 95,
      status: "DETECTED",
      occurrenceCount: 3,
      firstSeenAt: new Date("2026-01-01T00:00:00Z"),
      lastSeenAt: new Date("2026-03-01T00:00:00Z"),
      matcherVersion: "internet-v1",
    },
  });

  const beforeIntake = await assessInternetCapabilitiesForOwner(ownerUserId);
  assert.equal(beforeIntake.ok, false);
  assert.equal(beforeIntake.error, "intake_not_ready");

  const intake = await upsertInternetSavingsIntake(ownerUserId, {
    line1: "12 Example Street",
    suburb: "Sydney",
    state: "NSW",
    postcode: "2000",
    minDownloadMbps: 100,
    allowWired: true,
    allow5g: true,
    allowStarlink: true,
  });
  assert.equal(intake.ok, true);

  const first = await assessInternetCapabilitiesForOwner(ownerUserId);
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error("Expected a successful assessment");
  assert.equal(first.data.status, "READY");
  assert.equal(first.data.stale, false);
  assert.equal(first.data.options.length, 1);
  assert.equal(first.data.options[0].connectionType, "HFC");
  assert.equal(first.data.options[0].available, true);

  const latest = await getLatestInternetCapabilities(ownerUserId);
  assert.equal(latest?.id, first.data.id);
  assert.equal(latest?.options[0].maxDownMbps, 1000);

  const second = await assessInternetCapabilitiesForOwner(ownerUserId);
  assert.equal(second.ok, true);
  if (!second.ok) throw new Error("Expected a successful reassessment");
  assert.notEqual(second.data.id, first.data.id);

  const assessmentCount = await db.addressCapabilityAssessment.count({
    where: { ownerUserId },
  });
  assert.equal(assessmentCount, 2);

  console.log("Internet capability persistence smoke test passed");
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
