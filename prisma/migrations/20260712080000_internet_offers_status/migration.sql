-- Offer lifecycle status for admin review workflows.
CREATE TYPE "internet_offer_status" AS ENUM ('Active', 'Expired', 'Draft', 'Hold');

ALTER TABLE "internet_market_offers"
  ADD COLUMN "status" "internet_offer_status" NOT NULL DEFAULT 'Draft',
  ADD COLUMN "status_updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW();

-- last_updated remains a market/plan timestamp; Prisma @updatedAt is removed in schema.
-- Existing values are preserved.

CREATE INDEX "idx_internet_market_offers_status"
  ON "internet_market_offers" ("status");
