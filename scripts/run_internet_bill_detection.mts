import { prisma } from "../src/lib/db";
import { detectInternetBillsForOwner } from "../src/server/data/internetBills";

const ownerArg = process.argv.find((arg) => arg.startsWith("--owner="));
const requestedOwnerId = ownerArg?.slice("--owner=".length);

async function main() {
  const users = await prisma.user.findMany({
    where: requestedOwnerId ? { id: requestedOwnerId } : undefined,
    select: { id: true },
  });

  let ownersScanned = 0;
  let billsDetected = 0;
  for (const user of users) {
    // The detector establishes this owner's RLS context before reading rows.
    const result = await detectInternetBillsForOwner(user.id);
    if (result.transactionsScanned === 0) continue;
    ownersScanned += 1;
    billsDetected += result.billsDetected;
    console.log(
      JSON.stringify({
        owner: user.id.slice(0, 8),
        ...result,
      }),
    );
  }

  console.log(JSON.stringify({ ownersScanned, billsDetected }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
