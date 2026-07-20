import { Prisma } from "@prisma/client";
import { withOwnerContext } from "@/server/data/dbContext";
import type { InternetSavingsIntakeInput } from "@/server/internetSavings/intakeSchema";

type TxClient = Prisma.TransactionClient;

export type InternetSavingsBillSummary = {
  id: string;
  providerName: string;
  estimatedMonthlyCostAud: number;
  confidence: number;
  status: "DETECTED" | "CONFIRMED" | "DISMISSED";
  occurrenceCount: number;
  lastSeenAt: string;
  /** Bank account the recurring payments come from. */
  sourceAccountName: string | null;
  /** Typical calendar day (1–31) payments land, from evidence. */
  approximatePaymentDay: number | null;
};

export type InternetSavingsState = {
  hasDetectedBill: boolean;
  buttonTone: "amber" | "green";
  bill: InternetSavingsBillSummary | null;
  intakeReady: boolean;
  recommendation: {
    outcome: "ALREADY_BEST" | "SWITCH_RECOMMENDED" | "NO_ELIGIBLE";
    savingMonthlyAud: number;
    bestProviderName: string | null;
    bestPlanName: string | null;
    reason: string | null;
  } | null;
};

export type InternetSavingsIntake = {
  hasDetectedBill: boolean;
  bill: InternetSavingsBillSummary | null;
  address: {
    line1: string;
    line2: string | null;
    suburb: string;
    state: string;
    postcode: string;
  } | null;
  prefs: {
    minDownloadMbps: number;
    allowWired: boolean;
    allow5g: boolean;
    allowStarlink: boolean;
    readyForAssess: boolean;
  } | null;
};

function dayOfMonthSydney(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney",
      day: "numeric",
    }).format(date),
  );
}

function medianDay(days: number[]): number | null {
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

async function mapBill(
  db: TxClient,
  row: {
    id: string;
    ownerUserId: string;
    providerName: string;
    estimatedMonthlyCostAud: { toString(): string };
    confidence: number;
    status: "DETECTED" | "CONFIRMED" | "DISMISSED";
    occurrenceCount: number;
    lastSeenAt: Date;
  },
): Promise<InternetSavingsBillSummary> {
  const evidence = await db.billEvidence.findMany({
    where: {
      detectedBillId: row.id,
      ownerUserId: row.ownerUserId,
    },
    take: 24,
    orderBy: { createdAt: "desc" },
    include: {
      transaction: {
        select: {
          postDate: true,
          account: { select: { name: true } },
        },
      },
    },
  });

  const sourceAccountName =
    evidence.find((item) => item.transaction.account.name)?.transaction.account
      .name ?? null;
  const paymentDays = evidence
    .map((item) => item.transaction.postDate)
    .filter((date): date is Date => date != null)
    .map(dayOfMonthSydney);

  return {
    id: row.id,
    providerName: row.providerName,
    estimatedMonthlyCostAud: Number(row.estimatedMonthlyCostAud),
    confidence: row.confidence,
    status: row.status,
    occurrenceCount: row.occurrenceCount,
    lastSeenAt: row.lastSeenAt.toISOString(),
    sourceAccountName,
    approximatePaymentDay: medianDay(paymentDays),
  };
}

async function findPrimaryInternetBill(db: TxClient, ownerUserId: string) {
  return db.detectedBill.findFirst({
    where: {
      ownerUserId,
      category: "INTERNET",
      status: { in: ["DETECTED", "CONFIRMED"] },
    },
    orderBy: [{ confidence: "desc" }, { lastSeenAt: "desc" }],
  });
}

export async function getInternetSavingsState(
  ownerUserId: string,
): Promise<InternetSavingsState> {
  const base = await withOwnerContext(ownerUserId, async (db) => {
    const bill = await findPrimaryInternetBill(db, ownerUserId);
    const profile = await db.userNeedProfile.findUnique({
      where: {
        ownerUserId_category: {
          ownerUserId,
          category: "INTERNET",
        },
      },
      select: { readyForAssess: true },
    });

    return {
      hasDetectedBill: Boolean(bill),
      buttonTone: (bill ? "green" : "amber") as "amber" | "green",
      bill: bill ? await mapBill(db, bill) : null,
      intakeReady: Boolean(profile?.readyForAssess),
    };
  });

  let recommendation: InternetSavingsState["recommendation"] = null;
  if (base.intakeReady && base.hasDetectedBill) {
    try {
      const { getInternetRecommendationSummary } = await import(
        "@/server/data/internetRecommendations"
      );
      recommendation = await Promise.race([
        getInternetRecommendationSummary(ownerUserId),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 4000);
        }),
      ]);
    } catch (error) {
      console.error("[internetSavings:recommendationSummary]", error);
      recommendation = null;
    }
  }

  return { ...base, recommendation };
}

export async function getInternetSavingsIntake(
  ownerUserId: string,
): Promise<InternetSavingsIntake> {
  return withOwnerContext(ownerUserId, async (db) => {
    const bill = await findPrimaryInternetBill(db, ownerUserId);
    const profile = await db.userNeedProfile.findUnique({
      where: {
        ownerUserId_category: {
          ownerUserId,
          category: "INTERNET",
        },
      },
      include: { serviceAddress: true },
    });

    return {
      hasDetectedBill: Boolean(bill),
      bill: bill ? await mapBill(db, bill) : null,
      address: profile?.serviceAddress
        ? {
            line1: profile.serviceAddress.line1,
            line2: profile.serviceAddress.line2,
            suburb: profile.serviceAddress.suburb,
            state: profile.serviceAddress.state,
            postcode: profile.serviceAddress.postcode,
          }
        : null,
      prefs: profile
        ? {
            minDownloadMbps: profile.minDownloadMbps,
            allowWired: profile.allowWired,
            allow5g: profile.allow5g,
            allowStarlink: profile.allowStarlink,
            readyForAssess: profile.readyForAssess,
          }
        : null,
    };
  });
}

export async function upsertInternetSavingsIntake(
  ownerUserId: string,
  input: InternetSavingsIntakeInput,
) {
  return withOwnerContext(ownerUserId, async (db) => {
    const bill = await findPrimaryInternetBill(db, ownerUserId);
    if (!bill) {
      return { ok: false as const, error: "no_detected_bill" as const };
    }

    const address = await db.userAddress.upsert({
      where: { ownerUserId },
      create: {
        ownerUserId,
        line1: input.line1,
        line2: input.line2 ?? null,
        suburb: input.suburb,
        state: input.state,
        postcode: input.postcode,
        country: "AU",
      },
      update: {
        line1: input.line1,
        line2: input.line2 ?? null,
        suburb: input.suburb,
        state: input.state,
        postcode: input.postcode,
        country: "AU",
      },
    });

    const profile = await db.userNeedProfile.upsert({
      where: {
        ownerUserId_category: {
          ownerUserId,
          category: "INTERNET",
        },
      },
      create: {
        ownerUserId,
        category: "INTERNET",
        detectedBillId: bill.id,
        serviceAddressId: address.id,
        minDownloadMbps: input.minDownloadMbps,
        allowWired: input.allowWired,
        allow5g: input.allow5g,
        allowStarlink: input.allowStarlink,
        readyForAssess: true,
      },
      update: {
        detectedBillId: bill.id,
        serviceAddressId: address.id,
        minDownloadMbps: input.minDownloadMbps,
        allowWired: input.allowWired,
        allow5g: input.allow5g,
        allowStarlink: input.allowStarlink,
        readyForAssess: true,
      },
    });

    return {
      ok: true as const,
      data: {
        bill: await mapBill(db, bill),
        address: {
          line1: address.line1,
          line2: address.line2,
          suburb: address.suburb,
          state: address.state,
          postcode: address.postcode,
        },
        prefs: {
          minDownloadMbps: profile.minDownloadMbps,
          allowWired: profile.allowWired,
          allow5g: profile.allow5g,
          allowStarlink: profile.allowStarlink,
          readyForAssess: profile.readyForAssess,
        },
      },
    };
  });
}

export type InternetBillTransaction = {
  transactionId: string;
  amountAud: number;
  postDate: string | null;
  accountName: string | null;
  matchedText: string;
  direction: string;
};

/** Evidence transactions behind the primary detected internet bill. */
export async function listInternetBillTransactions(
  ownerUserId: string,
): Promise<InternetBillTransaction[]> {
  return withOwnerContext(ownerUserId, async (db) => {
    const bill = await findPrimaryInternetBill(db, ownerUserId);
    if (!bill) return [];

    const evidence = await db.billEvidence.findMany({
      where: {
        ownerUserId,
        detectedBillId: bill.id,
      },
      orderBy: { transaction: { postDate: "desc" } },
      take: 40,
      include: {
        transaction: {
          select: {
            transactionId: true,
            amount: true,
            postDate: true,
            direction: true,
            account: { select: { name: true } },
          },
        },
      },
    });

    return evidence.map((row) => ({
      transactionId: row.transaction.transactionId,
      amountAud: Number(row.transaction.amount),
      postDate: row.transaction.postDate?.toISOString() ?? null,
      accountName: row.transaction.account.name,
      matchedText: row.matchedText,
      direction: row.transaction.direction,
    }));
  });
}
