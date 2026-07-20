import { mineSecondaryPatterns } from "../src/server/taxonomy/secondaryPatterns/miner";

async function main() {
  const result = await mineSecondaryPatterns();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
