-- Hybrid secondary categorisation: MODEL source + merchant_category_map.

ALTER TYPE "category_source" ADD VALUE IF NOT EXISTS 'MODEL';

DO $$ BEGIN
  CREATE TYPE "merchant_map_source" AS ENUM ('LABELLED', 'RULE', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "merchant_category_map" (
  "id" TEXT NOT NULL,
  "merchant_key" VARCHAR(120) NOT NULL,
  "parent_category" VARCHAR(80) NOT NULL,
  "expense_category" VARCHAR(120) NOT NULL,
  "flow_type" "transaction_flow" NOT NULL DEFAULT 'EXPENSE',
  "support_count" INTEGER NOT NULL DEFAULT 0,
  "agreement_pct" INTEGER NOT NULL DEFAULT 100,
  "source" "merchant_map_source" NOT NULL DEFAULT 'LABELLED',
  "matcher_version" VARCHAR(32) NOT NULL DEFAULT 'merchant-map-v1',
  "rule_id" VARCHAR(40),
  "created_by" VARCHAR(80) NOT NULL DEFAULT 'system',
  "notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "merchant_category_map_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merchant_category_map_agreement_check"
    CHECK ("agreement_pct" >= 0 AND "agreement_pct" <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_merchant_category_map_key"
  ON "merchant_category_map"("merchant_key");
CREATE INDEX IF NOT EXISTS "idx_merchant_category_map_rule"
  ON "merchant_category_map"("rule_id");

ALTER TABLE "merchant_category_map"
  DROP CONSTRAINT IF EXISTS "merchant_category_map_rule_id_fkey",
  ADD CONSTRAINT "merchant_category_map_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "secondary_category_rules"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "merchant_category_map" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS merchant_category_map_select ON "merchant_category_map";
CREATE POLICY merchant_category_map_select ON "merchant_category_map"
  FOR SELECT TO moneymap_app
  USING (true);

DROP POLICY IF EXISTS merchant_category_map_write ON "merchant_category_map";
CREATE POLICY merchant_category_map_write ON "merchant_category_map"
  FOR ALL TO moneymap_app
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON "merchant_category_map" TO moneymap_app, moneymap_ingest;
