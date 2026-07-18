-- Add postcode targeting + network owner for market offer matching
ALTER TABLE "internet_market_offers"
  ADD COLUMN "target_postcode" VARCHAR(16) NOT NULL DEFAULT 'ALL',
  ADD COLUMN "network_owner" VARCHAR(64) NOT NULL DEFAULT 'NBN';

CREATE INDEX "idx_internet_market_offers_target_postcode"
  ON "internet_market_offers"("target_postcode");
