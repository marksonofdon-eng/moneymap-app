-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "basiq_user_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "basiq_accounts" (
    "account_id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "name" TEXT,
    "type" VARCHAR(64),
    "balance" DECIMAL(19,4),
    "available_balance" DECIMAL(19,4),
    "currency" CHAR(3) NOT NULL DEFAULT 'AUD',
    "ingested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "basiq_accounts_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "basiq_transactions" (
    "transaction_id" VARCHAR(64) NOT NULL,
    "account_id" VARCHAR(64) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "direction" VARCHAR(16) NOT NULL,
    "post_date" TIMESTAMPTZ(6),
    "status" VARCHAR(32),
    "raw_payload" JSONB NOT NULL,
    "ingested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "basiq_transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_basiq_user_id_key" ON "users"("basiq_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "idx_sessions_user_id" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_sessions_expires_at" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "idx_basiq_accounts_user_id" ON "basiq_accounts"("user_id");

-- CreateIndex
CREATE INDEX "idx_basiq_transactions_account_id" ON "basiq_transactions"("account_id");

-- CreateIndex
CREATE INDEX "idx_basiq_transactions_post_date" ON "basiq_transactions"("post_date" DESC);

-- CreateIndex
CREATE INDEX "idx_basiq_transactions_account_post_date" ON "basiq_transactions"("account_id", "post_date" DESC);

-- CreateIndex
CREATE INDEX "idx_basiq_transactions_status" ON "basiq_transactions"("status");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "basiq_transactions" ADD CONSTRAINT "basiq_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "basiq_accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
