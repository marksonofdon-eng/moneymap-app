import { DetectedBillStatus, Prisma } from "@prisma/client";
import { withOwnerContext } from "@/server/data/dbContext";
import {
  detectInternetBillSeries,
  matchInternetProvider,
} from "@/server/internetBills/detector";
import {
  INTERNET_BASIQ_L3,
  INTERNET_BASIQ_L4,
} from "@/server/taxonomy/pillMap";

const LOOKBACK_DAYS = 400;

export type InternetBillDetectionRun = {
  transactionsScanned: number;
  candidatesMatched: number;
  billsDetected: number;
  evidenceLinked: number;
};

export async function detectInternetBillsForOwner(
  ownerUserId: string,
): Promise<InternetBillDetectionRun> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  return withOwnerContext(ownerUserId, async (db) => {
    const transactions = await db.basiqTransaction.findMany({
      where: {
        ownerUserId,
        direction: "debit",
        postDate: { not: null, gte: since },
      },
      select: {
        transactionId: true,
        accountId: true,
        amount: true,
        postDate: true,
        rawPayload: true,
      },
      orderBy: { postDate: "asc" },
    });

    const candidatesMatched = transactions.filter((row) =>
      matchInternetProvider(row.rawPayload),
    ).length;

    const detections = detectInternetBillSeries(
      transactions.flatMap((row) =>
        row.postDate
          ? [
              {
                transactionId: row.transactionId,
                accountId: row.accountId,
                amount: Number(row.amount),
                postDate: row.postDate,
                rawPayload: row.rawPayload,
              },
            ]
          : [],
      ),
    );

    const evidenceIds = detections.flatMap((detection) =>
      detection.evidence.map((evidence) => evidence.transactionId),
    );
    if (evidenceIds.length > 0) {
      await db.billEvidence.deleteMany({
        where: {
          ownerUserId,
          transactionId: { in: evidenceIds },
        },
      });
    }

    const activeSeriesKeys = detections.map((detection) => detection.seriesKey);
    await db.detectedBill.deleteMany({
      where: {
        ownerUserId,
        category: "INTERNET",
        status: "DETECTED",
        ...(activeSeriesKeys.length > 0
          ? { seriesKey: { notIn: activeSeriesKeys } }
          : {}),
      },
    });

    let evidenceLinked = 0;
    for (const detection of detections) {
      const bill = await db.detectedBill.upsert({
        where: {
          ownerUserId_category_seriesKey: {
            ownerUserId,
            category: "INTERNET",
            seriesKey: detection.seriesKey,
          },
        },
        create: {
          ownerUserId,
          category: "INTERNET",
          groupCode: INTERNET_BASIQ_L3,
          subclassCode: INTERNET_BASIQ_L4,
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
          matcherVersion: detection.matcherVersion,
        },
        update: {
          groupCode: INTERNET_BASIQ_L3,
          subclassCode: INTERNET_BASIQ_L4,
          providerKey: detection.providerKey,
          providerName: detection.providerName,
          estimatedMonthlyCostAud: new Prisma.Decimal(
            detection.estimatedMonthlyCostAud,
          ),
          cadence: "MONTHLY",
          confidence: detection.confidence,
          occurrenceCount: detection.occurrenceCount,
          firstSeenAt: detection.firstSeenAt,
          lastSeenAt: detection.lastSeenAt,
          matcherVersion: detection.matcherVersion,
        },
        select: { id: true },
      });

      await db.billEvidence.deleteMany({
        where: { ownerUserId, detectedBillId: bill.id },
      });
      if (detection.evidence.length > 0) {
        const created = await db.billEvidence.createMany({
          data: detection.evidence.map((evidence) => ({
            ownerUserId,
            detectedBillId: bill.id,
            transactionId: evidence.transactionId,
            matchedProviderKey: evidence.matchedProviderKey,
            matchedText: evidence.matchedText,
            matchScore: evidence.matchScore,
            matchReasons: evidence.matchReasons,
          })),
        });
        evidenceLinked += created.count;
      }
    }

    return {
      transactionsScanned: transactions.length,
      candidatesMatched,
      billsDetected: detections.length,
      evidenceLinked,
    };
  });
}

export async function listInternetBillsForOwner(ownerUserId: string) {
  return withOwnerContext(ownerUserId, async (db) => {
    const rows = await db.detectedBill.findMany({
      where: { ownerUserId, category: "INTERNET" },
      orderBy: [
        { status: "asc" },
        { confidence: "desc" },
        { lastSeenAt: "desc" },
      ],
      include: {
        evidence: {
          orderBy: { transaction: { postDate: "desc" } },
          include: {
            transaction: {
              select: {
                transactionId: true,
                accountId: true,
                amount: true,
                postDate: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      providerKey: row.providerKey,
      providerName: row.providerName,
      estimatedMonthlyCostAud: Number(row.estimatedMonthlyCostAud),
      cadence: row.cadence,
      confidence: row.confidence,
      status: row.status,
      occurrenceCount: row.occurrenceCount,
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      matcherVersion: row.matcherVersion,
      evidence: row.evidence.map((evidence) => ({
        transactionId: evidence.transactionId,
        matchedText: evidence.matchedText,
        matchScore: evidence.matchScore,
        matchReasons: evidence.matchReasons,
        accountId: evidence.transaction.accountId,
        amountAud: Number(evidence.transaction.amount),
        postDate: evidence.transaction.postDate?.toISOString() ?? null,
        transactionStatus: evidence.transaction.status,
      })),
    }));
  });
}

export async function updateInternetBillStatusForOwner(
  ownerUserId: string,
  billId: string,
  status: DetectedBillStatus,
) {
  return withOwnerContext(ownerUserId, async (db) => {
    const result = await db.detectedBill.updateMany({
      where: {
        id: billId,
        ownerUserId,
        category: "INTERNET",
      },
      data: { status },
    });
    if (result.count === 0) return null;
    return { id: billId, status };
  });
}
