import { buildMerchantMapFromLabels } from "../src/server/taxonomy/merchantMap";

async function main() {
  const run = await buildMerchantMapFromLabels();
  console.log(JSON.stringify(run, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
