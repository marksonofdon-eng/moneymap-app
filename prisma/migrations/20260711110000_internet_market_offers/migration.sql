-- CreateEnum
CREATE TYPE "internet_connection_type" AS ENUM (
  'FTTP',
  'FTTN',
  'FTTC',
  'HFC',
  'Fixed Wireless',
  '5G Wireless'
);

-- CreateEnum
CREATE TYPE "internet_data_allowance" AS ENUM (
  'Unlimited',
  'Capped'
);

-- CreateTable
CREATE TABLE "internet_market_offers" (
  "id" SERIAL NOT NULL,
  "provider_name" TEXT NOT NULL,
  "plan_name" TEXT NOT NULL,
  "connection_type" "internet_connection_type" NOT NULL,
  "max_download_speed" INTEGER NOT NULL,
  "typical_evening_speed" INTEGER NOT NULL,
  "upload_speed" INTEGER NOT NULL,
  "ongoing_monthly_cost" DECIMAL(10, 2) NOT NULL,
  "promo_monthly_cost" DECIMAL(10, 2) NOT NULL,
  "promo_duration_months" INTEGER NOT NULL DEFAULT 0,
  "modem_cost" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "setup_fee" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "exit_fee" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "data_allowance" "internet_data_allowance" NOT NULL,
  "contract_term_months" INTEGER NOT NULL,
  "bundled_perks_notes" TEXT,
  "last_updated" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "internet_market_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_internet_market_offers_provider_name"
  ON "internet_market_offers"("provider_name");

CREATE INDEX "idx_internet_market_offers_connection_type"
  ON "internet_market_offers"("connection_type");

CREATE INDEX "idx_internet_market_offers_ongoing_monthly_cost"
  ON "internet_market_offers"("ongoing_monthly_cost");

-- App / ingest roles (created in earlier migrations)
GRANT SELECT, INSERT, UPDATE, DELETE ON "internet_market_offers" TO moneymap_app, moneymap_ingest;
GRANT USAGE, SELECT ON SEQUENCE "internet_market_offers_id_seq" TO moneymap_app, moneymap_ingest;
