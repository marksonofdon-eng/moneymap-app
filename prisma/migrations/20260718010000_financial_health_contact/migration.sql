-- Financial Health Check interest flag on users.

ALTER TABLE "users"
  ADD COLUMN "financial_health_contact_requested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "financial_health_contact_at" TIMESTAMPTZ(6);
