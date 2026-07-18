import Link from "next/link";
import { CollapsibleSection } from "@/components/CollapsibleSection";

export type BillScanTone = "green" | "amber" | "red";

export type BillScanItem = {
  id: string;
  title: string;
  subtitle: string;
  amountLabel: string;
  badge: string;
  tone: BillScanTone;
  href?: string;
};

const TONE_LABEL: Record<BillScanTone, string> = {
  green: "Review completed",
  amber: "Review required",
  red: "No bill found",
};

export function BillSavingsScan({ items }: { items: BillScanItem[] }) {
  const needsInfo = items.filter((item) => item.tone === "amber").length;
  const readyForReview = items.filter((item) => item.tone === "green").length;
  const notFound = items.filter((item) => item.tone === "red").length;

  return (
    <CollapsibleSection
      className="bill-scan"
      kicker="Bill Savings Scan"
      icon={<LiveScanIcon />}
      title="The following recurring bills have been identified"
      headingId="bill-scan-heading"
      defaultOpen
      summary={`${needsInfo} need info · ${readyForReview} ready · ${notFound} not found`}
    >
      <p className="bill-scan-lede">To find the savings:</p>
      <ul className="bill-scan-summary">
        <li className="bill-scan-summary-item bill-scan-summary-item--amber">
          <span className="bill-scan-summary-icon" aria-hidden="true" />
          <span>
            <strong>{needsInfo}</strong>{" "}
            {needsInfo === 1
              ? "requires more information"
              : "require more information"}
          </span>
        </li>
        <li className="bill-scan-summary-item bill-scan-summary-item--green">
          <span className="bill-scan-summary-icon" aria-hidden="true" />
          <span>
            <strong>{readyForReview}</strong>{" "}
            {readyForReview === 1
              ? "is ready for bill saving review"
              : "are ready for bill saving review"}
          </span>
        </li>
        <li className="bill-scan-summary-item bill-scan-summary-item--red">
          <span className="bill-scan-summary-icon" aria-hidden="true" />
          <span>
            <strong>{notFound}</strong> we cannot find
          </span>
        </li>
      </ul>

      <ul className="bill-scan-list">
        {items.map((item) => {
          const body = (
            <>
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
            </>
          );

          if (item.href) {
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`bill-scan-row bill-scan-row--${item.tone} bill-scan-row--link`}
                  aria-label={`${item.title}: ${TONE_LABEL[item.tone]}`}
                >
                  {body}
                </Link>
              </li>
            );
          }

          return (
            <li key={item.id}>
              <div
                className={`bill-scan-row bill-scan-row--${item.tone}`}
                aria-label={`${item.title}: ${TONE_LABEL[item.tone]}`}
              >
                {body}
              </div>
            </li>
          );
        })}
      </ul>
    </CollapsibleSection>
  );
}

export function internetBillScanItem(bill: {
  providerName: string;
  estimatedMonthlyCostAud: number;
  status: "DETECTED" | "CONFIRMED" | "DISMISSED";
  confidence: number;
} | null): BillScanItem {
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

  if (bill.status === "CONFIRMED") {
    return {
      id: "internet",
      title: "Internet",
      subtitle: `${bill.providerName} · ${bill.confidence}% confidence`,
      amountLabel: amount,
      badge: "Review completed",
      tone: "green",
      href: "/app/internet-savings",
    };
  }

  return {
    id: "internet",
    title: "Internet",
    subtitle: `${bill.providerName} · ${bill.confidence}% confidence`,
    amountLabel: amount,
    badge: "Review required",
    tone: "amber",
    href: "/app/internet-savings",
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
