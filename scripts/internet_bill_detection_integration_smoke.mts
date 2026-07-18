import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getIngestPrisma } from "../src/server/data/dbContext";
import {
  detectInternetBillsForOwner,
  listInternetBillsForOwner,
  updateInternetBillStatusForOwner,
} from "../src/server/data/internetBills";

const db = getIngestPrisma();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const ownerUserId = `smoke-user-${suffix}`;
const accountId = `smoke-account-${suffix}`;

function monthsAgo(months: number) {
  const date = new Date();
  date.setUTCDate(5);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date;
}

async function main() {
  await db.user.create({
    data: {
      id: ownerUserId,
      email: `internet-smoke-${suffix}@example.invalid`,
      passwordHash: "not-a-login-account",
    },
  });
  await db.basiqAccount.create({
    data: {
      accountId,
      ownerUserId,
      basiqUserId: `smoke-basiq-${suffix}`,
      name: "Detection smoke account",
    },
  });

  for (const [index, amount] of [89, 89, 91].entries()) {
    await db.basiqTransaction.create({
      data: {
        transactionId: `smoke-tx-${suffix}-${index}`,
        ownerUserId,
        accountId,
        amount,
        direction: "debit",
        postDate: monthsAgo(2 - index),
        status: "posted",
        rawPayload: {
          description: "Monthly service",
          enrich: {
            merchant: { businessName: "Aussie Broadband" },
          },
        },
      },
    });
  }

  const run = await detectInternetBillsForOwner(ownerUserId);
  assert.equal(run.billsDetected, 1);
  assert.equal(run.evidenceLinked, 3);

  let bills = await listInternetBillsForOwner(ownerUserId);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].providerName, "Aussie Broadband");
  assert.equal(bills[0].status, "DETECTED");

  const status = await updateInternetBillStatusForOwner(
    ownerUserId,
    bills[0].id,
    "CONFIRMED",
  );
  assert.equal(status?.status, "CONFIRMED");

  await detectInternetBillsForOwner(ownerUserId);
  bills = await listInternetBillsForOwner(ownerUserId);
  assert.equal(bills[0].status, "CONFIRMED");
  assert.equal(bills[0].evidence.length, 3);

  console.log("Internet bill persistence and review smoke test passed");
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
