-- Stage 3: persist address-level internet capability assessments.

CREATE TYPE "capability_assessment_status" AS ENUM ('PENDING', 'READY', 'FAILED');
CREATE TYPE "internet_access_family" AS ENUM ('NBN', 'FIVE_G', 'STARLINK');

CREATE TABLE "address_capability_assessments" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "address_id" TEXT NOT NULL,
    "address_fingerprint" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "status" "capability_assessment_status" NOT NULL DEFAULT 'PENDING',
    "checked_at" TIMESTAMPTZ(6) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "address_capability_assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "address_access_options" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "access_family" "internet_access_family" NOT NULL,
    "connection_type" "internet_connection_type",
    "available" BOOLEAN NOT NULL,
    "max_down_mbps" INTEGER,
    "max_up_mbps" INTEGER,
    "typical_evening_mbps" INTEGER,
    "confidence" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "address_access_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "address_access_options_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
    CONSTRAINT "address_access_options_max_down_check" CHECK ("max_down_mbps" IS NULL OR "max_down_mbps" > 0),
    CONSTRAINT "address_access_options_max_up_check" CHECK ("max_up_mbps" IS NULL OR "max_up_mbps" > 0),
    CONSTRAINT "address_access_options_evening_check" CHECK ("typical_evening_mbps" IS NULL OR "typical_evening_mbps" > 0)
);

CREATE INDEX "idx_capability_assessments_owner_address_checked"
  ON "address_capability_assessments"("owner_user_id", "address_id", "checked_at" DESC);
CREATE INDEX "idx_capability_assessments_owner_status"
  ON "address_capability_assessments"("owner_user_id", "status");
CREATE INDEX "idx_access_options_owner_family_available"
  ON "address_access_options"("owner_user_id", "access_family", "available");
CREATE INDEX "idx_access_options_assessment"
  ON "address_access_options"("assessment_id");

ALTER TABLE "address_capability_assessments"
  ADD CONSTRAINT "address_capability_assessments_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "address_capability_assessments"
  ADD CONSTRAINT "address_capability_assessments_address_id_fkey"
  FOREIGN KEY ("address_id") REFERENCES "user_addresses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "address_access_options"
  ADD CONSTRAINT "address_access_options_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "address_access_options"
  ADD CONSTRAINT "address_access_options_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "address_capability_assessments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON "address_capability_assessments", "address_access_options"
  TO moneymap_app, moneymap_ingest;

ALTER TABLE "address_capability_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "address_capability_assessments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "address_access_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "address_access_options" FORCE ROW LEVEL SECURITY;

CREATE POLICY capability_assessments_owner_isolation
  ON "address_capability_assessments"
  FOR ALL
  TO moneymap_app
  USING ("owner_user_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_user_id" = current_setting('app.current_user_id', true));

CREATE POLICY access_options_owner_isolation
  ON "address_access_options"
  FOR ALL
  TO moneymap_app
  USING ("owner_user_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_user_id" = current_setting('app.current_user_id', true));
