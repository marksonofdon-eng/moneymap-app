import { getIngestPrisma } from "../src/server/data/dbContext";
import {
  extractTxFeatures,
  extractMerchantToken,
  descriptionFromPayload,
} from "../src/server/taxonomy/features";
import {
  saveCategoryModel,
  trainCategoryModel,
  type TrainExample,
} from "../src/server/taxonomy/secondaryModel";

async function main() {
  const db = getIngestPrisma();
  const rows = await db.basiqTransaction.findMany({
    where: {
      categorySource: {
        in: [
          "BASIQ_ENRICH",
          "KEYWORD",
          "BASIQ_CLASS",
          "INCOME_API",
          "SECONDARY_PATTERN",
        ],
      },
      parentCategory: { not: null },
      expenseCategory: { not: null },
    },
    select: {
      rawPayload: true,
      direction: true,
      parentCategory: true,
      expenseCategory: true,
      flowType: true,
      categorySource: true,
      categoryConfidence: true,
      postDate: true,
    },
    take: 100_000,
  });

  const examples: TrainExample[] = [];
  for (const row of rows) {
    if (!row.parentCategory || !row.expenseCategory) continue;
    // Prefer primary labels; allow high-confidence secondary.
    if (
      row.categorySource === "SECONDARY_PATTERN" &&
      (row.categoryConfidence == null || row.categoryConfidence < 90)
    ) {
      continue;
    }
    const features = extractTxFeatures(row.rawPayload, row.direction);
    examples.push({
      features,
      parentCategory: row.parentCategory,
      expenseCategory: row.expenseCategory,
      flowType: row.flowType ?? "EXPENSE",
      merchantKey: extractMerchantToken(descriptionFromPayload(row.rawPayload)),
    });
  }

  console.log(`Training on ${examples.length} examples…`);
  const artefact = trainCategoryModel(examples);
  const path = saveCategoryModel(artefact);
  console.log(
    JSON.stringify(
      {
        saved: path,
        version: artefact.version,
        metrics: artefact.metrics,
        labels: artefact.labels.length,
        hint: `Set CATEGORY_MODEL_VERSION=${artefact.version} (and CATEGORY_MODEL_SHADOW=1 for shadow week)`,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
