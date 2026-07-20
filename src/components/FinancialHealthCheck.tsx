"use client";

import { useId, useMemo, useState, type CSSProperties } from "react";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { FitnessKpiDashboard } from "@/components/FitnessKpiDashboard";
import { SafetyBufferChart } from "@/components/SafetyBufferChart";

type FinancialHealthCheckProps = {
  memberName?: string;
};

export function FinancialHealthCheck({
  memberName = "Mark",
}: FinancialHealthCheckProps) {
  return (
    <CollapsibleSection
      className="health-check"
      kicker="Financial Fitness Dashboard [Coming Soon]"
      icon={<PulseHeartIcon />}
      title="Review your financial fitness score"
      headingId="financial-health-heading"
      defaultOpen={false}
    >
      <div className="health-check-body">
        <p className="health-check-preview-note">
          This service is in development and will be available soon. For the
          moment, below is an example of our upcoming functionality.
        </p>

        <FitnessKpiDashboard memberName={memberName} age={50} ownsHome />

        <SafetyBufferChart age={50} />

        <WealthOverAgeChart />
      </div>
    </CollapsibleSection>
  );
}

const AGE_MIN = 20;
const AGE_MAX = 99;
const TODAY_AGE = 50;
const RETIRE_SLIDER_MIN = 40;
const RETIRE_SLIDER_MAX = 75;
const RETIRE_DEFAULT = 71;
const WIDTH = 640;
const HEIGHT = 300;
const PAD = { top: 36, right: 28, bottom: 48, left: 62 };
/** Chart scale ceiling for a single homeowner comfortable retirement. */
const Y_MAX = 800_000;

/**
 * Industry-style savings required at retirement for a single retiree
 * who owns their home (comfortable lifestyle, ASFA-informed).
 * Delaying retirement shortens the years to fund → lower nest egg.
 */
const INDUSTRY_MARKERS = [
  { age: 65, savingsRequired: 695_000 },
  { age: 70, savingsRequired: 560_000 },
  { age: 75, savingsRequired: 430_000 },
] as const;

function formatSavings(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  return `$${Math.round(amount / 1000)}k`;
}

/** Interpolate / extrapolate savings required from the 65/70/75 markers. */
function savingsRequiredAtRetirement(retireAge: number): number {
  const markers = INDUSTRY_MARKERS;
  if (retireAge <= markers[0].age) {
    const yearsExtra = markers[0].age - retireAge;
    // ~$14k more per year of earlier retirement (more years to fund).
    return markers[0].savingsRequired + yearsExtra * 14_000;
  }
  for (let i = 0; i < markers.length - 1; i++) {
    const a = markers[i];
    const b = markers[i + 1];
    if (retireAge <= b.age) {
      const t = (retireAge - a.age) / (b.age - a.age);
      return a.savingsRequired + t * (b.savingsRequired - a.savingsRequired);
    }
  }
  const last = markers[markers.length - 1];
  const yearsLater = retireAge - last.age;
  return Math.max(180_000, last.savingsRequired - yearsLater * 12_000);
}

/** Post-retirement drawdown progress 0→1 from retirement age to chart end. */
function retirementDrawdownT(age: number, retirementAge: number): number {
  return (age - retirementAge) / Math.max(AGE_MAX - retirementAge, 1);
}

/**
 * Absolute $ drawn from the nest egg by `age`, matching the on-track spend curve.
 * On-track depletes the required nest egg to ~0 by age 99; a smaller actual
 * nest egg hits zero earlier under the same spending rate.
 */
function drawdownAmountByAge(age: number, retirementAge: number): number {
  if (age <= retirementAge) return 0;
  const target = savingsRequiredAtRetirement(retirementAge);
  const t = retirementDrawdownT(age, retirementAge);
  return target * Math.pow(t, 1.1);
}

function onTrackSavingsAtAge(age: number, retirementAge: number): number {
  const target = savingsRequiredAtRetirement(retirementAge);
  if (age <= AGE_MIN) return target * 0.03;
  if (age <= retirementAge) {
    const t = (age - AGE_MIN) / Math.max(retirementAge - AGE_MIN, 1);
    return target * (0.03 + Math.pow(t, 1.45) * 0.97);
  }
  return Math.max(0, target - drawdownAmountByAge(age, retirementAge));
}

/**
 * Accumulation only — fixed trajectory that does not move with the slider.
 * Calibrated to meet the industry nest egg around age 71.
 */
function actualAccumulationAtAge(age: number): number {
  const meetAge = 71;
  const meetAmount = savingsRequiredAtRetirement(meetAge);
  const startAmount = 38_000;

  if (age <= AGE_MIN) return startAmount;
  if (age <= meetAge) {
    const t = (age - AGE_MIN) / (meetAge - AGE_MIN);
    return startAmount + Math.pow(t, 1.75) * (meetAmount - startAmount);
  }
  // Continues rising slowly after 71 (ongoing contributions / growth).
  const t = (age - meetAge) / (AGE_MAX - meetAge);
  return meetAmount + Math.pow(t, 0.85) * 95_000;
}

/**
 * Actual savings: fixed accumulation until preferred retirement age, then
 * the same absolute drawdown rate as the on-track path (clamped at $0).
 */
function actualSavingsAtAge(age: number, retirementAge: number): number {
  if (age <= retirementAge) return actualAccumulationAtAge(age);
  const nestEgg = actualAccumulationAtAge(retirementAge);
  return Math.max(0, nestEgg - drawdownAmountByAge(age, retirementAge));
}

/** First age where actual savings hit zero after retirement, if any. */
function actualDepletionAge(retirementAge: number): number | null {
  for (let age = retirementAge; age <= AGE_MAX; age += 1) {
    if (actualSavingsAtAge(age, retirementAge) <= 0) return age;
  }
  return null;
}

/**
 * Earliest age where actual accumulated savings meet the industry nest egg
 * required for retiring at that age — the realistic expected retirement age.
 */
function expectedRetirementAgeFromTrajectory(): number {
  for (let age = RETIRE_SLIDER_MIN; age <= RETIRE_SLIDER_MAX; age += 1) {
    if (
      actualAccumulationAtAge(age) >=
      savingsRequiredAtRetirement(age) - 1_000
    ) {
      return age;
    }
  }
  return RETIRE_SLIDER_MAX;
}

function ageToX(age: number, innerW: number): number {
  return PAD.left + ((age - AGE_MIN) / (AGE_MAX - AGE_MIN)) * innerW;
}

function amountToY(amount: number, innerH: number): number {
  const t = Math.min(Math.max(amount / Y_MAX, 0), 1);
  return PAD.top + (1 - t) * innerH;
}

function buildPath(
  fromAge: number,
  toAge: number,
  amountFn: (age: number) => number,
  innerW: number,
  innerH: number,
): string {
  const points: string[] = [];
  for (let age = fromAge; age <= toAge; age += 1) {
    const x = ageToX(age, innerW);
    const y = amountToY(amountFn(age), innerH);
    points.push(
      `${age === fromAge ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`,
    );
  }
  return points.join(" ");
}

function buildOnTrackArea(
  retirementAge: number,
  innerW: number,
  innerH: number,
): string {
  const baseY = PAD.top + innerH;
  const startX = PAD.left;
  const endX = PAD.left + innerW;
  const curve = buildPath(
    AGE_MIN,
    AGE_MAX,
    (age) => onTrackSavingsAtAge(age, retirementAge),
    innerW,
    innerH,
  );
  return `${curve} L${endX.toFixed(2)},${baseY} L${startX},${baseY} Z`;
}

function WealthOverAgeChart() {
  const reactId = useId();
  const [retirementAge, setRetirementAge] = useState(RETIRE_DEFAULT);
  const gradId = `${reactId}-wealth-fill`;
  const lineGradId = `${reactId}-wealth-stroke`;
  const glowId = `${reactId}-wealth-glow`;
  const sliderId = `${reactId}-retire-slider`;

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const requiredAtPreferred = savingsRequiredAtRetirement(retirementAge);

  const onTrackPath = useMemo(
    () =>
      buildPath(
        AGE_MIN,
        AGE_MAX,
        (age) => onTrackSavingsAtAge(age, retirementAge),
        innerW,
        innerH,
      ),
    [retirementAge, innerW, innerH],
  );
  const onTrackArea = useMemo(
    () => buildOnTrackArea(retirementAge, innerW, innerH),
    [retirementAge, innerW, innerH],
  );
  const actualPastPath = useMemo(
    () =>
      buildPath(
        AGE_MIN,
        TODAY_AGE,
        (age) => actualSavingsAtAge(age, retirementAge),
        innerW,
        innerH,
      ),
    [retirementAge, innerW, innerH],
  );
  const actualFuturePath = useMemo(
    () =>
      buildPath(
        TODAY_AGE,
        AGE_MAX,
        (age) => actualSavingsAtAge(age, retirementAge),
        innerW,
        innerH,
      ),
    [retirementAge, innerW, innerH],
  );

  const retirementX = ageToX(retirementAge, innerW);
  const peakY = amountToY(requiredAtPreferred, innerH);
  const todayX = ageToX(TODAY_AGE, innerW);
  const todayY = amountToY(
    actualSavingsAtAge(TODAY_AGE, retirementAge),
    innerH,
  );
  const actualAtRetirement = actualSavingsAtAge(retirementAge, retirementAge);
  const hasShortfall = actualAtRetirement < requiredAtPreferred - 1_000;
  const depletionAge = actualDepletionAge(retirementAge);
  const depletedX =
    depletionAge != null ? ageToX(depletionAge, innerW) : null;
  const zeroY = amountToY(0, innerH);

  const expectedRetirementAge = useMemo(
    () => expectedRetirementAgeFromTrajectory(),
    [],
  );
  const expectedNestEgg = actualAccumulationAtAge(expectedRetirementAge);
  const yearsEarly = Math.max(0, expectedRetirementAge - retirementAge);
  const sectionTone = hasShortfall || yearsEarly > 0 ? "shortfall" : "ok";
  const sliderProgress =
    (retirementAge - RETIRE_SLIDER_MIN) /
    (RETIRE_SLIDER_MAX - RETIRE_SLIDER_MIN);

  const labelOffsetX =
    retirementAge <= 48 ? 10 : retirementAge >= 72 ? -10 : 0;

  const ageTicks = [20, 35, 50, 65, 80, 99];
  const savingsTicks = [
    { label: "$0", amount: 0 },
    { label: "$200k", amount: 200_000 },
    { label: "$400k", amount: 400_000 },
    { label: "$600k", amount: 600_000 },
    { label: "$800k", amount: 800_000 },
  ];
  return (
    <section
      className={`safety-buffer retirement-clock safety-buffer--${sectionTone}`}
      aria-labelledby={`${reactId}-retire-heading`}
    >
      <header className="safety-buffer-header">
        <div>
          <h3
            id={`${reactId}-retire-heading`}
            className="safety-buffer-heading"
          >
            Retirement Clock — What age do you want to retire?
          </h3>
          <p className="safety-buffer-lede">
            Your retirement clock is the age when savings can fund your
            lifestyle for life. Choosing an earlier target is ambitious — but
            only sustainable if your trajectory can support it.
          </p>
        </div>
        <div className="safety-buffer-stats">
          <div className="safety-buffer-stat safety-buffer-stat--current">
            <span className="safety-buffer-stat-label">Target</span>
            <strong className="safety-buffer-stat-value">
              {retirementAge}
              <span>years</span>
            </strong>
          </div>
          <div className="safety-buffer-stat safety-buffer-stat--gap">
            <span className="safety-buffer-stat-label">Gap</span>
            <strong className="safety-buffer-stat-value">
              {hasShortfall
                ? formatSavings(requiredAtPreferred - actualAtRetirement)
                : yearsEarly > 0
                  ? yearsEarly
                  : "0"}
              <span>{hasShortfall ? "behind" : "years"}</span>
            </strong>
          </div>
          <div className="safety-buffer-stat safety-buffer-stat--target">
            <span className="safety-buffer-stat-label">Expected</span>
            <strong className="safety-buffer-stat-value">
              {expectedRetirementAge}
              <span>years</span>
            </strong>
          </div>
        </div>
      </header>

      <div className="retirement-clock-adjust">
        <label className="retirement-clock-adjust-label" htmlFor={sliderId}>
          Adjust target retirement age
        </label>
        <div
          className="wealth-chart-slider-wrap"
          style={
            {
              "--slider-progress": sliderProgress,
            } as CSSProperties
          }
        >
          <input
            id={sliderId}
            className="wealth-chart-slider"
            type="range"
            min={RETIRE_SLIDER_MIN}
            max={RETIRE_SLIDER_MAX}
            step={1}
            value={retirementAge}
            aria-valuemin={RETIRE_SLIDER_MIN}
            aria-valuemax={RETIRE_SLIDER_MAX}
            aria-valuenow={retirementAge}
            aria-valuetext={`${retirementAge} years old`}
            onChange={(event) =>
              setRetirementAge(Number(event.target.value))
            }
          />
          <span className="wealth-chart-slider-pulse" aria-hidden="true" />
        </div>
      </div>

      <div className="safety-buffer-frame">
        <svg
          className="wealth-chart-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Retirement clock chart. Target age ${retirementAge} requires about ${formatSavings(requiredAtPreferred)}. Expected retirement age ${expectedRetirementAge}.`}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00E676" stopOpacity="0.28" />
              <stop offset="55%" stopColor="#00E5FF" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={lineGradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00E5FF" />
              <stop offset="55%" stopColor="#00E676" />
              <stop offset="100%" stopColor="#C9A227" />
            </linearGradient>
            <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerW}
            height={innerH}
            rx="12"
            fill="rgba(255,255,255,0.02)"
          />

          {savingsTicks.map((tick) => {
            const y = amountToY(tick.amount, innerH);
            return (
              <g key={tick.label}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={PAD.left + innerW}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="wealth-chart-tick"
                >
                  {tick.label}
                </text>
              </g>
            );
          })}

          <rect
            x={retirementX}
            y={PAD.top}
            width={Math.max(PAD.left + innerW - retirementX, 0)}
            height={innerH}
            fill="rgba(201,162,39,0.04)"
          />

          <path d={onTrackArea} fill={`url(#${gradId})`} />
          <path
            d={onTrackPath}
            fill="none"
            stroke={`url(#${lineGradId})`}
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${glowId})`}
          />

          <path
            d={actualPastPath}
            fill="none"
            stroke="#F5F5F7"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.92"
          />
          <path
            d={actualFuturePath}
            fill="none"
            stroke="#F5F5F7"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5 5"
            opacity="0.78"
          />

          <line
            x1={todayX}
            y1={todayY}
            x2={todayX}
            y2={Math.min(todayY + 28, PAD.top + innerH)}
            stroke="rgba(245,245,247,0.35)"
            strokeWidth="1"
          />
          <circle
            cx={todayX}
            cy={todayY}
            r="4"
            fill="#0E0F12"
            stroke="#F5F5F7"
            strokeWidth="1.75"
          />
          <text
            x={todayX}
            y={todayY - 10}
            textAnchor="middle"
            className="wealth-chart-today-label"
          >
            Today
          </text>

          <line
            x1={retirementX}
            y1={PAD.top}
            x2={retirementX}
            y2={PAD.top + innerH}
            stroke="#C9A227"
            strokeWidth="1.75"
            strokeDasharray="5 4"
          />
          <circle
            cx={retirementX}
            cy={peakY}
            r="5"
            fill="#0E0F12"
            stroke="#C9A227"
            strokeWidth="2"
          />
          <g
            transform={`translate(${retirementX + labelOffsetX}, ${PAD.top - 6})`}
          >
            <rect
              x="-62"
              y="-16"
              width="124"
              height="22"
              rx="11"
              fill="rgba(201,162,39,0.16)"
              stroke="rgba(201,162,39,0.45)"
            />
            <text
              textAnchor="middle"
              y="0"
              className="wealth-chart-retire-label"
            >
              {`${retirementAge} years · ${formatSavings(requiredAtPreferred)}`}
            </text>
          </g>

          {depletedX != null &&
          depletionAge != null &&
          depletionAge < AGE_MAX ? (
            <g>
              <circle
                cx={depletedX}
                cy={zeroY}
                r="4"
                fill="#0E0F12"
                stroke="#F5F5F7"
                strokeWidth="1.5"
                opacity="0.85"
              />
              <text
                x={depletedX}
                y={zeroY - 10}
                textAnchor={depletionAge >= 90 ? "end" : "middle"}
                className="wealth-chart-today-label"
                opacity="0.75"
              >
                {`$0 · ${depletionAge}`}
              </text>
            </g>
          ) : null}

          {ageTicks.map((age) => {
            const x = ageToX(age, innerW);
            return (
              <g key={age}>
                <line
                  x1={x}
                  y1={PAD.top + innerH}
                  x2={x}
                  y2={PAD.top + innerH + 6}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={PAD.top + innerH + 22}
                  textAnchor="middle"
                  className="wealth-chart-tick"
                >
                  {age}
                </text>
              </g>
            );
          })}

          <text
            x={PAD.left + innerW / 2}
            y={HEIGHT - 6}
            textAnchor="middle"
            className="wealth-chart-axis-title"
          >
            Age
          </text>
          <text
            x={14}
            y={PAD.top + innerH / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${PAD.top + innerH / 2})`}
            className="wealth-chart-axis-title"
          >
            SAVINGS REQUIRED
          </text>
        </svg>
      </div>

      <div className="wealth-chart-legend" aria-hidden="true">
        <span className="wealth-chart-legend-item wealth-chart-legend-item--ontrack">
          On-track path
        </span>
        <span className="wealth-chart-legend-item wealth-chart-legend-item--actual">
          Your actual savings
        </span>
      </div>

      <p className="safety-buffer-note">
        {hasShortfall ? (
          <>
            Retiring at <strong>{retirementAge}</strong> would require about{" "}
            <strong>{formatSavings(requiredAtPreferred)}</strong>. On your
            current trajectory you are roughly{" "}
            <strong>
              {formatSavings(requiredAtPreferred - actualAtRetirement)} behind
            </strong>{" "}
            at that age. Your savings path supports a comfortable retirement
            closer to <strong>age {expectedRetirementAge}</strong>
            {expectedNestEgg
              ? ` with around ${formatSavings(expectedNestEgg)}`
              : null}
            . Delaying your target — or lifting savings — closes the gap without
            forcing a sharp cut to lifestyle later.
          </>
        ) : (
          <>
            At a target of <strong>age {retirementAge}</strong>, your trajectory
            can fund the required nest egg of about{" "}
            <strong>{formatSavings(requiredAtPreferred)}</strong>. Based on
            current savings, you are on track for retirement around{" "}
            <strong>age {expectedRetirementAge}</strong>
            {expectedNestEgg
              ? ` with around ${formatSavings(expectedNestEgg)}`
              : null}
            .
          </>
        )}
      </p>
    </section>
  );
}

function PulseHeartIcon() {
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
        d="M3.5 12h3l2-4 3 8 2.5-5H20.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
