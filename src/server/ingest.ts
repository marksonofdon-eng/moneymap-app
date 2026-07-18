import { prisma } from "@/lib/db";
import { getIngestPrisma } from "@/server/data/dbContext";
import {
  BASIQ_BASE_URL,
  basiqFetchJson,
  getAccounts,
  getServerAccessToken,
} from "@/server/basiq";
import { detectInternetBillsForOwner } from "@/server/data/internetBills";

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

export async function resolveOwnerUserIdForBasiqUser(
  basiqUserId: string,
): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { basiqUserId },
    select: { id: true },
  });
  return user?.id ?? null;
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

export async function ingestTransactions(ownerUserId: string, basiqUserId: string) {
  const db = getIngestPrisma();
  const accessToken = await getServerAccessToken();
  let pageUrl: string | null = `${BASIQ_BASE_URL}/users/${basiqUserId}/transactions?limit=500`;
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
      pageUrl = `${BASIQ_BASE_URL}/users/${basiqUserId}/transactions?limit=500&next=${encodeURIComponent(nextCursor)}`;
    } else {
      break;
    }
  }

  return { pages: page, total };
}

/**
 * Fail closed: refuse to write bank rows unless a MoneyMap user owns this Basiq user.
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
  const internetBillDetection = await detectInternetBillsForOwner(ownerUserId)
    .then((result) => ({ ok: true as const, ...result }))
    .catch((error) => {
      console.error("[ingest] Internet bill detection failed", error);
      return { ok: false as const };
    });
  return {
    accountsUpserted,
    ...txStats,
    internetBillDetection,
    aborted: false as const,
    ownerUserId,
  };
}
