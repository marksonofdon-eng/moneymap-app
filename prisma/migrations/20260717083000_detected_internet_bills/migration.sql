-- Step 1 of expense detection: persist recurring bills and their transaction evidence.

CREATE TYPE "expense_category" AS ENUM ('INTERNET');
CREATE TYPE "detected_bill_status" AS ENUM ('DETECTED', 'CONFIRMED', 'DISMISSED');
CREATE TYPE "billing_cadence" AS ENUM ('MONTHLY');

CREATE TABLE "detected_bills" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "category" "expense_category" NOT NULL DEFAULT 'INTERNET',
    "series_key" VARCHAR(160) NOT NULL,
    "provider_key" VARCHAR(64) NOT NULL,
    "provider_name" VARCHAR(120) NOT NULL,
    "estimated_monthly_cost_aud" DECIMAL(12,2) NOT NULL,
    "cadence" "billing_cadence" NOT NULL DEFAULT 'MONTHLY',
    "confidence" INTEGER NOT NULL,
    "status" "detected_bill_status" NOT NULL DEFAULT 'DETECTED',
    "occurrence_count" INTEGER NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "matcher_version" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detected_bills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "detected_bills_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
    CONSTRAINT "detected_bills_occurrence_count_check" CHECK ("occurrence_count" >= 2),
    CONSTRAINT "detected_bills_monthly_cost_check" CHECK ("estimated_monthly_cost_aud" > 0)
);

CREATE TABLE "bill_evidence" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "detected_bill_id" TEXT NOT NULL,
    "transaction_id" VARCHAR(64) NOT NULL,
    "matched_provider_key" VARCHAR(64) NOT NULL,
    "matched_text" TEXT NOT NULL,
    "match_score" INTEGER NOT NULL,
    "match_reasons" TEXT[] NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bill_evidence_match_score_check" CHECK ("match_score" BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX "uq_detected_bills_owner_category_series"
  ON "detected_bills"("owner_user_id", "category", "series_key");
CREATE INDEX "idx_detected_bills_owner_category_status"
  ON "detected_bills"("owner_user_id", "category", "status");
CREATE INDEX "idx_detected_bills_owner_last_seen"
  ON "detected_bills"("owner_user_id", "last_seen_at" DESC);
CREATE UNIQUE INDEX "bill_evidence_transaction_id_key"
  ON "bill_evidence"("transaction_id");
CREATE INDEX "idx_bill_evidence_owner_bill"
  ON "bill_evidence"("owner_user_id", "detected_bill_id");

ALTER TABLE "detected_bills"
  ADD CONSTRAINT "detected_bills_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bill_evidence"
  ADD CONSTRAINT "bill_evidence_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bill_evidence"
  ADD CONSTRAINT "bill_evidence_detected_bill_id_fkey"
  FOREIGN KEY ("detected_bill_id") REFERENCES "detected_bills"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bill_evidence"
  ADD CONSTRAINT "bill_evidence_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "basiq_transactions"("transaction_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "detected_bills", "bill_evidence"
  TO moneymap_app, moneymap_ingest;

ALTER TABLE "detected_bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "detected_bills" FORCE ROW LEVEL SECURITY;
ALTER TABLE "bill_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bill_evidence" FORCE ROW LEVEL SECURITY;

CREATE POLICY detected_bills_owner_isolation ON "detected_bills"
  FOR ALL
  TO moneymap_app
  USING ("owner_user_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_user_id" = current_setting('app.current_user_id', true));

CREATE POLICY bill_evidence_owner_isolation ON "bill_evidence"
  FOR ALL
  TO moneymap_app
  USING ("owner_user_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_user_id" = current_setting('app.current_user_id', true));
