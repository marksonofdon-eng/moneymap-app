-- Credit / income categorisation + Basiq Income API snapshots.

ALTER TYPE "category_source" ADD VALUE IF NOT EXISTS 'BASIQ_CLASS';
ALTER TYPE "category_source" ADD VALUE IF NOT EXISTS 'INCOME_API';

DO $$ BEGIN
  CREATE TYPE "transaction_flow" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "income_source_kind" AS ENUM ('REGULAR', 'IRREGULAR', 'OTHER_CREDIT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "basiq_transactions"
  ADD COLUMN IF NOT EXISTS "flow_type" "transaction_flow",
  ADD COLUMN IF NOT EXISTS "basiq_tx_class" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "income_source_id" TEXT;

CREATE INDEX IF NOT EXISTS "idx_basiq_transactions_owner_flow_type"
  ON "basiq_transactions"("owner_user_id", "flow_type");
CREATE INDEX IF NOT EXISTS "idx_basiq_transactions_owner_basiq_tx_class"
  ON "basiq_transactions"("owner_user_id", "basiq_tx_class");

CREATE TABLE IF NOT EXISTS "basiq_income_reports" (
  "id" VARCHAR(64) NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "basiq_user_id" VARCHAR(64) NOT NULL,
  "from_month" VARCHAR(7) NOT NULL,
  "to_month" VARCHAR(7) NOT NULL,
  "coverage_days" INTEGER,
  "generated_at" TIMESTAMPTZ(6),
  "regular_income_avg" DECIMAL(19,4),
  "regular_income_ytd" DECIMAL(19,4),
  "regular_income_year" DECIMAL(19,4),
  "irregular_income_avg" DECIMAL(19,4),
  "summary" JSONB,
  "raw_payload" JSONB NOT NULL,
  "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "basiq_income_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_basiq_income_reports_owner"
  ON "basiq_income_reports"("owner_user_id", "synced_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_basiq_income_reports_basiq_user"
  ON "basiq_income_reports"("basiq_user_id");

CREATE TABLE IF NOT EXISTS "basiq_income_sources" (
  "id" TEXT NOT NULL,
  "report_id" VARCHAR(64) NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "kind" "income_source_kind" NOT NULL,
  "source" VARCHAR(240) NOT NULL,
  "frequency" VARCHAR(32),
  "age_days" INTEGER,
  "stability" DECIMAL(6,4),
  "amount_avg" DECIMAL(19,4),
  "amount_avg_monthly" DECIMAL(19,4),
  "occurrence_count" INTEGER,
  "avg_monthly_occurrence" DECIMAL(12,4),
  "current_amount" DECIMAL(19,4),
  "current_date" TIMESTAMPTZ(6),
  "next_date" TIMESTAMPTZ(6),
  "other_credit_label" VARCHAR(120),
  "parent_category" VARCHAR(80) NOT NULL DEFAULT 'Income',
  "income_category" VARCHAR(120) NOT NULL,
  "raw_payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "basiq_income_sources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_basiq_income_sources_owner_kind"
  ON "basiq_income_sources"("owner_user_id", "kind");
CREATE INDEX IF NOT EXISTS "idx_basiq_income_sources_report"
  ON "basiq_income_sources"("report_id");
CREATE INDEX IF NOT EXISTS "idx_basiq_income_sources_owner_category"
  ON "basiq_income_sources"("owner_user_id", "income_category");

ALTER TABLE "basiq_income_reports"
  DROP CONSTRAINT IF EXISTS "basiq_income_reports_owner_user_id_fkey",
  ADD CONSTRAINT "basiq_income_reports_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "basiq_income_sources"
  DROP CONSTRAINT IF EXISTS "basiq_income_sources_report_id_fkey",
  ADD CONSTRAINT "basiq_income_sources_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "basiq_income_reports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "basiq_income_sources"
  DROP CONSTRAINT IF EXISTS "basiq_income_sources_owner_user_id_fkey",
  ADD CONSTRAINT "basiq_income_sources_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "basiq_transactions"
  DROP CONSTRAINT IF EXISTS "basiq_transactions_income_source_id_fkey",
  ADD CONSTRAINT "basiq_transactions_income_source_id_fkey"
    FOREIGN KEY ("income_source_id") REFERENCES "basiq_income_sources"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_basiq_transactions_income_source"
  ON "basiq_transactions"("income_source_id");

ALTER TABLE "basiq_income_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "basiq_income_sources" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS basiq_income_reports_owner_isolation ON "basiq_income_reports";
CREATE POLICY basiq_income_reports_owner_isolation ON "basiq_income_reports"
  FOR ALL TO moneymap_app
  USING ("owner_user_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_user_id" = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS basiq_income_sources_owner_isolation ON "basiq_income_sources";
CREATE POLICY basiq_income_sources_owner_isolation ON "basiq_income_sources"
  FOR ALL TO moneymap_app
  USING ("owner_user_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_user_id" = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "basiq_income_reports" TO moneymap_app, moneymap_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON "basiq_income_sources" TO moneymap_app, moneymap_ingest;
