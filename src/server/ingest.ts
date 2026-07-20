import { prisma } from "@/lib/db";
import { getIngestPrisma } from "@/server/data/dbContext";
import {
  BASIQ_BASE_URL,
  basiqFetchJson,
  getAccounts,
  getServerAccessToken,
} from "@/server/basiq";
import { detectRecurringBillsForOwner } from "@/server/data/recurringBills";
import { syncIncomeForOwner } from "@/server/data/syncIncome";

const IMPORT_OVERLAP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractNextCursor(nextLink: unknown): string | null {
  if (!nextLink || typeof nextLink !== "string") return null;
  try {
    const url = new URL(nextLink, BASIQ_BASE_URL);
    return url.searchParams.get("next");
  } catch {
    return null;
  }
}

function toBasiqDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildTransactionsListUrl(
  basiqUserId: string,
  opts?: { fromPostDate?: Date; nextCursor?: string },
): string {
  const params = new URLSearchParams();
  params.set("limit", "500");
  if (opts?.fromPostDate) {
    params.set(
      "filter",
      `transaction.postDate.gt:'${toBasiqDate(opts.fromPostDate)}'`,
    );
  }
  if (opts?.nextCursor) {
    params.set("next", opts.nextCursor);
  }
  return `${BASIQ_BASE_URL}/users/${basiqUserId}/transactions?${params.toString()}`;
}

export async function resolveOwnerUserIdForBasiqUser(
  basiqUserId: string,
): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { basiqUserId },
    select: { id: true },
  });
  return user?.id ?? null;
}

/** Latest stored postDate for owner, or null if none. */
export async function getLatestTransactionPostDate(
  ownerUserId: string,
): Promise<Date | null> {
  const row = await prisma.basiqTransaction.findFirst({
    where: { ownerUserId, postDate: { not: null } },
    orderBy: { postDate: "desc" },
    select: { postDate: true },
  });
  return row?.postDate ?? null;
}

/**
 * Incremental from-date: 7 days before latest stored postDate, or null for full history.
 */
export async function resolveIncrementalFromDate(
  ownerUserId: string,
): Promise<Date | null> {
  const latest = await getLatestTransactionPostDate(ownerUserId);
  if (!latest) return null;
  return new Date(latest.getTime() - IMPORT_OVERLAP_DAYS * DAY_MS);
}

export async function ingestAccounts(ownerUserId: string, basiqUserId: string) {
  const db = getIngestPrisma();
  const response = await getAccounts(basiqUserId);
  const accounts = Array.isArray(response?.data) ? response.data : [];
  let upserted = 0;

  for (const account of accounts) {
    const accountId = account.id as string | undefined;
    if (!accountId) continue;

    const availableBalance = toNumeric(
      account.availableBalance ?? account.availableFunds,
    );
    const type =
      account.class?.type ||
      account._class?.type ||
      account.class?.product ||
      account._class?.product ||
      account.type ||
      null;

    await db.basiqAccount.upsert({
      where: { accountId },
      create: {
        accountId,
        ownerUserId,
        basiqUserId,
        name: account.name ?? null,
        type,
        balance: toNumeric(account.balance),
        availableBalance,
        currency: account.currency || "AUD",
      },
      update: {
        ownerUserId,
        basiqUserId,
        name: account.name ?? null,
        type,
        balance: toNumeric(account.balance),
        availableBalance,
        currency: account.currency || "AUD",
      },
    });
    upserted += 1;
  }

  return upserted;
}

export async function ingestTransactions(
  ownerUserId: string,
  basiqUserId: string,
  opts?: { fromPostDate?: Date | null },
) {
  const db = getIngestPrisma();
  const accessToken = await getServerAccessToken();
  const fromPostDate = opts?.fromPostDate ?? null;
  let pageUrl: string | null = buildTransactionsListUrl(basiqUserId, {
    fromPostDate: fromPostDate ?? undefined,
  });
  let page = 0;
  let total = 0;

  while (pageUrl) {
    page += 1;
    const payload = await basiqFetchJson(pageUrl, accessToken);
    const transactions = Array.isArray(payload?.data) ? payload.data : [];

    for (const tx of transactions) {
      const transactionId = tx.id as string | undefined;
      const accountId = tx.account as string | undefined;
      if (!transactionId || !accountId) continue;

      const direction = String(tx.direction || "").toLowerCase();
      if (direction !== "credit" && direction !== "debit") continue;

      const amountRaw = toNumeric(tx.amount);
      if (amountRaw === null) continue;

      await db.basiqTransaction.upsert({
        where: { transactionId },
        create: {
          transactionId,
          ownerUserId,
          accountId,
          amount: Math.abs(amountRaw),
          direction,
          postDate: tx.postDate ? new Date(tx.postDate) : null,
          status: tx.status || null,
          rawPayload: tx,
        },
        update: {
          ownerUserId,
          accountId,
          amount: Math.abs(amountRaw),
          direction,
          postDate: tx.postDate ? new Date(tx.postDate) : null,
          status: tx.status || null,
          rawPayload: tx,
        },
      });
      total += 1;
    }

    const nextLink = payload?.links?.next;
    const nextCursor = extractNextCursor(nextLink);
    if (!nextLink) break;

    if (typeof nextLink === "string" && nextLink.startsWith("http")) {
      pageUrl = nextLink;
    } else if (nextCursor) {
      pageUrl = buildTransactionsListUrl(basiqUserId, {
        fromPostDate: fromPostDate ?? undefined,
        nextCursor,
      });
    } else {
      break;
    }
  }

  return {
    pages: page,
    total,
    fromPostDate: fromPostDate ? toBasiqDate(fromPostDate) : null,
  };
}

/**
 * Fail closed: refuse to write bank rows unless a MoneyMap user owns this Basiq user.
 * Full history pull (used after consent poll).
 */
export async function runIngestionPipeline(basiqUserId: string) {
  const ownerUserId = await resolveOwnerUserIdForBasiqUser(basiqUserId);
  if (!ownerUserId) {
    console.error(
      `[ingest] No MoneyMap user linked to basiqUserId=${basiqUserId} — aborting (no orphan writes)`,
    );
    return { accountsUpserted: 0, pages: 0, total: 0, aborted: true as const };
  }

  const accountsUpserted = await ingestAccounts(ownerUserId, basiqUserId);
  const txStats = await ingestTransactions(ownerUserId, basiqUserId);
  const recurringBillDetection = await detectRecurringBillsForOwner(ownerUserId)
    .then((result) => ({ ok: true as const, ...result }))
    .catch((error) => {
      console.error("[ingest] Recurring bill detection failed", error);
      return { ok: false as const };
    });
  const incomeSync = await syncIncomeForOwner(ownerUserId, basiqUserId)
    .then((result) => result)
    .catch((error) => {
      console.error("[ingest] Income sync failed", error);
      return { ok: false as const, reason: String(error) };
    });
  return {
    accountsUpserted,
    ...txStats,
    recurringBillDetection,
    incomeSync,
    /** @deprecated use recurringBillDetection.internet */
    internetBillDetection:
      recurringBillDetection.ok === true
        ? { ok: true as const, ...recurringBillDetection.internet }
        : { ok: false as const },
    aborted: false as const,
    ownerUserId,
  };
}

/**
 * User-triggered import: accounts + incremental txs (7-day overlap) + bill detection.
 */
export async function runImportPipeline(
  ownerUserId: string,
  basiqUserId: string,
) {
  const fromPostDate = await resolveIncrementalFromDate(ownerUserId);
  const accountsUpserted = await ingestAccounts(ownerUserId, basiqUserId);
  const txStats = await ingestTransactions(ownerUserId, basiqUserId, {
    fromPostDate,
  });
  const recurringBillDetection = await detectRecurringBillsForOwner(ownerUserId)
    .then((result) => ({ ok: true as const, ...result }))
    .catch((error) => {
      console.error("[import] Recurring bill detection failed", error);
      return { ok: false as const };
    });
  const incomeSync = await syncIncomeForOwner(ownerUserId, basiqUserId)
    .then((result) => result)
    .catch((error) => {
      console.error("[import] Income sync failed", error);
      return { ok: false as const, reason: String(error) };
    });

  return {
    accountsUpserted,
    ...txStats,
    recurringBillDetection,
    incomeSync,
    aborted: false as const,
    ownerUserId,
  };
}
