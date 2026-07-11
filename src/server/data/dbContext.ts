import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type TxClient = Prisma.TransactionClient;

/**
 * Run work inside a transaction with Postgres RLS tenant context set.
 * Policies on bank tables require: owner_user_id = current_setting('app.current_user_id').
 */
export async function withOwnerContext<T>(
  ownerUserId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${ownerUserId}, true)`;
    return fn(tx);
  });
}

/** Ingest client: uses BYPASSRLS role when INGEST_DATABASE_URL is set. */
const globalForIngest = globalThis as unknown as { ingestPrisma?: PrismaClient };

export function getIngestPrisma(): PrismaClient {
  const url = process.env.INGEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL (or INGEST_DATABASE_URL) is required");
  }

  if (process.env.INGEST_DATABASE_URL) {
    if (!globalForIngest.ingestPrisma) {
      globalForIngest.ingestPrisma = new PrismaClient({
        datasources: { db: { url: process.env.INGEST_DATABASE_URL } },
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      });
    }
    return globalForIngest.ingestPrisma;
  }

  return prisma;
}
