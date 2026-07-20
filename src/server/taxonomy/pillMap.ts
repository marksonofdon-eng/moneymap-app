/**
 * Bill Savings Scan pill id → end-user expense category label(s).
 */
export type PillTaxonomyMap = {
  pillId: string;
  label: string;
  /** Match transactions / bills by these expense_category values. */
  expenseCategories: string[];
  /** Preferred Basiq L4 when stamping a detected bill. */
  defaultBasiqL4Code?: string;
  defaultBasiqL3Code?: number;
  defaultParentCategory?: string;
};

export const BILL_PILL_TAXONOMY: PillTaxonomyMap[] = [
  {
    pillId: "internet",
    label: "Internet",
    expenseCategories: ["Internet"],
    defaultBasiqL4Code: "5801",
    defaultBasiqL3Code: 580,
    defaultParentCategory: "Utilities & Bills",
  },
  {
    pillId: "mobile",
    label: "Mobile",
    expenseCategories: ["Mobile"],
    defaultBasiqL4Code: "5802",
    defaultBasiqL3Code: 580,
    defaultParentCategory: "Utilities & Bills",
  },
  {
    pillId: "gas",
    label: "Gas",
    expenseCategories: ["Gas"],
    defaultBasiqL4Code: "2700",
    defaultBasiqL3Code: 270,
    defaultParentCategory: "Utilities & Bills",
  },
  {
    pillId: "electricity",
    label: "Electricity",
    expenseCategories: ["Electricity"],
    defaultBasiqL4Code: "2611",
    defaultBasiqL3Code: 261,
    defaultParentCategory: "Utilities & Bills",
  },
  {
    pillId: "house-insurance",
    label: "House Insurance",
    expenseCategories: ["Specialized Insurance"],
    defaultBasiqL4Code: "6323",
    defaultBasiqL3Code: 632,
    defaultParentCategory: "Finance, Legal & Ins",
  },
  {
    pillId: "car-insurance",
    label: "Car Insurance",
    expenseCategories: ["Car Insurance"],
    defaultBasiqL4Code: "6322",
    defaultBasiqL3Code: 632,
    defaultParentCategory: "Transport & Auto",
  },
  {
    pillId: "subscriptions",
    label: "Subscriptions",
    expenseCategories: ["App Store Purchases"],
    defaultBasiqL4Code: "5414",
    defaultBasiqL3Code: 541,
    defaultParentCategory: "Tech & Electronics",
  },
  {
    pillId: "mortgage-payments",
    label: "Mortgage Payments",
    expenseCategories: ["Mortgage Brokers", "Rent"],
    defaultBasiqL4Code: "6231",
    defaultBasiqL3Code: 623,
    defaultParentCategory: "Finance, Legal & Ins",
  },
  {
    pillId: "credit-card",
    label: "Credit Card",
    expenseCategories: ["Bank Fees", "Banking Services"],
    defaultBasiqL4Code: "6221",
    defaultBasiqL3Code: 622,
    defaultParentCategory: "Finance, Legal & Ins",
  },
  {
    pillId: "groceries",
    label: "Groceries",
    expenseCategories: ["Groceries"],
    defaultBasiqL4Code: "4110",
    defaultBasiqL3Code: 411,
    defaultParentCategory: "Food & Dining",
  },
  {
    pillId: "school-fees",
    label: "School Fees",
    expenseCategories: ["Primary School", "High School"],
    defaultBasiqL4Code: "8021",
    defaultBasiqL3Code: 802,
    defaultParentCategory: "Family & Children",
  },
  {
    pillId: "life-insurance",
    label: "Life Insurance",
    expenseCategories: ["Life Insurance"],
    defaultBasiqL4Code: "6310",
    defaultBasiqL3Code: 631,
    defaultParentCategory: "Finance, Legal & Ins",
  },
  {
    pillId: "car-fuel",
    label: "Car Fuel",
    expenseCategories: ["Refinery Oils", "Bulk Fuel"],
    defaultBasiqL4Code: "3415",
    defaultBasiqL3Code: 341,
    defaultParentCategory: "Transport & Auto",
  },
  {
    pillId: "gym",
    label: "Gym",
    expenseCategories: ["Gym & Fitness"],
    defaultBasiqL4Code: "9111",
    defaultBasiqL3Code: 911,
    defaultParentCategory: "Personal Care",
  },
  {
    pillId: "water-sewer",
    label: "Water & Sewer",
    expenseCategories: ["Water"],
    defaultBasiqL4Code: "2811",
    defaultBasiqL3Code: 281,
    defaultParentCategory: "Utilities & Bills",
  },
  {
    pillId: "council-rates",
    label: "Council Rates",
    expenseCategories: ["Waste Rates"],
    defaultBasiqL4Code: "2911",
    defaultBasiqL3Code: 291,
    defaultParentCategory: "Utilities & Bills",
  },
  {
    pillId: "health-insurance",
    label: "Health Insurance",
    expenseCategories: ["Health Insurance"],
    defaultBasiqL4Code: "6321",
    defaultBasiqL3Code: 632,
    defaultParentCategory: "Health & Medical",
  },
  {
    pillId: "public-transport",
    label: "Public Transport",
    expenseCategories: ["Public Transport", "Regional Transit"],
    defaultBasiqL4Code: "4622",
    defaultBasiqL3Code: 462,
    defaultParentCategory: "Transport & Auto",
  },
  {
    pillId: "charity-donations",
    label: "Charity Donations",
    expenseCategories: ["Community Groups", "Religious Pledges"],
    defaultBasiqL4Code: "9559",
    defaultBasiqL3Code: 955,
    defaultParentCategory: "Gifts & Donations",
  },
  {
    pillId: "pet-insurance",
    label: "Pet Insurance",
    expenseCategories: ["Specialized Insurance", "Vet & Pet Care"],
    defaultBasiqL4Code: "6323",
    defaultBasiqL3Code: 632,
    defaultParentCategory: "Finance, Legal & Ins",
  },
  {
    pillId: "income-protection",
    label: "Income Protection",
    expenseCategories: ["Life Insurance"],
    defaultBasiqL4Code: "6310",
    defaultBasiqL3Code: 631,
    defaultParentCategory: "Finance, Legal & Ins",
  },
  {
    pillId: "childcare-fees",
    label: "Childcare Fees",
    expenseCategories: ["Childcare"],
    defaultBasiqL4Code: "8010",
    defaultBasiqL3Code: 801,
    defaultParentCategory: "Family & Children",
  },
  {
    pillId: "car-loan",
    label: "Car Loan",
    expenseCategories: ["Banking Services", "Fleet Vehicle Lease"],
    defaultBasiqL4Code: "6223",
    defaultBasiqL3Code: 622,
    defaultParentCategory: "Finance, Legal & Ins",
  },
];

/** Expense categories treated as recurring household bills for series detection. */
export const RECURRING_BILL_EXPENSE_CATEGORIES = [
  ...new Set(BILL_PILL_TAXONOMY.flatMap((pill) => pill.expenseCategories)),
] as string[];

export const INTERNET_EXPENSE_CATEGORY = "Internet";
export const INTERNET_BASIQ_L4 = "5801";
export const INTERNET_BASIQ_L3 = 580;

/** @deprecated use INTERNET_BASIQ_L3 — kept for older call sites. */
export const INTERNET_TAXONOMY_GROUP = INTERNET_BASIQ_L3;

export function expenseCategoriesForPill(pillId: string): string[] {
  return BILL_PILL_TAXONOMY.find((row) => row.pillId === pillId)?.expenseCategories ?? [];
}

export function pillForExpenseCategory(expenseCategory: string): PillTaxonomyMap | undefined {
  return BILL_PILL_TAXONOMY.find((row) =>
    row.expenseCategories.includes(expenseCategory),
  );
}

/** @deprecated prefer expenseCategoriesForPill */
export function groupCodesForPill(pillId: string): number[] {
  const pill = BILL_PILL_TAXONOMY.find((row) => row.pillId === pillId);
  return pill?.defaultBasiqL3Code != null ? [pill.defaultBasiqL3Code] : [];
}

/** @deprecated prefer pillForExpenseCategory */
export function pillForGroupCode(groupCode: number): PillTaxonomyMap | undefined {
  return BILL_PILL_TAXONOMY.find((row) => row.defaultBasiqL3Code === groupCode);
}
