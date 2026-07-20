import { Prisma } from "@prisma/client";
import { withOwnerContext } from "@/server/data/dbContext";
import { detectInternetBillsForOwner } from "@/server/data/internetBills";
import { categoriseTransactionsForOwner } from "@/server/data/categoriseTransactions";
import {
  INTERNET_BASIQ_L3,
  INTERNET_BASIQ_L4,
  INTERNET_EXPENSE_CATEGORY,
  RECURRING_BILL_EXPENSE_CATEGORIES,
} from "@/server/taxonomy/pillMap";

const LOOKBACK_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SERIES_CONFIDENCE = 65;
export const RECURRING_BILL_MATCHER_VERSION = "recurring-v1";

export type RecurringBillDetectionRun = {
  categorisation: Awaited<ReturnType<typeof categoriseTransactionsForOwner>>;
  internet: Awaited<ReturnType<typeof detectInternetBillsForOwner>>;
  otherBillsDetected: number;
  otherEvidenceLinked: number;
};

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle];
  return (ordered[middle - 1] + ordered[middle]) / 2;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "merchant";
}

type SeriesCandidate = {
  transactionId: string;
  accountId: string;
  amount: number;
  postDate: Date;
  groupCode: number | null;
  subclassCode: string | null;
  expenseCategory: string;
  merchantKey: string;
  matchedText: string;
};

function assessGenericSeries(rows: SeriesCandidate[]) {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort(
    (a, b) => a.postDate.getTime() - b.postDate.getTime(),
  );
  const amounts = sorted.map((row) => row.amount);
  const medianAmount = median(amounts);
  if (!Number.isFinite(medianAmount) || medianAmount <= 0) return null;

  const intervals = sorted.slice(1).map(
    (row, index) =>
      (row.postDate.getTime() - sorted[index].postDate.getTime()) / DAY_MS,
  );
  const monthlyRatio =
    intervals.filter((days) => days >= 20 && days <= 45).length / intervals.length;
  const amountTolerance = Math.max(3, medianAmount * 0.08);
  const consistentAmountRatio =
    amounts.filter((amount) => Math.abs(amount - medianAmount) <= amountTolerance)
      .length / amounts.length;

  if (monthlyRatio < 0.5 || consistentAmountRatio < 0.6) return null;

  const confidence = Math.min(
    100,
    Math.round(55 + monthlyRatio * 20 + consistentAmountRatio * 15 + Math.min(10, sorted.length * 2)),
  );
  if (confidence < MIN_SERIES_CONFIDENCE) return null;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const providerKey = `${first.expenseCategory}:${first.merchantKey}`.slice(0, 64);
  return {
    seriesKey: `${providerKey}:${first.accountId}`.slice(0, 160),
    groupCode: first.groupCode,
    subclassCode: first.subclassCode,
    expenseCategory: first.expenseCategory,
    providerKey,
    providerName: first.matchedText.slice(0, 120) || providerKey,
    estimatedMonthlyCostAud: roundMoney(medianAmount),
    confidence,
    occurrenceCount: sorted.length,
    firstSeenAt: first.postDate,
    lastSeenAt: last.postDate,
    evidence: sorted.map((row) => ({
      transactionId: row.transactionId,
      matchedProviderKey: providerKey,
      matchedText: row.matchedText.slice(0, 500) || providerKey,
      matchScore: confidence,
      matchReasons: ["expense_category", "recurring_monthly_series", "consistent_amount"],
    })),
  };
}

export type RecurringBillDetectionOptions = {
  /** When true, skip the categorise step (caller already categorised). */
  skipCategorise?: boolean;
  /** Passed through to categorise when skipCategorise is false. */
  forceCategorise?: boolean;
};

/**
 * Categorise txs, keep internet detection for group 7 quality,
 * and detect other recurring bill series from taxonomy groups.
 */
export async function detectRecurringBillsForOwner(
  ownerUserId: string,
  options?: RecurringBillDetectionOptions,
): Promise<RecurringBillDetectionRun> {
  const categorisation = options?.skipCategorise
    ? {
        transactionsScanned: 0,
        updated: 0,
        matched: 0,
        unmatched: 0,
        primaryL4Matched: 0,
        secondaryMatched: 0,
        merchantMapMatched: 0,
        keywordMatched: 0,
        basiqClassMatched: 0,
        modelMatched: 0,
        modelShadowSkipped: 0,
        matcherVersion: "skipped",
      }
    : await categoriseTransactionsForOwner(ownerUserId, {
        force: options?.forceCategorise === true,
      });
  const internet = await detectInternetBillsForOwner(ownerUserId);

  // Stamp internet bills with Basiq L4 5801 when missing.
  await withOwnerContext(ownerUserId, async (db) => {
    await db.detectedBill.updateMany({
      where: {
        ownerUserId,
        category: "INTERNET",
        OR: [
          { groupCode: null },
          { groupCode: { not: INTERNET_BASIQ_L3 } },
          { subclassCode: null },
          { subclassCode: { not: INTERNET_BASIQ_L4 } },
        ],
      },
      data: {
        groupCode: INTERNET_BASIQ_L3,
        subclassCode: INTERNET_BASIQ_L4,
      },
    });
  });

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const otherExpenses = RECURRING_BILL_EXPENSE_CATEGORIES.filter(
    (label) => label !== INTERNET_EXPENSE_CATEGORY,
  );

  const other = await withOwnerContext(ownerUserId, async (db) => {
    const claimedEvidence = await db.billEvidence.findMany({
      where: { ownerUserId },
      select: { transactionId: true },
    });
    const claimedTxIds = new Set(
      claimedEvidence.map((row) => row.transactionId),
    );

    const transactions = await db.basiqTransaction.findMany({
      where: {
        ownerUserId,
        direction: "debit",
        postDate: { not: null, gte: since },
        expenseCategory: { in: [...otherExpenses] },
        categorySource: { in: ["KEYWORD", "BASIQ_ENRICH", "MANUAL"] },
        ...(claimedTxIds.size > 0
          ? { transactionId: { notIn: [...claimedTxIds] } }
          : {}),
      },
      select: {
        transactionId: true,
        accountId: true,
        amount: true,
        postDate: true,
        groupCode: true,
        subclassCode: true,
        expenseCategory: true,
        rawPayload: true,
      },
      orderBy: { postDate: "asc" },
    });

    const groups = new Map<string, SeriesCandidate[]>();
    for (const row of transactions) {
      if (!row.postDate || !row.expenseCategory) continue;
      if (claimedTxIds.has(row.transactionId)) continue;
      const payload = row.rawPayload as Record<string, unknown> | null;
      const description =
        (typeof payload?.description === "string" && payload.description) ||
        row.expenseCategory;
      const merchantKey = slugify(description);
      const key = `${row.expenseCategory}:${merchantKey}:${row.accountId}`;
      const list = groups.get(key) ?? [];
      list.push({
        transactionId: row.transactionId,
        accountId: row.accountId,
        amount: Number(row.amount),
        postDate: row.postDate,
        groupCode: row.groupCode,
        subclassCode: row.subclassCode,
        expenseCategory: row.expenseCategory,
        merchantKey,
        matchedText: description,
      });
      groups.set(key, list);
    }

    const detections = [...groups.values()]
      .map(assessGenericSeries)
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const activeSeriesKeys = detections.map((d) => d.seriesKey);
    await db.detectedBill.deleteMany({
      where: {
        ownerUserId,
        category: "OTHER",
        status: "DETECTED",
        ...(activeSeriesKeys.length > 0
          ? { seriesKey: { notIn: activeSeriesKeys } }
          : {}),
      },
    });

    let otherEvidenceLinked = 0;
    for (const detection of detections) {
      const bill = await db.detectedBill.upsert({
        where: {
          ownerUserId_category_seriesKey: {
            ownerUserId,
            category: "OTHER",
            seriesKey: detection.seriesKey,
          },
        },
        create: {
          ownerUserId,
          category: "OTHER",
          groupCode: detection.groupCode,
          subclassCode: detection.subclassCode,
          seriesKey: detection.seriesKey,
          providerKey: detection.providerKey,
          providerName: detection.providerName,
          estimatedMonthlyCostAud: new Prisma.Decimal(
            detection.estimatedMonthlyCostAud,
          ),
          cadence: "MONTHLY",
          confidence: detection.confidence,
          status: "DETECTED",
          occurrenceCount: detection.occurrenceCount,
          firstSeenAt: detection.firstSeenAt,
          lastSeenAt: detection.lastSeenAt,
          matcherVersion: RECURRING_BILL_MATCHER_VERSION,
        },
        update: {
          groupCode: detection.groupCode,
          subclassCode: detection.subclassCode,
          providerKey: detection.providerKey,
          providerName: detection.providerName,
          estimatedMonthlyCostAud: new Prisma.Decimal(
            detection.estimatedMonthlyCostAud,
          ),
          confidence: detection.confidence,
          occurrenceCount: detection.occurrenceCount,
          firstSeenAt: detection.firstSeenAt,
          lastSeenAt: detection.lastSeenAt,
          matcherVersion: RECURRING_BILL_MATCHER_VERSION,
        },
        select: { id: true },
      });

      await db.billEvidence.deleteMany({
        where: { ownerUserId, detectedBillId: bill.id },
      });
      const evidenceRows = detection.evidence.filter(
        (evidence) => !claimedTxIds.has(evidence.transactionId),
      );
      if (evidenceRows.length > 0) {
        const created = await db.billEvidence.createMany({
          data: evidenceRows.map((evidence) => ({
            ownerUserId,
            detectedBillId: bill.id,
            transactionId: evidence.transactionId,
            matchedProviderKey: evidence.matchedProviderKey,
            matchedText: evidence.matchedText,
            matchScore: evidence.matchScore,
            matchReasons: evidence.matchReasons,
          })),
          skipDuplicates: true,
        });
        otherEvidenceLinked += created.count;
        for (const evidence of evidenceRows) {
          claimedTxIds.add(evidence.transactionId);
        }
      }
    }

    return {
      otherBillsDetected: detections.length,
      otherEvidenceLinked,
    };
  });

  return {
    categorisation,
    internet,
    ...other,
  };
}
