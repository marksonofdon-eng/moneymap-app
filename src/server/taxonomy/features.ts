/**
 * Shared feature helpers for secondary map / model / miner.
 */
import {
  basiqSubclassCodeFromPayload,
  descriptionFromPayload,
  extractMerchantToken,
  isRecord,
  normalizeDescription,
} from "@/server/taxonomy/secondaryPatterns/matcher";

export {
  normalizeDescription,
  extractMerchantToken,
  descriptionFromPayload,
  basiqSubclassCodeFromPayload,
  isRecord,
};

export type TxFeatures = {
  description: string;
  descriptionNormalized: string;
  merchantToken: string | null;
  basiqL3Code: string | null;
  direction: "credit" | "debit" | "unknown";
  basiqTxClass: string | null;
  amountBucket: string;
  flowHint: "credit" | "debit" | "unknown";
};

function extractDirection(raw: unknown): "credit" | "debit" | "unknown" {
  if (!isRecord(raw)) return "unknown";
  const d = raw.direction;
  if (typeof d !== "string") return "unknown";
  const n = d.trim().toLowerCase();
  if (n === "credit" || n === "debit") return n;
  return "unknown";
}

function extractBasiqTxClass(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  for (const key of ["class", "_class"] as const) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim().toLowerCase();
  }
  const enrich = raw.enrich;
  if (isRecord(enrich) && typeof enrich.class === "string" && enrich.class.trim()) {
    return enrich.class.trim().toLowerCase();
  }
  return null;
}

function amountBucketFromPayload(raw: unknown): string {
  if (!isRecord(raw)) return "unk";
  const amount = raw.amount;
  const n =
    typeof amount === "number"
      ? Math.abs(amount)
      : typeof amount === "string"
        ? Math.abs(Number(amount))
        : NaN;
  if (!Number.isFinite(n)) return "unk";
  if (n < 10) return "lt10";
  if (n < 50) return "lt50";
  if (n < 200) return "lt200";
  if (n < 1000) return "lt1k";
  return "gte1k";
}

export function extractTxFeatures(
  rawPayload: unknown,
  directionHint?: string | null,
): TxFeatures {
  const description = descriptionFromPayload(rawPayload);
  const directionFromPayload = extractDirection(rawPayload);
  const direction =
    directionFromPayload !== "unknown"
      ? directionFromPayload
      : directionHint === "credit" || directionHint === "debit"
        ? directionHint
        : "unknown";

  return {
    description,
    descriptionNormalized: normalizeDescription(description),
    merchantToken: extractMerchantToken(description),
    basiqL3Code: basiqSubclassCodeFromPayload(rawPayload),
    direction,
    basiqTxClass: extractBasiqTxClass(rawPayload),
    amountBucket: amountBucketFromPayload(rawPayload),
    flowHint: direction,
  };
}

/** Stable bag-of-tokens string for hashing / TF features. */
export function featuresToTokenBag(features: TxFeatures): string {
  const parts = [
    `dir:${features.direction}`,
    features.merchantToken ? `merch:${features.merchantToken}` : null,
    features.basiqL3Code ? `l3:${features.basiqL3Code}` : null,
    features.basiqTxClass ? `class:${features.basiqTxClass}` : null,
    `amt:${features.amountBucket}`,
    ...features.descriptionNormalized.split(" ").filter(Boolean).map((t) => `w:${t}`),
  ];
  return parts.filter(Boolean).join(" ");
}
