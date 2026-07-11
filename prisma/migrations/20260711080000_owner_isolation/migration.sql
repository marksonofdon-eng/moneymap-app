-- Multi-user isolation: owner_user_id tenant key + rename Basiq external id column.

-- 1) Accounts: rename Basiq user column, add MoneyMap owner
ALTER TABLE "basiq_accounts" RENAME COLUMN "user_id" TO "basiq_user_id";

DROP INDEX IF EXISTS "idx_basiq_accounts_user_id";

ALTER TABLE "basiq_accounts" ADD COLUMN "owner_user_id" TEXT;

UPDATE "basiq_accounts" a
SET "owner_user_id" = u."id"
FROM "users" u
WHERE u."basiq_user_id" = a."basiq_user_id";

-- Fail closed: drop bank rows that cannot be attributed to a MoneyMap user
DELETE FROM "basiq_transactions" t
WHERE NOT EXISTS (
  SELECT 1 FROM "basiq_accounts" a
  WHERE a."account_id" = t."account_id" AND a."owner_user_id" IS NOT NULL
);

DELETE FROM "basiq_accounts" WHERE "owner_user_id" IS NULL;

ALTER TABLE "basiq_accounts" ALTER COLUMN "owner_user_id" SET NOT NULL;

ALTER TABLE "basiq_accounts"
  ADD CONSTRAINT "basiq_accounts_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_basiq_accounts_owner_user_id" ON "basiq_accounts"("owner_user_id");
CREATE INDEX "idx_basiq_accounts_owner_account" ON "basiq_accounts"("owner_user_id", "account_id");
CREATE INDEX "idx_basiq_accounts_basiq_user_id" ON "basiq_accounts"("basiq_user_id");

-- 2) Transactions: denormalized owner for RLS + fast filters
ALTER TABLE "basiq_transactions" ADD COLUMN "owner_user_id" TEXT;

UPDATE "basiq_transactions" t
SET "owner_user_id" = a."owner_user_id"
FROM "basiq_accounts" a
WHERE a."account_id" = t."account_id";

DELETE FROM "basiq_transactions" WHERE "owner_user_id" IS NULL;

ALTER TABLE "basiq_transactions" ALTER COLUMN "owner_user_id" SET NOT NULL;

ALTER TABLE "basiq_transactions"
  ADD CONSTRAINT "basiq_transactions_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "idx_basiq_transactions_post_date";
DROP INDEX IF EXISTS "idx_basiq_transactions_account_post_date";

CREATE INDEX "idx_basiq_transactions_owner_post_date"
  ON "basiq_transactions"("owner_user_id", "post_date" DESC);
CREATE INDEX "idx_basiq_transactions_owner_account_post_date"
  ON "basiq_transactions"("owner_user_id", "account_id", "post_date" DESC);

-- 3) App + ingest roles (local/dev). Superuser migrations still use postgres.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moneymap_app') THEN
    CREATE ROLE moneymap_app LOGIN PASSWORD 'moneymap_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'moneymap_ingest') THEN
    CREATE ROLE moneymap_ingest LOGIN PASSWORD 'moneymap_ingest' NOSUPERUSER BYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE moneymap TO moneymap_app, moneymap_ingest;
GRANT USAGE ON SCHEMA public TO moneymap_app, moneymap_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO moneymap_app, moneymap_ingest;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO moneymap_app, moneymap_ingest;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO moneymap_app, moneymap_ingest;

-- 4) Row Level Security (forced so even table owner must pass policies when not superuser)
ALTER TABLE "basiq_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "basiq_accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "basiq_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "basiq_transactions" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS basiq_accounts_owner_isolation ON "basiq_accounts";
CREATE POLICY basiq_accounts_owner_isolation ON "basiq_accounts"
  FOR ALL
  TO moneymap_app
  USING ("owner_user_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_user_id" = current_setting('app.current_user_id', true));

DROP POLICY IF EXISTS basiq_transactions_owner_isolation ON "basiq_transactions";
CREATE POLICY basiq_transactions_owner_isolation ON "basiq_transactions"
  FOR ALL
  TO moneymap_app
  USING ("owner_user_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_user_id" = current_setting('app.current_user_id', true));

-- Ingest role bypasses RLS (BYPASSRLS); still stamps owner_user_id in application code.
