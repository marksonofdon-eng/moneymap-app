import type { Prisma } from "@prisma/client";
import { withOwnerContext } from "@/server/data/dbContext";

const DEFAULT_TX_LIMIT = 50;

export async function listAccountsForOwner(ownerUserId: string) {
  return withOwnerContext(ownerUserId, (tx) =>
    tx.basiqAccount.findMany({
      where: { ownerUserId },
      orderBy: [{ name: "asc" }, { accountId: "asc" }],
      include: {
        _count: { select: { transactions: true } },
      },
    }),
  );
}

export async function countAccountsForOwner(ownerUserId: string) {
  return withOwnerContext(ownerUserId, (tx) =>
    tx.basiqAccount.count({ where: { ownerUserId } }),
  );
}

export async function countTransactionsForOwner(ownerUserId: string) {
  return withOwnerContext(ownerUserId, (tx) =>
    tx.basiqTransaction.count({ where: { ownerUserId } }),
  );
}

export type ListTransactionsOptions = {
  limit?: number;
  accountId?: string;
  /** Exclusive cursor: return rows older than this postDate (or equal date with smaller id). */
  cursor?: { postDate: Date | null; transactionId: string };
};

export async function listTransactionsForOwner(
  ownerUserId: string,
  opts: ListTransactionsOptions = {},
) {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_TX_LIMIT, 1), 100);

  const where: Prisma.BasiqTransactionWhereInput = {
    ownerUserId,
    ...(opts.accountId ? { accountId: opts.accountId } : {}),
  };

  return withOwnerContext(ownerUserId, (tx) =>
    tx.basiqTransaction.findMany({
      where,
      orderBy: [{ postDate: "desc" }, { transactionId: "desc" }],
      take: limit,
      select: {
        transactionId: true,
        accountId: true,
        amount: true,
        direction: true,
        postDate: true,
        status: true,
        // Avoid raw_payload on list endpoints
        account: { select: { name: true, currency: true } },
      },
    }),
  );
}

/** IDOR-safe: account must belong to owner. */
export async function getAccountForOwner(ownerUserId: string, accountId: string) {
  return withOwnerContext(ownerUserId, (tx) =>
    tx.basiqAccount.findFirst({
      where: { ownerUserId, accountId },
    }),
  );
}

/** IDOR-safe: transaction must belong to owner. */
export async function getTransactionForOwner(
  ownerUserId: string,
  transactionId: string,
) {
  return withOwnerContext(ownerUserId, (tx) =>
    tx.basiqTransaction.findFirst({
      where: { ownerUserId, transactionId },
      include: {
        account: { select: { name: true, currency: true, accountId: true } },
      },
    }),
  );
}

const EXPORT_PAGE_SIZE = 2000;

/** All transactions for CSV export (owner-scoped only). */
export async function exportTransactionsForOwner(ownerUserId: string) {
  return withOwnerContext(ownerUserId, async (tx) => {
    const rows: Array<{
      transactionId: string;
      accountId: string;
      amount: { toString(): string };
      direction: string;
      postDate: Date | null;
      status: string | null;
      rawPayload: unknown;
      account: { name: string | null; currency: string; type: string | null };
    }> = [];

    let skip = 0;
    for (;;) {
      const page = await tx.basiqTransaction.findMany({
        where: { ownerUserId },
        orderBy: [{ postDate: "desc" }, { transactionId: "desc" }],
        skip,
        take: EXPORT_PAGE_SIZE,
        select: {
          transactionId: true,
          accountId: true,
          amount: true,
          direction: true,
          postDate: true,
          status: true,
          rawPayload: true,
          account: { select: { name: true, currency: true, type: true } },
        },
      });

      if (page.length === 0) break;
      rows.push(...page);
      if (page.length < EXPORT_PAGE_SIZE) break;
      skip += page.length;
    }

    return rows;
  });
}
