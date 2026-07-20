/**
 * Credit / income taxonomy: Basiq transaction class + keyword rules → user labels.
 * Spend (debit) categorisation stays in expenseMapping / keywordRules.
 */

export const CREDIT_MATCHER_VERSION = "credit-income-v1";

export type CreditFlowType = "INCOME" | "TRANSFER" | "OTHER";

export type CreditClassMapping = {
  basiqTxClass: string;
  parentCategory: string;
  incomeCategory: string;
  flowType: CreditFlowType;
};

export type CreditKeywordRule = {
  parentCategory: string;
  incomeCategory: string;
  flowType: CreditFlowType;
  patterns: RegExp[];
  confidence: number;
  excludePatterns?: RegExp[];
};

/** Default map from Basiq credit `class` string → UI labels. */
export const CREDIT_CLASS_MAP: Record<string, CreditClassMapping> = {
  "direct-credit": {
    basiqTxClass: "direct-credit",
    parentCategory: "Income",
    incomeCategory: "Direct Credits",
    flowType: "INCOME",
  },
  transfer: {
    basiqTxClass: "transfer",
    parentCategory: "Income",
    incomeCategory: "Transfers In",
    flowType: "TRANSFER",
  },
  refund: {
    basiqTxClass: "refund",
    parentCategory: "Income",
    incomeCategory: "Refunds",
    flowType: "INCOME",
  },
  interest: {
    basiqTxClass: "interest",
    parentCategory: "Income",
    incomeCategory: "Interest",
    flowType: "INCOME",
  },
  "loan-repayment": {
    basiqTxClass: "loan-repayment",
    parentCategory: "Income",
    incomeCategory: "Loan Credits",
    flowType: "INCOME",
  },
  payment: {
    basiqTxClass: "payment",
    parentCategory: "Income",
    incomeCategory: "Other Credits",
    flowType: "INCOME",
  },
  "cash-deposit": {
    basiqTxClass: "cash-deposit",
    parentCategory: "Income",
    incomeCategory: "Cash Deposits",
    flowType: "INCOME",
  },
  "bank-fee": {
    basiqTxClass: "bank-fee",
    parentCategory: "Income",
    incomeCategory: "Fee Reversals",
    flowType: "OTHER",
  },
};

/**
 * More specific income labels from description / merchant text.
 * Ordered: first match wins.
 */
export const CREDIT_KEYWORD_RULES: CreditKeywordRule[] = [
  {
    parentCategory: "Income",
    incomeCategory: "Salary & Wages",
    flowType: "INCOME",
    patterns: [
      /\bsalary\b/i,
      /\bwage(?:s)?\b/i,
      /\bpayroll\b/i,
      /\bpay\s*run\b/i,
      /\bempl(?:oyer|oyment)\b/i,
    ],
    confidence: 92,
  },
  {
    parentCategory: "Income",
    incomeCategory: "Government Benefits",
    flowType: "INCOME",
    patterns: [
      /\bcentrelink\b/i,
      /\bservices\s*australia\b/i,
      /\bcare(?:rs?)?\s*payment\b/i,
      /\bjobseeker\b/i,
      /\bage\s*pension\b/i,
      /\bfamily\s*tax\s*benefit\b/i,
      /\baut\b/i,
    ],
    confidence: 90,
  },
  {
    parentCategory: "Income",
    incomeCategory: "Superannuation",
    flowType: "INCOME",
    patterns: [/\bsuper(?:annuation)?\b/i, /\bato\s*super\b/i],
    confidence: 88,
  },
  {
    parentCategory: "Income",
    incomeCategory: "Interest",
    flowType: "INCOME",
    patterns: [/\binterest\b/i, /\bint\s*cr\b/i, /\bcr\s*bal\b/i],
    confidence: 88,
  },
  {
    parentCategory: "Income",
    incomeCategory: "Refunds",
    flowType: "INCOME",
    patterns: [/\brefund\b/i, /\breversal\b/i, /\bchargeback\b/i],
    confidence: 85,
  },
  {
    parentCategory: "Income",
    incomeCategory: "Investment Income",
    flowType: "INCOME",
    patterns: [
      /\bdividend\b/i,
      /\bdistribution\b/i,
      /\bbrokerage\b/i,
      /\bshares?\b/i,
    ],
    confidence: 80,
  },
  {
    parentCategory: "Income",
    incomeCategory: "Rent Received",
    flowType: "INCOME",
    patterns: [/\brent\s*(?:received|payment|from)?\b/i, /\btenant\b/i],
    confidence: 82,
  },
  {
    parentCategory: "Income",
    incomeCategory: "Transfers In",
    flowType: "TRANSFER",
    patterns: [
      /\btransfer\s+from\b/i,
      /\btfr\s+from\b/i,
      /\binternal\s*transfer\b/i,
    ],
    confidence: 78,
  },
];

export function normalizeBasiqTxClass(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return trimmed || null;
  }
  if (typeof value === "object" && value !== null && "type" in value) {
    const type = (value as { type?: unknown }).type;
    if (typeof type === "string" && type.trim()) {
      return type.trim().toLowerCase();
    }
  }
  if (typeof value === "object" && value !== null && "title" in value) {
    const title = (value as { title?: unknown }).title;
    if (typeof title === "string" && title.trim()) {
      return title.trim().toLowerCase().replace(/\s+/g, "-");
    }
  }
  return null;
}

export function matchCreditKeywordRule(text: string): CreditKeywordRule | null {
  const haystack = text.trim();
  if (!haystack) return null;
  for (const rule of CREDIT_KEYWORD_RULES) {
    if (rule.excludePatterns?.some((p) => p.test(haystack))) continue;
    if (rule.patterns.some((p) => p.test(haystack))) return rule;
  }
  return null;
}

export function mapCreditClass(basiqTxClass: string | null): CreditClassMapping | null {
  if (!basiqTxClass) return null;
  return CREDIT_CLASS_MAP[basiqTxClass] ?? null;
}

/** Map Basiq Income API source kind + text → UI income category. */
export function incomeCategoryFromApiSource(opts: {
  kind: "REGULAR" | "IRREGULAR" | "OTHER_CREDIT";
  source: string;
  otherCreditLabel?: string | null;
}): { parentCategory: string; incomeCategory: string; flowType: CreditFlowType } {
  const text = `${opts.source} ${opts.otherCreditLabel ?? ""}`;
  const keyword = matchCreditKeywordRule(text);
  if (keyword) {
    return {
      parentCategory: keyword.parentCategory,
      incomeCategory: keyword.incomeCategory,
      flowType: keyword.flowType,
    };
  }
  if (opts.kind === "REGULAR") {
    return {
      parentCategory: "Income",
      incomeCategory: "Regular Income",
      flowType: "INCOME",
    };
  }
  if (opts.kind === "IRREGULAR") {
    return {
      parentCategory: "Income",
      incomeCategory: "Irregular Income",
      flowType: "INCOME",
    };
  }
  return {
    parentCategory: "Income",
    incomeCategory: opts.otherCreditLabel?.trim() || "Other Credits",
    flowType: "OTHER",
  };
}
