import { proposeSecondaryRules } from "../src/server/taxonomy/secondaryPatterns/proposeRules";

async function main() {
  const useLlm = process.argv.includes("--llm");
  const run = await proposeSecondaryRules({ useLlm });
  console.log(JSON.stringify(run, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
