-- Basiq landing tables (PostgreSQL)
-- Preserves full nested API payloads in JSONB while projecting queryable columns.
-- Safe for re-imports via ON CONFLICT upserts on primary keys.

BEGIN;

CREATE TABLE IF NOT EXISTS basiq_accounts (
  account_id         VARCHAR(64) PRIMARY KEY,
  user_id            VARCHAR(64) NOT NULL,
  name               TEXT,
  type               VARCHAR(64),
  balance            NUMERIC(19, 4),
  available_balance  NUMERIC(19, 4),
  currency           CHAR(3) NOT NULL DEFAULT 'AUD',
  -- Operational metadata (not from Basiq core fields)
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT basiq_accounts_currency_chk CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_basiq_accounts_user_id
  ON basiq_accounts (user_id);

CREATE TABLE IF NOT EXISTS basiq_transactions (
  transaction_id     VARCHAR(64) PRIMARY KEY,
  account_id         VARCHAR(64) NOT NULL
                       REFERENCES basiq_accounts (account_id)
                       ON UPDATE CASCADE
                       ON DELETE RESTRICT,
  amount             NUMERIC(19, 4) NOT NULL,
  direction          VARCHAR(16) NOT NULL,
  post_date          TIMESTAMPTZ,
  status             VARCHAR(32),
  -- Entire Basiq transaction object: enrich.merchant, enrich.location,
  -- CDR biller fields, subclass, links, etc. Never discard nested keys.
  raw_payload        JSONB NOT NULL,
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT basiq_transactions_direction_chk
    CHECK (direction IN ('credit', 'debit')),
  CONSTRAINT basiq_transactions_raw_payload_object_chk
    CHECK (jsonb_typeof(raw_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_basiq_transactions_account_id
  ON basiq_transactions (account_id);

CREATE INDEX IF NOT EXISTS idx_basiq_transactions_post_date
  ON basiq_transactions (post_date DESC);

CREATE INDEX IF NOT EXISTS idx_basiq_transactions_account_post_date
  ON basiq_transactions (account_id, post_date DESC);

CREATE INDEX IF NOT EXISTS idx_basiq_transactions_status
  ON basiq_transactions (status);

-- Optional: query nested enrich / CDR fields without unpacking the column
CREATE INDEX IF NOT EXISTS idx_basiq_transactions_raw_payload_gin
  ON basiq_transactions USING GIN (raw_payload jsonb_path_ops);

-- Keep updated_at current on upserts/updates
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_basiq_accounts_updated_at ON basiq_accounts;
CREATE TRIGGER trg_basiq_accounts_updated_at
  BEFORE UPDATE ON basiq_accounts
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_basiq_transactions_updated_at ON basiq_transactions;
CREATE TRIGGER trg_basiq_transactions_updated_at
  BEFORE UPDATE ON basiq_transactions
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

COMMIT;

-- Example upsert patterns (import scripts):
--
-- INSERT INTO basiq_accounts (
--   account_id, user_id, name, type, balance, available_balance, currency
-- ) VALUES ($1, $2, $3, $4, $5, $6, $7)
-- ON CONFLICT (account_id) DO UPDATE SET
--   user_id = EXCLUDED.user_id,
--   name = EXCLUDED.name,
--   type = EXCLUDED.type,
--   balance = EXCLUDED.balance,
--   available_balance = EXCLUDED.available_balance,
--   currency = EXCLUDED.currency,
--   updated_at = NOW();
--
-- INSERT INTO basiq_transactions (
--   transaction_id, account_id, amount, direction, post_date, status, raw_payload
-- ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
-- ON CONFLICT (transaction_id) DO UPDATE SET
--   account_id = EXCLUDED.account_id,
--   amount = EXCLUDED.amount,
--   direction = EXCLUDED.direction,
--   post_date = EXCLUDED.post_date,
--   status = EXCLUDED.status,
--   raw_payload = EXCLUDED.raw_payload,
--   updated_at = NOW();
