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
};

export type InternetSavingsState = {
  hasDetectedBill: boolean;
  buttonTone: "amber" | "green";
  bill: InternetSavingsBillSummary | null;
  intakeReady: boolean;
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

function mapBill(row: {
  id: string;
  providerName: string;
  estimatedMonthlyCostAud: { toString(): string };
  confidence: number;
  status: "DETECTED" | "CONFIRMED" | "DISMISSED";
  occurrenceCount: number;
  lastSeenAt: Date;
}): InternetSavingsBillSummary {
  return {
    id: row.id,
    providerName: row.providerName,
    estimatedMonthlyCostAud: Number(row.estimatedMonthlyCostAud),
    confidence: row.confidence,
    status: row.status,
    occurrenceCount: row.occurrenceCount,
    lastSeenAt: row.lastSeenAt.toISOString(),
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
  return withOwnerContext(ownerUserId, async (db) => {
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
      buttonTone: bill ? "green" : "amber",
      bill: bill ? mapBill(bill) : null,
      intakeReady: Boolean(profile?.readyForAssess),
    };
  });
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
      bill: bill ? mapBill(bill) : null,
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
        bill: mapBill(bill),
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
