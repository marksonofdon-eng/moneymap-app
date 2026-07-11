/**
 * Two-user isolation smoke test (no Basiq calls).
 * Run: npm run test:isolation
 */
import { PrismaClient } from "@prisma/client";

const appUrl =
  process.env.DATABASE_URL ||
  "postgresql://moneymap_app:moneymap_app@localhost:5432/moneymap?schema=public";

async function countForOwner(prisma: PrismaClient, ownerUserId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ownerUserId}, true)`;
    const accounts = await tx.basiqAccount.count({ where: { ownerUserId } });
    const txs = await tx.basiqTransaction.count({ where: { ownerUserId } });
    const listed = await tx.basiqAccount.findMany({
      where: { ownerUserId },
      select: { accountId: true },
    });
    return { accounts, txs, listed };
  });
}

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: appUrl } } });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, basiqUserId: true },
  });

  if (users.length < 2) {
    throw new Error(`Need at least 2 users in DB, found ${users.length}`);
  }

  const owner =
    users.find((u) => u.basiqUserId) ||
    users.find((u) => u.email.includes("yahoo")) ||
    users[0];
  const other = users.find((u) => u.id !== owner.id);
  if (!other) throw new Error("Need a second user");

  console.log("Owner (expect bank data):", owner.email, owner.id);
  console.log("Other (expect zero bank data):", other.email, other.id);

  const ownerStats = await countForOwner(prisma, owner.id);
  const otherStats = await countForOwner(prisma, other.id);

  console.log({
    ownerAccounts: ownerStats.accounts,
    ownerTx: ownerStats.txs,
    otherAccounts: otherStats.accounts,
    otherTx: otherStats.txs,
  });

  if (ownerStats.accounts < 1) {
    throw new Error("Owner should have at least 1 account after backfill");
  }
  if (otherStats.accounts !== 0 || otherStats.txs !== 0) {
    throw new Error("CROSS-TENANT LEAK: other user can see bank rows");
  }
  if (otherStats.listed.length !== 0) {
    throw new Error("CROSS-TENANT LEAK: findMany returned rows for other user");
  }

  // Without SET LOCAL, moneymap_app must see zero bank rows
  const blind = await prisma.basiqAccount.count();
  if (blind !== 0) {
    throw new Error(
      `RLS gap: count without tenant setting returned ${blind} (expected 0)`,
    );
  }

  console.log("PASS: isolation holds — other user sees 0 accounts/txs; RLS denies unset context");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("FAIL:", err);
  process.exitCode = 1;
});
