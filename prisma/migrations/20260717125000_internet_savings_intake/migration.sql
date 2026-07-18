-- Step 2: service address + internet need profile for Internet Savings intake.

CREATE TYPE "australian_state" AS ENUM ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA');

CREATE TABLE "user_addresses" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "line1" VARCHAR(200) NOT NULL,
    "line2" VARCHAR(200),
    "suburb" VARCHAR(120) NOT NULL,
    "state" "australian_state" NOT NULL,
    "postcode" VARCHAR(4) NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'AU',
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_addresses_postcode_check" CHECK ("postcode" ~ '^[0-9]{4}$')
);

CREATE TABLE "user_need_profiles" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "category" "expense_category" NOT NULL DEFAULT 'INTERNET',
    "detected_bill_id" TEXT,
    "service_address_id" TEXT,
    "min_download_mbps" INTEGER NOT NULL,
    "allow_wired" BOOLEAN NOT NULL DEFAULT true,
    "allow_5g" BOOLEAN NOT NULL DEFAULT true,
    "allow_starlink" BOOLEAN NOT NULL DEFAULT true,
    "ready_for_assess" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_need_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_need_profiles_min_download_check" CHECK ("min_download_mbps" > 0),
    CONSTRAINT "user_need_profiles_delivery_check" CHECK (
      "allow_wired" OR "allow_5g" OR "allow_starlink"
    )
);

CREATE UNIQUE INDEX "uq_user_addresses_owner"
  ON "user_addresses"("owner_user_id");
CREATE INDEX "idx_user_addresses_owner_postcode"
  ON "user_addresses"("owner_user_id", "postcode");
CREATE UNIQUE INDEX "uq_user_need_profiles_owner_category"
  ON "user_need_profiles"("owner_user_id", "category");
CREATE INDEX "idx_user_need_profiles_owner_ready"
  ON "user_need_profiles"("owner_user_id", "ready_for_assess");

ALTER TABLE "user_addresses"
  ADD CONSTRAINT "user_addresses_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_need_profiles"
  ADD CONSTRAINT "user_need_profiles_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_need_profiles"
  ADD CONSTRAINT "user_need_profiles_detected_bill_id_fkey"
  FOREIGN KEY ("detected_bill_id") REFERENCES "detected_bills"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_need_profiles"
  ADD CONSTRAINT "user_need_profiles_service_address_id_fkey"
  FOREIGN KEY ("service_address_id") REFERENCES "user_addresses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "user_addresses", "user_need_profiles"
  TO moneymap_app, moneymap_ingest;

ALTER TABLE "user_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_addresses" FORCE ROW LEVEL SECURITY;
ALTER TABLE "user_need_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_need_profiles" FORCE ROW LEVEL SECURITY;

CREATE POLICY user_addresses_owner_isolation ON "user_addresses"
  FOR ALL
  TO moneymap_app
  USING ("owner_user_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_user_id" = current_setting('app.current_user_id', true));

CREATE POLICY user_need_profiles_owner_isolation ON "user_need_profiles"
  FOR ALL
  TO moneymap_app
  USING ("owner_user_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_user_id" = current_setting('app.current_user_id', true));
