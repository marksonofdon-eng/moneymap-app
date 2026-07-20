-- Switch spend_categories from HECC subclasses to Basiq L4 → end-user UI mapping.

ALTER TABLE "basiq_transactions" DROP CONSTRAINT IF EXISTS "basiq_transactions_subclass_code_fkey";

-- Clear HECC rows; reseeding loads Basiq L4 codes as subclass_code.
DELETE FROM "spend_categories";

ALTER TABLE "spend_categories"
  ADD COLUMN IF NOT EXISTS "parent_category" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "expense_category" VARCHAR(120);

UPDATE "spend_categories"
SET
  "parent_category" = COALESCE("parent_category", 'Miscellaneous'),
  "expense_category" = COALESCE("expense_category", "subclass_title");

ALTER TABLE "spend_categories"
  ALTER COLUMN "parent_category" SET NOT NULL,
  ALTER COLUMN "expense_category" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_spend_categories_parent_category"
  ON "spend_categories"("parent_category");
CREATE INDEX IF NOT EXISTS "idx_spend_categories_expense_category"
  ON "spend_categories"("expense_category");

ALTER TABLE "basiq_transactions"
  ADD COLUMN IF NOT EXISTS "parent_category" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "expense_category" VARCHAR(120);

-- Reset prior HECC assignments so backfill can remap.
UPDATE "basiq_transactions"
SET
  "subclass_code" = NULL,
  "group_code" = NULL,
  "parent_category" = NULL,
  "expense_category" = NULL,
  "category_source" = NULL,
  "category_matcher_version" = NULL,
  "category_confidence" = NULL,
  "categorised_at" = NULL;

ALTER TABLE "basiq_transactions"
  ADD CONSTRAINT "basiq_transactions_subclass_code_fkey"
  FOREIGN KEY ("subclass_code") REFERENCES "spend_categories"("subclass_code")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_basiq_transactions_owner_parent_category"
  ON "basiq_transactions"("owner_user_id", "parent_category");
CREATE INDEX IF NOT EXISTS "idx_basiq_transactions_owner_expense_category"
  ON "basiq_transactions"("owner_user_id", "expense_category");

-- Internet bills previously stamped with HECC 7 / 7.1 → Basiq L4 5801.
UPDATE "detected_bills"
SET
  "group_code" = 580,
  "subclass_code" = '5801'
WHERE "category" = 'INTERNET';
