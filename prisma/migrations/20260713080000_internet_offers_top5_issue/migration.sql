ALTER TABLE "internet_market_offers"
  ADD COLUMN "top5" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "issue" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "idx_internet_market_offers_top5"
  ON "internet_market_offers" ("top5");

CREATE INDEX "idx_internet_market_offers_issue"
  ON "internet_market_offers" ("issue");
