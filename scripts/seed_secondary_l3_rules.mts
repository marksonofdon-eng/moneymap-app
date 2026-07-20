import { seedSecondaryL3Rules } from "../src/server/taxonomy/secondaryPatterns/seedL3Rules";

async function main() {
  const result = await seedSecondaryL3Rules();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
