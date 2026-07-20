import { prisma } from "../src/lib/db";
import { syncIncomeForOwner } from "../src/server/data/syncIncome";

const ownerArg = process.argv.find((arg) => arg.startsWith("--owner="));
const requestedOwnerId = ownerArg?.slice("--owner=".length);

async function main() {
  const users = await prisma.user.findMany({
    where: {
      ...(requestedOwnerId ? { id: requestedOwnerId } : {}),
      basiqUserId: { not: null },
    },
    select: { id: true, basiqUserId: true },
  });

  for (const user of users) {
    if (!user.basiqUserId) continue;
    const result = await syncIncomeForOwner(user.id, user.basiqUserId);
    console.log(JSON.stringify({ owner: user.id.slice(0, 8), ...result }));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
