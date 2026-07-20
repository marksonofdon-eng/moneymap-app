-- Secondary pattern categorisation + audit trail.

ALTER TYPE "category_source" ADD VALUE IF NOT EXISTS 'SECONDARY_PATTERN';
ALTER TYPE "category_source" ADD VALUE IF NOT EXISTS 'USER_RULE';

DO $$ BEGIN
  CREATE TYPE "secondary_rule_status" AS ENUM ('CANDIDATE', 'ACTIVE', 'DISABLED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "secondary_pattern_type" AS ENUM ('DESC_NORMALIZED', 'BASIQ_L3', 'MERCHANT_TOKEN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "secondary_owner_scope" AS ENUM ('GLOBAL', 'USER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "secondary_category_rules" (
  "id" VARCHAR(40) NOT NULL,
  "status" "secondary_rule_status" NOT NULL DEFAULT 'CANDIDATE',
  "pattern_type" "secondary_pattern_type" NOT NULL,
  "pattern_value" VARCHAR(240) NOT NULL,
  "match_spec" JSONB NOT NULL,
  "parent_category" VARCHAR(80) NOT NULL,
  "expense_category" VARCHAR(120) NOT NULL,
  "flow_type" "transaction_flow" NOT NULL DEFAULT 'EXPENSE',
  "confidence" INTEGER NOT NULL,
  "support_count" INTEGER NOT NULL DEFAULT 0,
  "owner_scope" "secondary_owner_scope" NOT NULL DEFAULT 'GLOBAL',
  "owner_user_id" TEXT,
  "requires_approval" BOOLEAN NOT NULL DEFAULT false,
  "matcher_version" VARCHAR(32) NOT NULL DEFAULT 'secondary-v1',
  "created_by" VARCHAR(80) NOT NULL,
  "notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activated_at" TIMESTAMPTZ(6),
  "disabled_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "secondary_category_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "secondary_category_rules_confidence_check"
    CHECK ("confidence" >= 0 AND "confidence" <= 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_secondary_rules_pattern_scope"
  ON "secondary_category_rules"("pattern_type", "pattern_value", "owner_scope", "owner_user_id");
-- Global rules use NULL owner_user_id; enforce uniqueness separately.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_secondary_rules_global_pattern"
  ON "secondary_category_rules"("pattern_type", "pattern_value")
  WHERE "owner_scope" = 'GLOBAL' AND "owner_user_id" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_secondary_rules_status_scope"
  ON "secondary_category_rules"("status", "owner_scope");
CREATE INDEX IF NOT EXISTS "idx_secondary_rules_owner"
  ON "secondary_category_rules"("owner_user_id");

ALTER TABLE "secondary_category_rules"
  DROP CONSTRAINT IF EXISTS "secondary_category_rules_owner_user_id_fkey",
  ADD CONSTRAINT "secondary_category_rules_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "basiq_transactions"
  ADD COLUMN IF NOT EXISTS "category_rule_id" VARCHAR(40);

ALTER TABLE "basiq_transactions"
  DROP CONSTRAINT IF EXISTS "basiq_transactions_category_rule_id_fkey",
  ADD CONSTRAINT "basiq_transactions_category_rule_id_fkey"
    FOREIGN KEY ("category_rule_id") REFERENCES "secondary_category_rules"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_basiq_transactions_category_rule"
  ON "basiq_transactions"("category_rule_id");
CREATE INDEX IF NOT EXISTS "idx_basiq_transactions_owner_category_rule"
  ON "basiq_transactions"("owner_user_id", "category_rule_id");
CREATE INDEX IF NOT EXISTS "idx_basiq_transactions_source_rule"
  ON "basiq_transactions"("category_source", "category_rule_id");

CREATE TABLE IF NOT EXISTS "category_assignment_events" (
  "id" TEXT NOT NULL,
  "transaction_id" VARCHAR(64) NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "rule_id" VARCHAR(40),
  "category_source" "category_source" NOT NULL,
  "from_parent" VARCHAR(80),
  "from_expense" VARCHAR(120),
  "from_source" "category_source",
  "to_parent" VARCHAR(80),
  "to_expense" VARCHAR(120),
  "to_source" "category_source" NOT NULL,
  "to_flow_type" "transaction_flow",
  "matcher_version" VARCHAR(32) NOT NULL,
  "reason" VARCHAR(240) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "category_assignment_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_category_events_tx"
  ON "category_assignment_events"("transaction_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_category_events_owner"
  ON "category_assignment_events"("owner_user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_category_events_rule"
  ON "category_assignment_events"("rule_id");

ALTER TABLE "category_assignment_events"
  DROP CONSTRAINT IF EXISTS "category_assignment_events_transaction_id_fkey",
  ADD CONSTRAINT "category_assignment_events_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "basiq_transactions"("transaction_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "category_assignment_events"
  DROP CONSTRAINT IF EXISTS "category_assignment_events_owner_user_id_fkey",
  ADD CONSTRAINT "category_assignment_events_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "category_assignment_events"
  DROP CONSTRAINT IF EXISTS "category_assignment_events_rule_id_fkey",
  ADD CONSTRAINT "category_assignment_events_rule_id_fkey"
    FOREIGN KEY ("rule_id") REFERENCES "secondary_category_rules"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "secondary_category_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "category_assignment_events" ENABLE ROW LEVEL SECURITY;

-- Global secondary rules are readable by app role; writes typically via ingest/admin.
DROP POLICY IF EXISTS secondary_category_rules_select ON "secondary_category_rules";
CREATE POLICY secondary_category_rules_select ON "secondary_category_rules"
  FOR SELECT TO moneymap_app
  USING (
    "owner_scope" = 'GLOBAL'
    OR "owner_user_id" = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS secondary_category_rules_write ON "secondary_category_rules";
CREATE POLICY secondary_category_rules_write ON "secondary_category_rules"
  FOR ALL TO moneymap_app
  USING (
    "owner_scope" = 'GLOBAL'
    OR "owner_user_id" = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    "owner_scope" = 'GLOBAL'
    OR "owner_user_id" = current_setting('app.current_user_id', true)
  );

DROP POLICY IF EXISTS category_assignment_events_owner_isolation ON "category_assignment_events";
CREATE POLICY category_assignment_events_owner_isolation ON "category_assignment_events"
  FOR ALL TO moneymap_app
  USING ("owner_user_id" = current_setting('app.current_user_id', true))
  WITH CHECK ("owner_user_id" = current_setting('app.current_user_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "secondary_category_rules" TO moneymap_app, moneymap_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON "category_assignment_events" TO moneymap_app, moneymap_ingest;
