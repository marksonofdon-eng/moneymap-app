import { prisma } from "../src/lib/db";
import { categoriseTransactionsForOwner } from "../src/server/data/categoriseTransactions";

const ownerArg = process.argv.find((arg) => arg.startsWith("--owner="));
const force = process.argv.includes("--force");
const requestedOwnerId = ownerArg?.slice("--owner=".length);

async function main() {
  const users = await prisma.user.findMany({
    where: requestedOwnerId ? { id: requestedOwnerId } : undefined,
    select: { id: true },
  });

  let ownersScanned = 0;
  let totalUpdated = 0;
  let totalMatched = 0;

  for (const user of users) {
    const result = await categoriseTransactionsForOwner(user.id, { force });
    if (result.transactionsScanned === 0) continue;
    ownersScanned += 1;
    totalUpdated += result.updated;
    totalMatched += result.matched;
    console.log(JSON.stringify({ owner: user.id.slice(0, 8), ...result }));
  }

  console.log(JSON.stringify({ ownersScanned, totalUpdated, totalMatched, force }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
