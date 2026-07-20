/**
 * Keyword / merchant rules → end-user Parent/Expense via canonical Basiq L4 codes.
 * Ordered: more specific rules should appear earlier.
 */
export type KeywordRule = {
  basiqL4Code: string;
  basiqL3Code: number;
  parentCategory: string;
  expenseCategory: string;
  patterns: RegExp[];
  confidence: number;
  excludePatterns?: RegExp[];
};

export const KEYWORD_RULES: KeywordRule[] = [
  // --- Fast food / takeaway (4512) — used when Basiq only sends L3 451 ---
  {
    basiqL4Code: "4512",
    basiqL3Code: 451,
    parentCategory: "Food & Dining",
    expenseCategory: "Takeaway",
    patterns: [
      /\bmcdonald/i,
      /\bmaccas\b/i,
      /\bdominos?\b/i,
      /\bpizza\s*hut\b/i,
      /\bkfc\b/i,
      /\bhungry\s*jack/i,
      /\bred\s*rooster\b/i,
      /\bsubway\b/i,
      /\bguzman\b/i,
      /\buber\s*\*?eats\b/i,
      /\bmenulog\b/i,
      /\bdeliveroo\b/i,
      /\bdoor\s*dash\b/i,
    ],
    confidence: 92,
  },

  // --- Internet (5801) ---
  {
    basiqL4Code: "5801",
    basiqL3Code: 580,
    parentCategory: "Utilities & Bills",
    expenseCategory: "Internet",
    patterns: [/\bstarlink\b/i, /\bspacex\s*starlink\b/i],
    confidence: 92,
  },
  {
    basiqL4Code: "5801",
    basiqL3Code: 580,
    parentCategory: "Utilities & Bills",
    expenseCategory: "Internet",
    patterns: [
      /\b(?:5g|4g)\s*home\b/i,
      /\bhome\s*wireless\b/i,
      /\bfixed\s*wireless\b/i,
    ],
    confidence: 85,
  },
  {
    basiqL4Code: "5801",
    basiqL3Code: 580,
    parentCategory: "Utilities & Bills",
    expenseCategory: "Internet",
    patterns: [
      /\baussie\s*broadband\b/i,
      /\baussiebb\b/i,
      /\bsuperloop\b/i,
      /\bexetel\b/i,
      /\bspintel\b/i,
      /\bspin\s*tel\b/i,
      /\blauntel\b/i,
      /\bleaptel\b/i,
      /\btangerine(?:\s*telecom)?\b/i,
      /\bmore\s*telecom\b/i,
      /\bflip(?:\s*connect)?\b/i,
      /\biinet\b/i,
      /\bnbn\b/i,
      /\bbroadband\b/i,
      /\bhome\s*(?:internet|wi-?fi)\b/i,
    ],
    confidence: 88,
    excludePatterns: [/\bmobile\b/i, /\bprepaid\b/i, /\bsim\b/i],
  },
  {
    basiqL4Code: "5801",
    basiqL3Code: 580,
    parentCategory: "Utilities & Bills",
    expenseCategory: "Internet",
    patterns: [/\btpg\b/i, /\bdodo\b/i],
    confidence: 70,
    excludePatterns: [/\bmobile\b/i, /\bprepaid\b/i],
  },
  {
    basiqL4Code: "5801",
    basiqL3Code: 580,
    parentCategory: "Utilities & Bills",
    expenseCategory: "Internet",
    patterns: [/\btelstra\b/i, /\boptus\b/i, /\bvodafone\b/i],
    confidence: 55,
    excludePatterns: [/\bmobile\b/i, /\bprepaid\b/i, /\bsim\b/i, /\bpostpaid\b/i],
  },

  // --- Mobile (5802) ---
  {
    basiqL4Code: "5802",
    basiqL3Code: 580,
    parentCategory: "Utilities & Bills",
    expenseCategory: "Mobile",
    patterns: [
      /\bmobile\b/i,
      /\bpostpaid\b/i,
      /\bsim\s*(?:only|plan)?\b/i,
      /\bboost\s*mobile\b/i,
      /\bamaysim\b/i,
      /\baldi\s*mobile\b/i,
    ],
    confidence: 80,
  },

  // --- Electricity (2611) ---
  {
    basiqL4Code: "2611",
    basiqL3Code: 261,
    parentCategory: "Utilities & Bills",
    expenseCategory: "Electricity",
    patterns: [
      /\bagl\b/i,
      /\borigin\s*energy\b/i,
      /\benergyaustralia\b/i,
      /\bred\s*energy\b/i,
      /\balinta\b/i,
      /\belectricity\b/i,
      /\bpower\s*bill\b/i,
    ],
    confidence: 82,
  },

  // --- Gas (2700) ---
  {
    basiqL4Code: "2700",
    basiqL3Code: 270,
    parentCategory: "Utilities & Bills",
    expenseCategory: "Gas",
    patterns: [/\bgas\s*(?:bill|supply|network)?\b/i, /\bjemena\b/i],
    confidence: 80,
  },

  // --- Water (2811) ---
  {
    basiqL4Code: "2811",
    basiqL3Code: 281,
    parentCategory: "Utilities & Bills",
    expenseCategory: "Water",
    patterns: [
      /\bwater\s*(?:bill|corp|corporation)?\b/i,
      /\bsydney\s*water\b/i,
      /\byarra\s*valley\s*water\b/i,
      /\bsewer/i,
    ],
    confidence: 82,
  },

  // --- Council / waste ---
  {
    basiqL4Code: "2911",
    basiqL3Code: 291,
    parentCategory: "Utilities & Bills",
    expenseCategory: "Waste Rates",
    patterns: [/\bcouncil\s*rates\b/i, /\brates\s*notice\b/i, /\bwaste\b/i],
    confidence: 75,
  },

  // --- Mortgage brokers / housing debt cues ---
  {
    basiqL4Code: "6231",
    basiqL3Code: 623,
    parentCategory: "Finance, Legal & Ins",
    expenseCategory: "Mortgage Brokers",
    patterns: [/\bmortgage\b/i, /\bhome\s*loan\b/i],
    confidence: 70,
  },

  // --- Credit / banking ---
  {
    basiqL4Code: "6221",
    basiqL3Code: 622,
    parentCategory: "Finance, Legal & Ins",
    expenseCategory: "Bank Fees",
    patterns: [/\bcredit\s*card\b/i, /\bbank\s*fee\b/i],
    confidence: 65,
  },

  // --- Car loan-ish ---
  {
    basiqL4Code: "6223",
    basiqL3Code: 622,
    parentCategory: "Finance, Legal & Ins",
    expenseCategory: "Banking Services",
    patterns: [/\bcar\s*loan\b/i, /\bauto\s*loan\b/i, /\bvehicle\s*finance\b/i],
    confidence: 72,
  },

  // --- Groceries (4110) ---
  {
    basiqL4Code: "4110",
    basiqL3Code: 411,
    parentCategory: "Food & Dining",
    expenseCategory: "Groceries",
    patterns: [
      /\bwoolworths\b/i,
      /\bcoles\b/i,
      /\bald[iı]\b/i,
      /\biga\b/i,
      /\bsupermarket\b/i,
      /\bgrocer/i,
    ],
    confidence: 88,
  },

  // --- Fuel (no dedicated retail L4 in mapping; nearest Transport & Auto fuel class) ---
  {
    basiqL4Code: "3415",
    basiqL3Code: 341,
    parentCategory: "Transport & Auto",
    expenseCategory: "Refinery Oils",
    patterns: [
      /\bshell\b/i,
      /\bampol\b/i,
      /\bbp\b/i,
      /\bcaltex\b/i,
      /\b7[\s-]?eleven\b/i,
      /\bpetrol\b/i,
      /\bfuel\b/i,
      /\bservice\s*station\b/i,
    ],
    confidence: 85,
  },

  // --- Car insurance ---
  {
    basiqL4Code: "6322",
    basiqL3Code: 632,
    parentCategory: "Transport & Auto",
    expenseCategory: "Car Insurance",
    patterns: [
      /\bnrma\b/i,
      /\brac[qv]?\b/i,
      /\baami\b/i,
      /\byou[iı]\b/i,
      /\bbudget\s*direct\b/i,
      /\bcar\s*insur/i,
      /\bmotor\s*insur/i,
    ],
    confidence: 82,
  },

  // --- House insurance ---
  {
    basiqL4Code: "6322",
    basiqL3Code: 632,
    parentCategory: "Finance, Legal & Ins",
    expenseCategory: "Specialized Insurance",
    patterns: [/\bhome\s*(?:&|and)?\s*contents\b/i, /\bhouse\s*insur/i, /\bbuilding\s*insur/i],
    confidence: 78,
  },

  // --- Health insurance ---
  {
    basiqL4Code: "6321",
    basiqL3Code: 632,
    parentCategory: "Health & Medical",
    expenseCategory: "Health Insurance",
    patterns: [
      /\bmedibank\b/i,
      /\bbupa\b/i,
      /\bhcf\b/i,
      /\bnib\b/i,
      /\baustralian\s*unity\b/i,
      /\bhealth\s*insur/i,
    ],
    confidence: 88,
  },

  // --- Life / income protection ---
  {
    basiqL4Code: "6310",
    basiqL3Code: 631,
    parentCategory: "Finance, Legal & Ins",
    expenseCategory: "Life Insurance",
    patterns: [/\blife\s*insur/i, /\bincome\s*protection\b/i],
    confidence: 80,
  },

  // --- Pet insurance ---
  {
    basiqL4Code: "6323",
    basiqL3Code: 632,
    parentCategory: "Finance, Legal & Ins",
    expenseCategory: "Specialized Insurance",
    patterns: [/\bpet\s*insur/i, /\bbow\s*wow\b/i],
    confidence: 80,
  },

  // --- Streaming / subscriptions ---
  {
    basiqL4Code: "5414",
    basiqL3Code: 541,
    parentCategory: "Tech & Electronics",
    expenseCategory: "App Store Purchases",
    patterns: [
      /\bnetflix\b/i,
      /\bspotify\b/i,
      /\bdisney\+?\b/i,
      /\bstan\b/i,
      /\bapple\.com\/bill\b/i,
      /\bgoogle\s*\*?(?:youtube|google\s*one)\b/i,
    ],
    confidence: 85,
  },

  // --- Gym ---
  {
    basiqL4Code: "9111",
    basiqL3Code: 911,
    parentCategory: "Personal Care",
    expenseCategory: "Gym & Fitness",
    patterns: [
      /\bfitness\s*first\b/i,
      /\banytime\s*fitness\b/i,
      /\bplus\s*fitness\b/i,
      /\bgym\b/i,
    ],
    confidence: 80,
  },

  // --- Public transport ---
  {
    basiqL4Code: "4622",
    basiqL3Code: 462,
    parentCategory: "Transport & Auto",
    expenseCategory: "Public Transport",
    patterns: [/\bopal\b/i, /\bmyki\b/i, /\btranslink\b/i, /\bpublic\s*transport\b/i],
    confidence: 82,
  },

  // --- Childcare ---
  {
    basiqL4Code: "8010",
    basiqL3Code: 801,
    parentCategory: "Family & Children",
    expenseCategory: "Childcare",
    patterns: [/\bchild\s*care\b/i, /\bchildcare\b/i, /\bday\s*care\b/i],
    confidence: 82,
  },

  // --- School ---
  {
    basiqL4Code: "8021",
    basiqL3Code: 802,
    parentCategory: "Family & Children",
    expenseCategory: "Primary School",
    patterns: [/\bschool\s*fees?\b/i, /\btuition\b/i],
    confidence: 80,
  },

  // --- Charity ---
  {
    basiqL4Code: "9559",
    basiqL3Code: 955,
    parentCategory: "Gifts & Donations",
    expenseCategory: "Community Groups",
    patterns: [/\bdonation\b/i, /\bcharity\b/i, /\bred\s*cross\b/i],
    confidence: 75,
  },
];

export function matchKeywordRule(
  text: string,
): {
  basiqL4Code: string;
  basiqL3Code: number;
  parentCategory: string;
  expenseCategory: string;
  confidence: number;
  reason: string;
} | null {
  const haystack = text.trim();
  if (!haystack) return null;

  for (const rule of KEYWORD_RULES) {
    if (rule.excludePatterns?.some((pattern) => pattern.test(haystack))) {
      continue;
    }
    if (!rule.patterns.some((pattern) => pattern.test(haystack))) continue;
    return {
      basiqL4Code: rule.basiqL4Code,
      basiqL3Code: rule.basiqL3Code,
      parentCategory: rule.parentCategory,
      expenseCategory: rule.expenseCategory,
      confidence: rule.confidence,
      reason: `keyword:${rule.basiqL4Code}:${rule.expenseCategory}`,
    };
  }
  return null;
}
