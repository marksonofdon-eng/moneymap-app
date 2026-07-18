import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { withOwnerContext } from "@/server/data/dbContext";
import {
  capabilityProvider,
  type CapabilityAddress,
  type CapabilityProvider,
} from "@/server/internetSavings/capabilityProvider";

type TxClient = Prisma.TransactionClient;
type AssessmentWithOptions =
  Prisma.AddressCapabilityAssessmentGetPayload<{
    include: { options: true };
  }>;

export type InternetCapabilityAssessment = {
  id: string;
  provider: string;
  status: "PENDING" | "READY" | "FAILED";
  checkedAt: string;
  stale: boolean;
  failureReason: string | null;
  options: Array<{
    id: string;
    accessFamily: "NBN" | "FIVE_G" | "STARLINK";
    connectionType:
      | "FTTP"
      | "FTTN"
      | "FTTC"
      | "HFC"
      | "FIXED_WIRELESS"
      | "FIVE_G_WIRELESS"
      | null;
    available: boolean;
    maxDownMbps: number | null;
    maxUpMbps: number | null;
    typicalEveningMbps: number | null;
    confidence: number;
    notes: string | null;
  }>;
};

type ReadyInput = {
  addressId: string;
  address: CapabilityAddress;
  fingerprint: string;
};

export function capabilityAddressFingerprint(
  address: CapabilityAddress,
): string {
  const canonical = [
    address.line1.trim().toUpperCase(),
    address.line2?.trim().toUpperCase() ?? "",
    address.suburb.trim().toUpperCase(),
    address.state.trim().toUpperCase(),
    address.postcode.trim(),
    address.country.trim().toUpperCase(),
    address.lat ?? "",
    address.lng ?? "",
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

function mapAssessment(
  row: AssessmentWithOptions,
  currentFingerprint: string,
): InternetCapabilityAssessment {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    checkedAt: row.checkedAt.toISOString(),
    stale: row.addressFingerprint !== currentFingerprint,
    failureReason: row.failureReason,
    options: row.options.map((option) => ({
      id: option.id,
      accessFamily: option.accessFamily,
      connectionType: option.connectionType,
      available: option.available,
      maxDownMbps: option.maxDownMbps,
      maxUpMbps: option.maxUpMbps,
      typicalEveningMbps: option.typicalEveningMbps,
      confidence: option.confidence,
      notes: option.notes,
    })),
  };
}

async function loadReadyInput(
  db: TxClient,
  ownerUserId: string,
): Promise<ReadyInput | null> {
  const profile = await db.userNeedProfile.findUnique({
    where: {
      ownerUserId_category: {
        ownerUserId,
        category: "INTERNET",
      },
    },
    include: { serviceAddress: true },
  });
  if (!profile?.readyForAssess || !profile.serviceAddress) return null;

  const row = profile.serviceAddress;
  const address: CapabilityAddress = {
    line1: row.line1,
    line2: row.line2,
    suburb: row.suburb,
    state: row.state,
    postcode: row.postcode,
    country: row.country,
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
  };
  return {
    addressId: row.id,
    address,
    fingerprint: capabilityAddressFingerprint(address),
  };
}

export async function getLatestInternetCapabilities(
  ownerUserId: string,
): Promise<InternetCapabilityAssessment | null> {
  return withOwnerContext(ownerUserId, async (db) => {
    const input = await loadReadyInput(db, ownerUserId);
    if (!input) return null;
    const assessment = await db.addressCapabilityAssessment.findFirst({
      where: {
        ownerUserId,
        addressId: input.addressId,
      },
      orderBy: { checkedAt: "desc" },
      include: { options: { orderBy: { accessFamily: "asc" } } },
    });
    return assessment ? mapAssessment(assessment, input.fingerprint) : null;
  });
}

export async function assessInternetCapabilitiesForOwner(
  ownerUserId: string,
  provider: CapabilityProvider = capabilityProvider,
) {
  const input = await withOwnerContext(ownerUserId, (db) =>
    loadReadyInput(db, ownerUserId),
  );
  if (!input) {
    return { ok: false as const, error: "intake_not_ready" as const };
  }

  let result: Awaited<ReturnType<CapabilityProvider["assess"]>>;
  try {
    result = await provider.assess(input.address);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Capability assessment failed";
    const failed = await withOwnerContext(ownerUserId, (db) =>
      db.addressCapabilityAssessment.create({
        data: {
          ownerUserId,
          addressId: input.addressId,
          addressFingerprint: input.fingerprint,
          provider: provider.key,
          status: "FAILED",
          checkedAt: new Date(),
          rawPayload: { error: message },
          failureReason: message,
        },
        include: { options: true },
      }),
    );
    return {
      ok: false as const,
      error: "assessment_failed" as const,
      data: mapAssessment(failed, input.fingerprint),
    };
  }

  const assessment = await withOwnerContext(ownerUserId, (db) =>
    db.addressCapabilityAssessment.create({
      data: {
        ownerUserId,
        addressId: input.addressId,
        addressFingerprint: input.fingerprint,
        provider: result.provider,
        status: "READY",
        checkedAt: result.checkedAt,
        rawPayload: result.rawPayload as Prisma.InputJsonObject,
        options: {
          create: result.options.map((option) => ({
            ownerUserId,
            accessFamily: option.accessFamily,
            connectionType: option.connectionType,
            available: option.available,
            maxDownMbps: option.maxDownMbps,
            maxUpMbps: option.maxUpMbps,
            typicalEveningMbps: option.typicalEveningMbps,
            confidence: option.confidence,
            notes: option.notes,
          })),
        },
      },
      include: { options: { orderBy: { accessFamily: "asc" } } },
    }),
  );
  return {
    ok: true as const,
    data: mapAssessment(assessment, input.fingerprint),
  };
}
