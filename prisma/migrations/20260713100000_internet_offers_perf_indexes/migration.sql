-- Performance indexes for admin internet offers at scale
CREATE INDEX IF NOT EXISTS "idx_internet_market_offers_network_owner"
  ON "internet_market_offers"("network_owner");

CREATE INDEX IF NOT EXISTS "idx_internet_market_offers_max_download_speed"
  ON "internet_market_offers"("max_download_speed");

CREATE INDEX IF NOT EXISTS "idx_internet_market_offers_typical_evening_speed"
  ON "internet_market_offers"("typical_evening_speed");

CREATE INDEX IF NOT EXISTS "idx_internet_market_offers_last_updated"
  ON "internet_market_offers"("last_updated");

CREATE INDEX IF NOT EXISTS "idx_internet_market_offers_status_updated_at"
  ON "internet_market_offers"("status_updated_at");

-- Trigram indexes for ILIKE search on provider/plan
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "idx_internet_market_offers_provider_name_trgm"
  ON "internet_market_offers" USING GIN ("provider_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_internet_market_offers_plan_name_trgm"
  ON "internet_market_offers" USING GIN ("plan_name" gin_trgm_ops);
