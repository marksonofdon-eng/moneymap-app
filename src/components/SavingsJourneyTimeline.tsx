import type { ReactNode } from "react";
import { CollapsibleSection } from "@/components/CollapsibleSection";

type JourneyStepStatus = "complete" | "current" | "upcoming";

export type SavingsJourneyStep = {
  id: string;
  title: string;
  detail: string;
  status: JourneyStepStatus;
};

type SavingsJourneyTimelineProps = {
  hasAccounts: boolean;
  hasDetectedBill: boolean;
  billConfirmed: boolean;
  intakeReady: boolean;
  recommendationDone?: boolean;
  accountCount?: number;
  txCount?: number;
  billCount?: number;
  actions?: ReactNode;
};

export function buildSavingsJourneySteps({
  hasAccounts,
  hasDetectedBill,
  billConfirmed,
  intakeReady,
  recommendationDone = false,
  accountCount = 0,
  txCount = 0,
  billCount = 0,
}: SavingsJourneyTimelineProps): SavingsJourneyStep[] {
  const done = [
    hasAccounts,
    hasDetectedBill,
    Boolean(intakeReady || billConfirmed),
    recommendationDone,
  ];

  const currentIndex = done.findIndex((isDone) => !isDone);
  const activeIndex = currentIndex === -1 ? done.length - 1 : currentIndex;

  const defs = [
    {
      id: "link",
      title: `${accountCount} Account${accountCount === 1 ? "" : "s"} Linked`,
      detail: `${txCount.toLocaleString("en-AU")} transaction${txCount === 1 ? "" : "s"} via Open Banking`,
    },
    {
      id: "identify",
      title: `${billCount} Bill${billCount === 1 ? "" : "s"} detected`,
      detail: "Identify recurring expenses",
    },
    {
      id: "savings",
      title: "Find Savings Today",
      detail: recommendationDone
        ? "Savings check complete"
        : "Scan for lower-cost bills",
    },
    {
      id: "monitor",
      title: "Ongoing monitoring",
      detail: "Keep watching for better deals",
    },
  ];

  return defs.map((step, index) => ({
    ...step,
    status: done[index]
      ? "complete"
      : index === activeIndex
        ? "current"
        : "upcoming",
  }));
}

export function SavingsJourneyTimeline(props: SavingsJourneyTimelineProps) {
  const { actions } = props;
  const steps = buildSavingsJourneySteps(props);
  const completedCount = steps.filter((s) => s.status === "complete").length;
  const currentStep = steps.find((s) => s.status === "current");
  const progress = Math.max(
    0,
    Math.min(100, (completedCount / Math.max(steps.length - 1, 1)) * 100),
  );

  const stepSummary = currentStep
    ? `Step ${steps.indexOf(currentStep) + 1} · ${currentStep.title}`
    : `${completedCount} of ${steps.length} complete`;

  return (
    <CollapsibleSection
      className="journey-timeline"
      kicker="Your savings path"
      icon={<DollarIcon />}
      title="From linked accounts to ongoing savings"
      headingId="journey-timeline-heading"
      defaultOpen
      summary={stepSummary}
    >
      {actions ? (
        <div className="journey-timeline-toolbar">
          <div className="journey-timeline-actions">{actions}</div>
        </div>
      ) : null}
      <div className="journey-timeline-track">
        <div className="journey-timeline-rail" aria-hidden="true">
          <span
            className="journey-timeline-rail-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol className="journey-timeline-steps">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className={`journey-step journey-step--${step.status}`}
            >
              <div className="journey-step-node">
                <span className="journey-step-icon" aria-hidden="true">
                  {step.status === "complete" ? (
                    <CheckIcon />
                  ) : (
                    <StepGlyph index={index} />
                  )}
                </span>
                <span className="journey-step-num">{index + 1}</span>
              </div>
              <div className="journey-step-copy">
                <strong className="journey-step-title">{step.title}</strong>
                <span className="journey-step-detail">{step.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </CollapsibleSection>
  );
}

function StepGlyph({ index }: { index: number }) {
  switch (index) {
    case 0:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 1:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle
            cx="11"
            cy="11"
            r="7"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M21 21l-4.3-4.3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 2:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 19V5M12 5l-5 5M12 5l5 5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 19h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 22c4-4 8-7.5 8-12a8 8 0 1 0-16 0c0 4.5 4 8 8 12Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
  }
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DollarIcon() {
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
        d="M12 2v20M16.5 6.5c-.8-1.2-2.1-2-4.5-2s-3.7.9-3.7 2.6c0 3.6 8.2 1.8 8.2 6.4 0 2-1.8 3.5-4.5 3.5S8 15.3 7.2 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
