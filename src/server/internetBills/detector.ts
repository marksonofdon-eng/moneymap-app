export const INTERNET_BILL_MATCHER_VERSION = "internet-v1";

const MIN_SERIES_CONFIDENCE = 65;
const DAY_MS = 24 * 60 * 60 * 1000;

type ProviderRule = {
  key: string;
  name: string;
  patterns: RegExp[];
  internetFirst: boolean;
};

const PROVIDERS: ProviderRule[] = [
  {
    key: "aussie-broadband",
    name: "Aussie Broadband",
    patterns: [/\baussie\s*broadband\b/i, /\baussiebb\b/i],
    internetFirst: true,
  },
  {
    key: "superloop",
    name: "Superloop",
    patterns: [/\bsuperloop\b/i],
    internetFirst: true,
  },
  {
    key: "exetel",
    name: "Exetel",
    patterns: [/\bexetel\b/i],
    internetFirst: true,
  },
  {
    key: "spintel",
    name: "SpinTel",
    patterns: [/\bspin\s*tel\b/i, /\bspintel\b/i],
    internetFirst: true,
  },
  {
    key: "launtel",
    name: "Launtel",
    patterns: [/\blauntel\b/i],
    internetFirst: true,
  },
  {
    key: "leaptel",
    name: "Leaptel",
    patterns: [/\bleaptel\b/i],
    internetFirst: true,
  },
  {
    key: "tangerine",
    name: "Tangerine Telecom",
    patterns: [/\btangerine(?:\s*telecom)?\b/i],
    internetFirst: true,
  },
  {
    key: "more-telecom",
    name: "More Telecom",
    patterns: [/\bmore\s*telecom\b/i],
    internetFirst: true,
  },
  {
    key: "flip",
    name: "Flip",
    patterns: [/\bflip(?:\s*connect)?\b/i],
    internetFirst: true,
  },
  {
    key: "iinetworks",
    name: "iiNet",
    patterns: [/\biinet\b/i],
    internetFirst: true,
  },
  {
    key: "starlink",
    name: "Starlink",
    patterns: [/\bstarlink\b/i, /\bspacex\s*starlink\b/i],
    internetFirst: true,
  },
  {
    key: "telstra",
    name: "Telstra",
    patterns: [/\btelstra\b/i],
    internetFirst: false,
  },
  {
    key: "optus",
    name: "Optus",
    patterns: [/\boptus\b/i],
    internetFirst: false,
  },
  {
    key: "tpg",
    name: "TPG",
    patterns: [/\btpg\b/i],
    internetFirst: false,
  },
  {
    key: "vodafone",
    name: "Vodafone",
    patterns: [/\bvodafone\b/i],
    internetFirst: false,
  },
  {
    key: "dodo",
    name: "Dodo",
    patterns: [/\bdodo\b/i],
    internetFirst: false,
  },
];

const INTERNET_CUE =
  /\b(?:nbn|broadband|internet|home\s*(?:wi-?fi|wireless)|fixed\s*wireless|fibre|fiber)\b/i;

const TEXT_PATHS = [
  ["description"],
  ["merchant", "name"],
  ["merchant", "businessName"],
  ["biller", "name"],
  ["enrich", "merchant", "name"],
  ["enrich", "merchant", "businessName"],
  ["enrich", "cleanDescription"],
  ["enrich", "description"],
  ["class", "title"],
  ["subClass", "title"],
] as const;

export type InternetBillTransaction = {
  transactionId: string;
  accountId: string;
  amount: number;
  postDate: Date;
  rawPayload: unknown;
};

export type ProviderMatch = {
  providerKey: string;
  providerName: string;
  matchedText: string;
  score: number;
  reasons: string[];
};

export type InternetBillDetection = {
  seriesKey: string;
  providerKey: string;
  providerName: string;
  estimatedMonthlyCostAud: number;
  confidence: number;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  matcherVersion: string;
  evidence: Array<{
    transactionId: string;
    matchedProviderKey: string;
    matchedText: string;
    matchScore: number;
    matchReasons: string[];
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAtPath(raw: unknown, path: readonly string[]): unknown {
  let value: unknown = raw;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = value[key];
  }
  return value;
}

export function extractTransactionMatchText(raw: unknown): string {
  const parts: string[] = [];
  for (const path of TEXT_PATHS) {
    const value = valueAtPath(raw, path);
    if (typeof value === "string" && value.trim()) {
      parts.push(value.trim());
    }
  }
  return [...new Set(parts)].join(" | ").slice(0, 500);
}

export function matchInternetProvider(raw: unknown): ProviderMatch | null {
  const matchedText = extractTransactionMatchText(raw);
  if (!matchedText) return null;

  const provider = PROVIDERS.find((rule) =>
    rule.patterns.some((pattern) => pattern.test(matchedText)),
  );
  if (!provider) return null;

  const hasInternetCue = INTERNET_CUE.test(matchedText);
  const reasons = [
    `provider:${provider.key}`,
    provider.internetFirst
      ? "internet_first_provider"
      : "multi_service_provider",
  ];
  let score = provider.internetFirst ? 65 : 40;
  if (hasInternetCue) {
    score += 25;
    reasons.push("internet_service_cue");
  }

  return {
    providerKey: provider.key,
    providerName: provider.name,
    matchedText,
    score: Math.min(score, 100),
    reasons,
  };
}

function median(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle];
  return (ordered[middle - 1] + ordered[middle]) / 2;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

type MatchedTransaction = InternetBillTransaction & { match: ProviderMatch };

function assessSeries(rows: MatchedTransaction[]): InternetBillDetection | null {
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
    intervals.filter((days) => days >= 20 && days <= 45).length /
    intervals.length;
  const amountTolerance = Math.max(3, medianAmount * 0.08);
  const consistentAmountRatio =
    amounts.filter((amount) => Math.abs(amount - medianAmount) <= amountTolerance)
      .length / amounts.length;

  // Recurrence is mandatory. This intentionally favours precision over recall.
  if (monthlyRatio < 0.5 || consistentAmountRatio < 0.6) return null;

  const baseProviderScore = Math.round(
    sorted.reduce((sum, row) => sum + row.match.score, 0) / sorted.length,
  );
  const confidence = Math.min(
    100,
    Math.round(
      baseProviderScore +
        monthlyRatio * 15 +
        consistentAmountRatio * 12 +
        Math.min(8, sorted.length * 2),
    ),
  );
  if (confidence < MIN_SERIES_CONFIDENCE) return null;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    seriesKey: `${first.match.providerKey}:${first.accountId}`.slice(0, 160),
    providerKey: first.match.providerKey,
    providerName: first.match.providerName,
    estimatedMonthlyCostAud: roundMoney(medianAmount),
    confidence,
    occurrenceCount: sorted.length,
    firstSeenAt: first.postDate,
    lastSeenAt: last.postDate,
    matcherVersion: INTERNET_BILL_MATCHER_VERSION,
    evidence: sorted.map((row) => ({
      transactionId: row.transactionId,
      matchedProviderKey: row.match.providerKey,
      matchedText: row.match.matchedText,
      matchScore: row.match.score,
      matchReasons: [
        ...row.match.reasons,
        "recurring_monthly_series",
        "consistent_amount",
      ],
    })),
  };
}

export function detectInternetBillSeries(
  transactions: InternetBillTransaction[],
): InternetBillDetection[] {
  const groups = new Map<string, MatchedTransaction[]>();

  for (const transaction of transactions) {
    if (
      !Number.isFinite(transaction.amount) ||
      transaction.amount <= 0 ||
      Number.isNaN(transaction.postDate.getTime())
    ) {
      continue;
    }
    const match = matchInternetProvider(transaction.rawPayload);
    if (!match) continue;
    const key = `${match.providerKey}:${transaction.accountId}`;
    const group = groups.get(key) ?? [];
    group.push({ ...transaction, match });
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(assessSeries)
    .filter((result): result is InternetBillDetection => result !== null)
    .sort((a, b) => b.confidence - a.confidence);
}
