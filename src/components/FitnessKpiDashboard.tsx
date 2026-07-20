"use client";

import { useId, useMemo } from "react";

const MEMBER_AGE = 50;

/** Illustrative member snapshot at age 50. */
export const DEMO_PROFILE = {
  safetyBufferMonths: 4.5,
  /** Typical monthly living costs used to translate buffer months into dollars. */
  monthlyLivingCosts: 6_800,
  savingsRatePct: 18,
  netWorth: 420_000,
  debtDragPct: 9,
  retirementClockAge: 64,
} as const;

type StatusTone = "critical" | "warn" | "ok" | "strong";
type FitnessGrade = "A" | "B" | "C";

type KpiCardModel = {
  id: string;
  name: string;
  definition: string;
  value: string;
  target: string;
  statusLabel: string;
  tone: StatusTone;
  meter: number;
};

type WealthMedianBand = {
  minAge: number;
  maxAge: number;
  median: number;
};

const WEALTH_MEDIANS: WealthMedianBand[] = [
  { minAge: 25, maxAge: 29, median: 58_000 },
  { minAge: 30, maxAge: 34, median: 135_000 },
  { minAge: 35, maxAge: 39, median: 250_000 },
  { minAge: 40, maxAge: 44, median: 380_000 },
  { minAge: 45, maxAge: 49, median: 480_000 },
  { minAge: 50, maxAge: 54, median: 580_000 },
  { minAge: 55, maxAge: 59, median: 650_000 },
  { minAge: 60, maxAge: 64, median: 720_000 },
  { minAge: 65, maxAge: 99, median: 720_000 },
];

const TONE_SCORE: Record<StatusTone, number> = {
  critical: 0,
  warn: 1,
  ok: 2,
  strong: 3,
};

function formatMonths(months: number): string {
  const rounded = Math.round(months * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}

function ordinalPercentile(n: number): string {
  const v = Math.round(n);
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}

function wealthMedianForAge(age: number): number {
  const band = WEALTH_MEDIANS.find((b) => age >= b.minAge && age <= b.maxAge);
  return band?.median ?? WEALTH_MEDIANS[WEALTH_MEDIANS.length - 1].median;
}

function wealthPercentile(netWorth: number, age: number): number {
  const median = wealthMedianForAge(age);
  const ratio = netWorth / Math.max(median, 1);
  if (ratio <= 0.5) return Math.max(5, 10 + (ratio / 0.5) * 15);
  if (ratio <= 1) return 25 + ((ratio - 0.5) / 0.5) * 25;
  if (ratio <= 1.5) return 50 + ((ratio - 1) / 0.5) * 25;
  if (ratio <= 2.5) return 75 + ((ratio - 1.5) / 1) * 15;
  return Math.min(97, 90 + (ratio - 2.5) * 3);
}

export function safetyBufferTargetMonths(age: number): number {
  if (age < 35) return 3;
  if (age <= 55) return 6;
  return 12;
}

function safetyBufferStatus(
  months: number,
  targetMonths: number,
): { label: string; tone: StatusTone } {
  if (months < 1) return { label: "Critical", tone: "critical" };
  if (months < targetMonths) return { label: "Below target", tone: "critical" };
  if (months > 12) return { label: "Over-buffered", tone: "strong" };
  return { label: "Optimal", tone: "ok" };
}

function savingsRateTarget(age: number): string {
  if (age < 30) return "10% to 15%";
  if (age <= 50) return "20% to 30%";
  return "35%+";
}

function savingsRateTargetTop(age: number): number {
  if (age < 30) return 15;
  if (age <= 50) return 30;
  return 35;
}

function savingsRateStatus(rate: number): { label: string; tone: StatusTone } {
  if (rate < 5) return { label: "Stagnant", tone: "critical" };
  if (rate <= 15) return { label: "Building", tone: "warn" };
  if (rate <= 25) return { label: "Strong", tone: "ok" };
  return { label: "Elite", tone: "strong" };
}

function wealthRankStatus(percentile: number): { label: string; tone: StatusTone } {
  if (percentile < 25) return { label: "Lagging", tone: "critical" };
  if (percentile <= 50) return { label: "On the pace", tone: "warn" };
  if (percentile <= 75) return { label: "Above avg", tone: "ok" };
  return { label: "Leaderboard", tone: "strong" };
}

function debtDragTarget(age: number): string {
  if (age < 35) return "< 15%";
  if (age <= 50) return "< 10%";
  return "0%";
}

function debtDragTargetMax(age: number): number {
  if (age < 35) return 15;
  if (age <= 50) return 10;
  return 1;
}

function debtDragStatus(drag: number): { label: string; tone: StatusTone } {
  if (drag <= 0) return { label: "Debt-free", tone: "strong" };
  if (drag < 15) return { label: "Light", tone: "ok" };
  if (drag <= 30) return { label: "Warning", tone: "warn" };
  return { label: "Heavy", tone: "critical" };
}

function retirementClockStatus(
  clockAge: number,
): { label: string; tone: StatusTone } {
  if (clockAge > 67) return { label: "Behind pace", tone: "critical" };
  if (clockAge >= 60) return { label: "On track", tone: "ok" };
  return { label: "Early freedom", tone: "strong" };
}

function simpleStatus(tone: StatusTone): string {
  switch (tone) {
    case "critical":
      return "Needs work";
    case "warn":
      return "Getting there";
    case "ok":
      return "On track";
    case "strong":
      return "Looking good";
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function buildKpis(age: number): KpiCardModel[] {
  const safetyTarget = safetyBufferTargetMonths(age);
  const safetyMonths = DEMO_PROFILE.safetyBufferMonths;
  const safetyTone = safetyBufferStatus(safetyMonths, safetyTarget).tone;
  const savingsTone = savingsRateStatus(DEMO_PROFILE.savingsRatePct).tone;
  const percentile = wealthPercentile(DEMO_PROFILE.netWorth, age);
  const wealthTone = wealthRankStatus(percentile).tone;
  const debtTone = debtDragStatus(DEMO_PROFILE.debtDragPct).tone;
  const clockTone = retirementClockStatus(
    DEMO_PROFILE.retirementClockAge,
  ).tone;
  const debtCap = debtDragTargetMax(age);

  return [
    {
      id: "safety-buffer",
      name: "Emergency cash",
      definition: "",
      value: `${formatMonths(safetyMonths)}`,
      target: `Goal ${safetyTarget} months`,
      statusLabel: simpleStatus(safetyTone),
      tone: safetyTone,
      meter: clamp01(safetyMonths / safetyTarget),
    },
    {
      id: "savings-rate",
      name: "Saving each month",
      definition: "",
      value: formatPct(DEMO_PROFILE.savingsRatePct),
      target: `Goal ${savingsRateTarget(age)}`,
      statusLabel: simpleStatus(savingsTone),
      tone: savingsTone,
      meter: clamp01(
        DEMO_PROFILE.savingsRatePct / savingsRateTargetTop(age),
      ),
    },
    {
      id: "wealth-rank",
      name: "Wealth vs others",
      definition: "",
      value: ordinalPercentile(percentile),
      target: "Goal: above average",
      statusLabel: simpleStatus(wealthTone),
      tone: wealthTone,
      meter: clamp01(percentile / 100),
    },
    {
      id: "debt-drag",
      name: "Other debts",
      definition: "",
      value: formatPct(DEMO_PROFILE.debtDragPct),
      target: `Goal ${debtDragTarget(age)}`,
      statusLabel: simpleStatus(debtTone),
      tone: debtTone,
      meter: clamp01(1 - DEMO_PROFILE.debtDragPct / Math.max(debtCap * 2, 1)),
    },
    {
      id: "retirement-clock",
      name: "Can retire at",
      definition: "",
      value: `${DEMO_PROFILE.retirementClockAge}`,
      target: "Goal: by 67",
      statusLabel: simpleStatus(clockTone),
      tone: clockTone,
      meter: clamp01((75 - DEMO_PROFILE.retirementClockAge) / (75 - 55)),
    },
  ];
}

function gradeFromKpis(kpis: KpiCardModel[]): FitnessGrade {
  const avg =
    kpis.reduce((sum, kpi) => sum + TONE_SCORE[kpi.tone], 0) / kpis.length;
  if (avg >= 2.4) return "A";
  if (avg >= 1.6) return "B";
  return "C";
}

export function fitnessGradeForDemo(): FitnessGrade {
  return gradeFromKpis(buildKpis(MEMBER_AGE));
}

type FitnessKpiDashboardProps = {
  memberName?: string;
  age?: number;
  ownsHome?: boolean;
  hasDependents?: boolean;
  employed?: boolean;
};

export function FitnessKpiDashboard({
  memberName = "Mark",
  age = MEMBER_AGE,
  ownsHome = true,
  hasDependents = false,
  employed = true,
}: FitnessKpiDashboardProps) {
  const reactId = useId();
  const kpis = useMemo(() => buildKpis(age), [age]);
  const grade = useMemo(() => gradeFromKpis(kpis), [kpis]);

  const profilePills = useMemo(() => {
    const pills: string[] = [`${age} years old`];
    pills.push(ownsHome ? "Homeowner" : "Renting");
    pills.push(hasDependents ? "Has dependents" : "No dependents");
    pills.push(employed ? "Employed" : "Not employed");
    return pills;
  }, [age, ownsHome, hasDependents, employed]);

  return (
    <>
    <section
      className={`fitness-kpi fitness-kpi--grade-${grade.toLowerCase()}`}
      aria-labelledby={`${reactId}-heading`}
    >
      <header className="fitness-kpi-banner">
        <div className="fitness-kpi-banner-copy">
          <h3 id={`${reactId}-heading`} className="fitness-kpi-heading">
            {memberName}&apos;s Financial Fitness Dashboard{" "}
            <span className="fitness-kpi-coming-soon">[example only]</span>
          </h3>
          <div className="fitness-kpi-profile">
            <h4 className="fitness-kpi-profile-heading">
              Your personal profile
            </h4>
            <ul className="fitness-kpi-profile-pills" aria-label="Profile details">
              {profilePills.map((pill) => (
                <li key={pill} className="fitness-kpi-profile-pill">
                  <svg
                    className="fitness-kpi-profile-tick"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M2.5 6.2L4.8 8.5L9.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>{pill}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div
          className={`fitness-kpi-grade fitness-kpi-grade--${grade.toLowerCase()}`}
          aria-label={`Current score ${grade}`}
        >
          <span className="fitness-kpi-grade-label">Score</span>
          <strong className="fitness-kpi-grade-value">{grade}</strong>
        </div>
      </header>

      <ul className="fitness-kpi-grid">
        {kpis.map((kpi) => (
          <li
            key={kpi.id}
            className={`fitness-kpi-cell fitness-kpi-cell--${kpi.tone}`}
          >
            <span className="fitness-kpi-name">{kpi.name}</span>
            <p className="fitness-kpi-value">
              {kpi.value}
              {kpi.id === "safety-buffer" ? (
                <span className="fitness-kpi-value-unit">months</span>
              ) : null}
              {kpi.id === "retirement-clock" ? (
                <span className="fitness-kpi-value-unit">years old</span>
              ) : null}
            </p>
            <div
              className="fitness-kpi-meter"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(kpi.meter * 100)}
              aria-label={`${kpi.name} progress`}
            >
              <span
                className="fitness-kpi-meter-fill"
                style={{ width: `${Math.round(kpi.meter * 100)}%` }}
              />
            </div>
            <p className="fitness-kpi-simple-foot">
              <span
                className={`fitness-kpi-status fitness-kpi-status--${kpi.tone}`}
              >
                {kpi.statusLabel}
              </span>
              <span className="fitness-kpi-target">{kpi.target}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>

      <div className="fitness-kpi-assumptions">
        <h4 className="fitness-kpi-assumptions-heading">
          Dashboard Goal Assumptions
        </h4>
        <ul className="fitness-kpi-assumptions-list">
          <li>
            <strong>Emergency cash — 6 months:</strong> For ages 35–55, a
            six-month cash buffer is the recommended mid-career standard
            (aligned with ASIC MoneySmart guidance of three to six months’
            expenses, with six months preferred when mortgages and dependents
            raise household risk).
          </li>
          <li>
            <strong>Saving each month — 20% to 30%:</strong> In peak earning
            years (roughly ages 30–50), directing about one-fifth to one-third
            of income into savings and investments is a widely used planning
            benchmark among Australian financial advisers to build compounding
            wealth before retirement.
          </li>
          <li>
            <strong>Wealth vs others — above average:</strong> Targets are set
            against Australian Bureau of Statistics (ABS) and HILDA Survey
            median net-worth bands by age, so “on track” means at or above the
            typical Australian household in your age group.
          </li>
          <li>
            <strong>Other debts — under 10%:</strong> For ages 35–50,
            non-mortgage debt repayments (cards, car loans, HECS and similar)
            should stay below about 10% of gross income — a cash-flow
            discipline target used to limit lifestyle debt while the primary
            mortgage is still being serviced.
          </li>
          <li>
            <strong>Can retire at — by age 67:</strong> Age 67 is the current
            Age Pension eligibility age set by the Australian Government. The
            dashboard treats a funded retirement at or before that age as the
            baseline milestone; earlier is stronger, later is behind that
            national reference point.
          </li>
        </ul>
      </div>
    </>
  );
}
