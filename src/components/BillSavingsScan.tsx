import Link from "next/link";
import { CollapsibleSection } from "@/components/CollapsibleSection";

export type BillScanTone = "green" | "amber" | "red";

/**
 * Reusable “still need member input” prompt for any expense category.
 * Use whenever a bill is found but offer assessment cannot run yet.
 */
export type BillScanRequirement = {
  /** e.g. "Missing information" */
  title: string;
  /** One-line why this matters */
  description: string;
  /** Concrete fields still outstanding — shown as a checklist */
  missing: string[];
  /** CTA label on the callout */
  cta: string;
};

export type BillScanItem = {
  id: string;
  title: string;
  subtitle: string;
  amountLabel: string;
  badge: string;
  tone: BillScanTone;
  href?: string;
  requirement?: BillScanRequirement;
};

const TONE_LABEL: Record<BillScanTone, string> = {
  green: "Review completed",
  amber: "Review required",
  red: "No bill found",
};

function InternetPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M3 12h18M12 3c2.4 2.7 3.6 5.7 3.6 9s-1.2 6.3-3.6 9c-2.4-2.7-3.6-5.7-3.6-9S9.6 5.7 12 3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MobilePillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="7"
        y="2.5"
        width="10"
        height="19"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M11 18.5h2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GasPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3c2.8 3.2 5 6 5 9.2A5 5 0 0 1 7 12.2C7 9 9.2 6.2 12 3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 14.8c.6 1.2 1.6 1.8 1.8 1.8s1.2-.6 1.8-1.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ElectricityPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M13 2 5.5 13.5H12L11 22l7.5-11.5H12L13 2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HouseInsurancePillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M10 21v-6h4v6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CarInsurancePillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 15.5 6 10.2A2 2 0 0 1 7.9 9h8.2a2 2 0 0 1 1.9 1.2l1.5 5.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 15.5h17v2.2a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3V15.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="7.2" cy="18.8" r="1.1" fill="currentColor" />
      <circle cx="16.8" cy="18.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

function SubscriptionsPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="4"
        y="5"
        width="16"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8 9.5h8M8 12.5h8M8 15.5h5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MortgagePillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 10.5 12 3l9 7.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 9.8V20h13V9.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 20v-5.5h5V20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CreditCardPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="2.5"
        y="5"
        width="19"
        height="14"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M6.5 14.5h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GroceriesPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 8h15l-1.4 8.2A2 2 0 0 1 17.6 18H9.2a2 2 0 0 1-2-1.7L5.5 4H3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="20.5" r="1.1" fill="currentColor" />
      <circle cx="16.5" cy="20.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

function SchoolFeesPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 9.5 12 5l9 4.5-9 4.5L3 9.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M7 12.2v4.3c0 .8 2.2 2.5 5 2.5s5-1.7 5-2.5v-4.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M21 9.5v5.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LifeInsurancePillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20.5s-7-4.4-7-9.4A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7 3.7c0 5-7 9.4-7 9.4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CarFuelPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="4"
        y="3.5"
        width="10"
        height="17"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M14 8.5h2.2a2 2 0 0 1 2 2V16a2 2 0 0 0 2 2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 7.5h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GymPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 9.5v5M6.5 8v8M9.5 10.5v3M14.5 10.5v3M17.5 8v8M20.5 9.5v5M6.5 12h11"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WaterSewerPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5c2.6 3.4 5 6.4 5 9.4a5 5 0 0 1-10 0c0-3 2.4-6 5-9.4z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CouncilRatesPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20V9.5L12 4l8 5.5V20"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 20v-5h6v5M8 12h.01M12 12h.01M16 12h.01M8 15.5h.01M16 15.5h.01"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HealthInsurancePillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 4.5h3.2V8H14V4.5H17.2V8H21v3.2H17.2V15H14v3.2h-3.8V15H7v-3.8H3.5V8H7V4.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PublicTransportPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="5"
        y="3.5"
        width="14"
        height="14"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M5 10.5h14M9 17.5 7.5 20.5M15 17.5l1.5 3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="8.5" cy="14" r="1" fill="currentColor" />
      <circle cx="15.5" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}

function CharityDonationsPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 7.2a4 4 0 0 1 7 3.6c0 4.8-7 9.2-7 9.2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PetInsurancePillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="7.5" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16.5" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5.5" cy="12.5" r="1.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18.5" cy="12.5" r="1.4" stroke="currentColor" strokeWidth="1.5" />
      <ellipse
        cx="12"
        cy="15.5"
        rx="3.4"
        ry="2.8"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function IncomeProtectionPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5 19.5 7v5.2c0 4.4-3 7.6-7.5 9.3C7.5 19.8 4.5 16.6 4.5 12.2V7L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 12.2 11 14l3.8-3.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChildcareFeesPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="7" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M6.5 19.5v-1.2A4.5 4.5 0 0 1 11 14h2a4.5 4.5 0 0 1 4.5 4.3v1.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M4.5 11.5c1.2-1.4 2.7-2.1 4.3-2.1M19.5 11.5c-1.2-1.4-2.7-2.1-4.3-2.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CarLoanPillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 15.5 6 10.2A2 2 0 0 1 7.9 9h8.2a2 2 0 0 1 1.9 1.2l1.5 5.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 15.5h17v2.2a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3V15.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="7.2" cy="18.8" r="1.1" fill="currentColor" />
      <circle cx="16.8" cy="18.8" r="1.1" fill="currentColor" />
      <path
        d="M12 4.5v3.2M10.5 6h3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

const BILL_CATEGORY_PILLS = [
  { id: "internet", label: "Internet", Icon: InternetPillIcon },
  { id: "mobile", label: "Mobile", Icon: MobilePillIcon },
  { id: "gas", label: "Gas", Icon: GasPillIcon },
  { id: "electricity", label: "Electricity", Icon: ElectricityPillIcon },
  {
    id: "house-insurance",
    label: "House Insurance",
    Icon: HouseInsurancePillIcon,
  },
  {
    id: "car-insurance",
    label: "Car Insurance",
    Icon: CarInsurancePillIcon,
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    Icon: SubscriptionsPillIcon,
  },
  {
    id: "mortgage-payments",
    label: "Mortgage Payments",
    Icon: MortgagePillIcon,
  },
  { id: "credit-card", label: "Credit Card", Icon: CreditCardPillIcon },
  { id: "groceries", label: "Groceries", Icon: GroceriesPillIcon },
  { id: "school-fees", label: "School Fees", Icon: SchoolFeesPillIcon },
  {
    id: "life-insurance",
    label: "Life Insurance",
    Icon: LifeInsurancePillIcon,
  },
  { id: "car-fuel", label: "Car Fuel", Icon: CarFuelPillIcon },
  { id: "gym", label: "Gym", Icon: GymPillIcon },
  { id: "water-sewer", label: "Water & Sewer", Icon: WaterSewerPillIcon },
  { id: "council-rates", label: "Council Rates", Icon: CouncilRatesPillIcon },
  {
    id: "health-insurance",
    label: "Health Insurance",
    Icon: HealthInsurancePillIcon,
  },
  {
    id: "public-transport",
    label: "Public Transport",
    Icon: PublicTransportPillIcon,
  },
  {
    id: "charity-donations",
    label: "Charity Donations",
    Icon: CharityDonationsPillIcon,
  },
  { id: "pet-insurance", label: "Pet Insurance", Icon: PetInsurancePillIcon },
  {
    id: "income-protection",
    label: "Income Protection",
    Icon: IncomeProtectionPillIcon,
  },
  {
    id: "childcare-fees",
    label: "Childcare Fees",
    Icon: ChildcareFeesPillIcon,
  },
  { id: "car-loan", label: "Car Loan", Icon: CarLoanPillIcon },
];

export function BillSavingsScan({ items }: { items: BillScanItem[] }) {
  const identified = items.filter((item) => item.tone !== "red").length;

  return (
    <CollapsibleSection
      className="bill-scan"
      kicker="Bill Savings Scan"
      icon={<LiveScanIcon />}
      title="The following recurring bills have been identified in order of spend"
      headingId="bill-scan-heading"
      defaultOpen
      summary={`${identified} identified · ${BILL_CATEGORY_PILLS.length} categories`}
    >
      <p className="bill-scan-spend-lede">
        The average total spend on these bills per month is{" "}
        <span className="bill-scan-spend-tbd">TBD</span>.
      </p>

      <ul className="bill-scan-pills" aria-label="Bill categories">
        {BILL_CATEGORY_PILLS.map((pill) => (
          <li key={pill.id}>
            <span className="bill-scan-pill">
              <span className="bill-scan-pill-icon" aria-hidden="true">
                <pill.Icon />
              </span>
              {pill.label}
            </span>
          </li>
        ))}
      </ul>

      <ul className="bill-scan-list">
        {items.map((item) => {
          const body = (
            <>
              <div className="bill-scan-row-main">
                <span className="bill-scan-indicator" aria-hidden="true">
                  <span className="bill-scan-indicator-dot" />
                </span>
                <div className="bill-scan-copy">
                  <strong className="bill-scan-name">{item.title}</strong>
                  <span className="bill-scan-meta">{item.subtitle}</span>
                </div>
                <div className="bill-scan-aside">
                  <span className="bill-scan-amount">{item.amountLabel}</span>
                  <span className="bill-scan-badge">{item.badge}</span>
                </div>
              </div>

              {item.requirement ? (
                <div className="bill-scan-missing" role="status">
                  <div className="bill-scan-missing-head">
                    <span className="bill-scan-missing-icon" aria-hidden="true">
                      <AlertIcon />
                    </span>
                    <div className="bill-scan-missing-intro">
                      <strong className="bill-scan-missing-title">
                        {item.requirement.title}
                      </strong>
                      <span className="bill-scan-missing-desc">
                        {item.requirement.description}
                      </span>
                    </div>
                    <span className="bill-scan-missing-cta">
                      {item.requirement.cta}
                    </span>
                  </div>
                  {item.requirement.missing.length > 0 ? (
                    <ul className="bill-scan-missing-list">
                      {item.requirement.missing.map((field) => (
                        <li key={field} className="bill-scan-missing-item">
                          <span
                            className="bill-scan-missing-check"
                            aria-hidden="true"
                          />
                          <span>{field}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </>
          );

          const rowClass = [
            "bill-scan-row",
            `bill-scan-row--${item.tone}`,
            item.requirement ? "bill-scan-row--needs-info" : null,
            item.href ? "bill-scan-row--link" : null,
          ]
            .filter(Boolean)
            .join(" ");

          const ariaLabel = item.requirement
            ? item.requirement.missing.length > 0
              ? `${item.title}: ${item.requirement.title}. Missing: ${item.requirement.missing.join(", ")}`
              : `${item.title}: ${item.requirement.title}. ${item.requirement.description}`
            : `${item.title}: ${TONE_LABEL[item.tone]}`;

          if (item.href) {
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={rowClass}
                  aria-label={ariaLabel}
                >
                  {body}
                </Link>
              </li>
            );
          }

          return (
            <li key={item.id}>
              <div className={rowClass} aria-label={ariaLabel}>
                {body}
              </div>
            </li>
          );
        })}
      </ul>
    </CollapsibleSection>
  );
}

export function internetBillScanItem(
  bill: {
    providerName: string;
    estimatedMonthlyCostAud: number;
    status: "DETECTED" | "CONFIRMED" | "DISMISSED";
    confidence: number;
    sourceAccountName?: string | null;
    approximatePaymentDay?: number | null;
  } | null,
  options?: {
    intakeReady?: boolean;
    recommendation?: {
      outcome: "ALREADY_BEST" | "SWITCH_RECOMMENDED" | "NO_ELIGIBLE";
      savingMonthlyAud: number;
      bestProviderName: string | null;
      bestPlanName: string | null;
      reason: string | null;
    } | null;
  },
): BillScanItem {
  if (!bill) {
    return {
      id: "internet",
      title: "Internet",
      subtitle: "No recurring ISP payment detected yet",
      amountLabel: "—",
      badge: "No bill found",
      tone: "red",
      href: "/app/internet-savings",
    };
  }

  const amount = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(bill.estimatedMonthlyCostAud);

  const intakeReady = Boolean(options?.intakeReady);
  const recommendation = options?.recommendation ?? null;
  const subtitleParts = [bill.providerName];
  if (bill.sourceAccountName) {
    subtitleParts.push(`from ${bill.sourceAccountName}`);
  }
  if (bill.approximatePaymentDay != null) {
    const day = bill.approximatePaymentDay;
    const mod100 = day % 100;
    const ordinal =
      mod100 >= 11 && mod100 <= 13
        ? `${day}th`
        : day % 10 === 1
          ? `${day}st`
          : day % 10 === 2
            ? `${day}nd`
            : day % 10 === 3
              ? `${day}rd`
              : `${day}th`;
    subtitleParts.push(`around the ${ordinal} day of each month`);
  }
  const subtitle = subtitleParts.join(" · ");

  if (recommendation?.outcome === "ALREADY_BEST") {
    return {
      id: "internet",
      title: "Internet",
      subtitle,
      amountLabel: amount,
      badge: "Best deal",
      tone: "green",
      href: "/app/internet-savings",
    };
  }

  if (recommendation?.outcome === "SWITCH_RECOMMENDED") {
    const saving = new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(recommendation.savingMonthlyAud);
    return {
      id: "internet",
      title: "Internet",
      subtitle:
        recommendation.bestProviderName && recommendation.bestPlanName
          ? `${recommendation.bestProviderName} · save ~${saving}/mo`
          : subtitle,
      amountLabel: amount,
      badge: "Switch recommended",
      tone: "amber",
      href: "/app/internet-savings",
      requirement: {
        title: "Bill switch recommended",
        description:
          recommendation.reason ??
          "A lower-cost plan looks available for your address.",
        missing: [],
        cta: "Review better deal",
      },
    };
  }

  if (recommendation?.outcome === "NO_ELIGIBLE" && intakeReady) {
    return {
      id: "internet",
      title: "Internet",
      subtitle,
      amountLabel: amount,
      badge: "No match yet",
      tone: "amber",
      href: "/app/internet-savings",
    };
  }

  if (intakeReady) {
    return {
      id: "internet",
      title: "Internet",
      subtitle,
      amountLabel: amount,
      badge: "Ready to compare",
      tone: "green",
      href: "/app/internet-savings",
    };
  }

  return {
    id: "internet",
    title: "Internet",
    subtitle,
    amountLabel: amount,
    badge: "Info needed",
    tone: "amber",
    href: "/app/internet-savings",
    requirement: {
      title: "Missing information",
      description:
        "Additional details are required to assess the best offer.",
      missing: ["Service address", "How you use the internet"],
      cta: "Provide details",
    },
  };
}

export function pendingExpenseScanItems(): BillScanItem[] {
  return [
    {
      id: "car-insurance",
      title: "Car Insurance",
      subtitle: "Scanning linked accounts soon",
      amountLabel: "—",
      badge: "No bill found",
      tone: "red",
    },
    {
      id: "mortgage",
      title: "Mortgage Payments",
      subtitle: "Scanning linked accounts soon",
      amountLabel: "—",
      badge: "No bill found",
      tone: "red",
    },
    {
      id: "phone",
      title: "Phone Bills",
      subtitle: "Scanning linked accounts soon",
      amountLabel: "—",
      badge: "No bill found",
      tone: "red",
    },
  ];
}

function AlertIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 3.5 21 20H3L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 10v4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.2" r="1" fill="currentColor" />
    </svg>
  );
}

function LiveScanIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M22 12h-4l-3 9L9 3l-3 9H2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
