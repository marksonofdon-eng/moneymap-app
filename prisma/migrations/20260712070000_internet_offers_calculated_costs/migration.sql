-- Calculated first-year economics for bill comparison ranking.
-- Temporary defaults allow migrate against existing rows; ingestion overwrites.
ALTER TABLE "internet_market_offers"
  ADD COLUMN "calculated_first_year_total_cost_aud" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "calculated_true_average_monthly_cost_aud" DECIMAL(12, 4) NOT NULL DEFAULT 0,
  ADD COLUMN "calculated_cost_per_mbps_metric" DECIMAL(12, 6) NOT NULL DEFAULT 0;

ALTER TABLE "internet_market_offers"
  ALTER COLUMN "calculated_first_year_total_cost_aud" DROP DEFAULT,
  ALTER COLUMN "calculated_true_average_monthly_cost_aud" DROP DEFAULT,
  ALTER COLUMN "calculated_cost_per_mbps_metric" DROP DEFAULT;

-- Optimized ascending sort for cheapest true average monthly cost.
CREATE INDEX "idx_internet_market_offers_true_avg_monthly_asc"
  ON "internet_market_offers" ("calculated_true_average_monthly_cost_aud" ASC);
