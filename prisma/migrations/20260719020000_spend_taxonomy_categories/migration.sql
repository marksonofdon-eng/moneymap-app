-- Spend taxonomy + per-transaction category assignment.

CREATE TYPE "category_source" AS ENUM ('BASIQ_ENRICH', 'KEYWORD', 'MANUAL', 'UNMATCHED');

ALTER TYPE "expense_category" ADD VALUE 'OTHER';

CREATE TABLE "spend_categories" (
    "group_code" INTEGER NOT NULL,
    "group_title" VARCHAR(200) NOT NULL,
    "subclass_code" VARCHAR(16) NOT NULL,
    "subclass_title" VARCHAR(200) NOT NULL,
    "full_label" VARCHAR(240) NOT NULL,

    CONSTRAINT "spend_categories_pkey" PRIMARY KEY ("subclass_code")
);

CREATE INDEX "idx_spend_categories_group_code" ON "spend_categories"("group_code");

ALTER TABLE "basiq_transactions"
  ADD COLUMN "subclass_code" VARCHAR(16),
  ADD COLUMN "group_code" INTEGER,
  ADD COLUMN "category_confidence" INTEGER,
  ADD COLUMN "category_source" "category_source",
  ADD COLUMN "category_matcher_version" VARCHAR(32),
  ADD COLUMN "categorised_at" TIMESTAMPTZ(6);

ALTER TABLE "basiq_transactions"
  ADD CONSTRAINT "basiq_transactions_category_confidence_check"
  CHECK ("category_confidence" IS NULL OR ("category_confidence" BETWEEN 0 AND 100));

ALTER TABLE "basiq_transactions"
  ADD CONSTRAINT "basiq_transactions_subclass_code_fkey"
  FOREIGN KEY ("subclass_code") REFERENCES "spend_categories"("subclass_code")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_basiq_transactions_owner_group_post_date"
  ON "basiq_transactions"("owner_user_id", "group_code", "post_date" DESC);
CREATE INDEX "idx_basiq_transactions_owner_subclass"
  ON "basiq_transactions"("owner_user_id", "subclass_code");
CREATE INDEX "idx_basiq_transactions_owner_category_source"
  ON "basiq_transactions"("owner_user_id", "category_source");

ALTER TABLE "detected_bills"
  ADD COLUMN "group_code" INTEGER,
  ADD COLUMN "subclass_code" VARCHAR(16);

CREATE INDEX "idx_detected_bills_owner_group_status"
  ON "detected_bills"("owner_user_id", "group_code", "status");

GRANT SELECT, INSERT, UPDATE, DELETE ON "spend_categories" TO moneymap_app, moneymap_ingest;
