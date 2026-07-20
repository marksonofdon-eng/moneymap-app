import { randomBytes } from "node:crypto";
import type {
  SecondaryCategoryRule,
  SecondaryPatternType,
  TransactionFlow,
} from "@prisma/client";
import { classifyBasiqAnzsicCode } from "@/server/taxonomy/expenseMapping";

export const SECONDARY_MATCHER_VERSION = "secondary-v1";
export const SECONDARY_MIN_SUPPORT = 3;
export const SECONDARY_CONFIDENCE_FLOOR = 85;

export type SecondaryMatchSpec = {
  direction?: "credit" | "debit" | "any";
  basiqL3Code?: string;
  descriptionNormalized?: string;
  merchantToken?: string;
};

export type SecondaryRuleMatch = {
  ruleId: string;
  parentCategory: string;
  expenseCategory: string;
  flowType: TransactionFlow;
  confidence: number;
  matcherVersion: string;
  reason: string;
};

export function newSecondaryRuleId(): string {
  return `scr_${randomBytes(12).toString("hex")}`;
}

export function normalizeDescription(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\d{4,}\b/g, "#")
    .replace(/[^a-z0-9#\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function extractMerchantToken(description: string): string | null {
  const normalized = normalizeDescription(description);
  if (!normalized) return null;
  const stop = new Set([
    "the",
    "and",
    "from",
    "transfer",
    "payment",
    "deposit",
    "thank",
    "you",
    "ref",
    "unknown",
    "of",
    "to",
    "in",
    "on",
    "at",
    "by",
    "or",
    "an",
    "is",
    "it",
    "as",
    "be",
    "we",
    "me",
    "my",
    "up",
    "if",
    "so",
    "no",
    "us",
    "au",
    "nsw",
    "vic",
    "qld",
    "act",
    "sa",
    "wa",
    "nt",
    "tas",
  ]);
  const token = normalized
    .split(" ")
    .find((part) => part.length >= 2 && !stop.has(part) && part !== "#");
  return token ?? null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function descriptionFromPayload(raw: unknown): string {
  if (!isRecord(raw)) return "";
  if (typeof raw.description === "string") return raw.description;
  return "";
}

export function basiqSubclassCodeFromPayload(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const sub = isRecord(raw.subClass) ? raw.subClass : null;
  const enrich = isRecord(raw.enrich) ? raw.enrich : null;
  const enrichSub = enrich && isRecord(enrich.subClass) ? enrich.subClass : null;
  const code = sub?.code ?? enrichSub?.code;
  if (code == null) return null;
  const digits = String(code)
    .trim()
    .replace(/^[A-Za-z]+/, "")
    .replace(/[^0-9]/g, "");
  return digits || null;
}

/** L3 group for secondary BASIQ_L3 rules (handles L3 stuffed into subClass.code). */
export function basiqL3CodeFromPayload(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const sub = isRecord(raw.subClass) ? raw.subClass : null;
  const enrich = isRecord(raw.enrich) ? raw.enrich : null;
  const enrichSub = enrich && isRecord(enrich.subClass) ? enrich.subClass : null;
  const enrichCat = enrich && isRecord(enrich.category) ? enrich.category : null;
  return classifyBasiqAnzsicCode(
    sub?.code ?? enrichSub?.code ?? enrichCat?.code,
  ).l3;
}

function parseMatchSpec(value: unknown): SecondaryMatchSpec {
  if (!isRecord(value)) return {};
  return {
    direction:
      value.direction === "credit" ||
      value.direction === "debit" ||
      value.direction === "any"
        ? value.direction
        : "any",
    basiqL3Code:
      typeof value.basiqL3Code === "string" ? value.basiqL3Code : undefined,
    descriptionNormalized:
      typeof value.descriptionNormalized === "string"
        ? value.descriptionNormalized
        : undefined,
    merchantToken:
      typeof value.merchantToken === "string" ? value.merchantToken : undefined,
  };
}

export function matchSecondaryRule(
  rule: Pick<
    SecondaryCategoryRule,
    | "id"
    | "patternType"
    | "patternValue"
    | "matchSpec"
    | "parentCategory"
    | "expenseCategory"
    | "flowType"
    | "confidence"
    | "matcherVersion"
  >,
  input: {
    direction: string;
    description: string;
    basiqSubclassCode: string | null;
  },
): SecondaryRuleMatch | null {
  const spec = parseMatchSpec(rule.matchSpec);
  const direction = input.direction.toLowerCase();
  if (spec.direction && spec.direction !== "any" && spec.direction !== direction) {
    return null;
  }

  const descNorm = normalizeDescription(input.description);
  const merchant = extractMerchantToken(input.description);
  const patternType = rule.patternType as SecondaryPatternType;
  const classified = classifyBasiqAnzsicCode(input.basiqSubclassCode);
  const l3ForMatch = classified.l3 ?? input.basiqSubclassCode;

  let matched = false;
  if (patternType === "BASIQ_L3") {
    matched =
      Boolean(l3ForMatch) &&
      l3ForMatch === rule.patternValue &&
      l3ForMatch !== "0";
  } else if (patternType === "DESC_NORMALIZED") {
    matched = Boolean(descNorm) && descNorm === rule.patternValue;
  } else if (patternType === "MERCHANT_TOKEN") {
    matched = Boolean(merchant) && merchant === rule.patternValue;
  }

  if (!matched) return null;

  return {
    ruleId: rule.id,
    parentCategory: rule.parentCategory,
    expenseCategory: rule.expenseCategory,
    flowType: rule.flowType,
    confidence: rule.confidence,
    matcherVersion: rule.matcherVersion,
    reason: `secondary:${patternType}:${rule.patternValue}`,
  };
}

export function matchFirstSecondaryRule(
  rules: Array<
    Pick<
      SecondaryCategoryRule,
      | "id"
      | "patternType"
      | "patternValue"
      | "matchSpec"
      | "parentCategory"
      | "expenseCategory"
      | "flowType"
      | "confidence"
      | "matcherVersion"
    >
  >,
  input: {
    direction: string;
    description: string;
    basiqSubclassCode: string | null;
  },
): SecondaryRuleMatch | null {
  for (const rule of rules) {
    const hit = matchSecondaryRule(rule, input);
    if (hit) return hit;
  }
  return null;
}
