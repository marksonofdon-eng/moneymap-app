"use client";

import { useId } from "react";
import {
  DEMO_PROFILE,
  safetyBufferTargetMonths,
} from "@/components/FitnessKpiDashboard";

const WIDTH = 640;
const HEIGHT = 170;
const PAD = { top: 40, right: 24, bottom: 40, left: 48 };
const BAR_Y = 58;
const BAR_H = 40;

type SafetyBufferChartProps = {
  age?: number;
};

function formatMonths(months: number): string {
  const rounded = Math.round(months * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function formatGapDollars(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  const thousands = amount / 1000;
  if (thousands >= 10) {
    return `$${Math.round(thousands)}k`;
  }
  return `$${thousands.toFixed(1).replace(/\.0$/, "")}k`;
}

export function SafetyBufferChart({ age = 50 }: SafetyBufferChartProps) {
  const reactId = useId();
  const fillId = `${reactId}-safety-fill`;
  const gapPatternId = `${reactId}-safety-gap`;

  const current = DEMO_PROFILE.safetyBufferMonths;
  const optimal = safetyBufferTargetMonths(age);
  const gap = Math.max(0, optimal - current);
  const gapDollars = Math.round(gap * DEMO_PROFILE.monthlyLivingCosts);
  const scaleMax = Math.max(optimal, current, 12) * 1.05;

  const innerW = WIDTH - PAD.left - PAD.right;
  const toX = (months: number) =>
    PAD.left + (Math.min(months, scaleMax) / scaleMax) * innerW;

  const zeroX = PAD.left;
  const currentX = toX(current);
  const optimalX = toX(optimal);
  const hasGap = gap > 0.05;
  const ticks = [0, 3, 6, 9, 12].filter((t) => t <= scaleMax + 0.01);
  const sectionTone = hasGap ? "shortfall" : "ok";

  return (
    <section
      className={`safety-buffer safety-buffer--${sectionTone}`}
      aria-labelledby={`${reactId}-heading`}
    >
      <header className="safety-buffer-header">
        <div>
          <h3 id={`${reactId}-heading`} className="safety-buffer-heading">
            Safety Buffer
          </h3>
          <p className="safety-buffer-lede">
            A safety buffer matters when life takes an unexpected turn — job
            loss, illness, or other unforeseen events — so you can keep meeting
            essential costs without panic.
          </p>
        </div>
        <div className="safety-buffer-stats">
          <div className="safety-buffer-stat safety-buffer-stat--current">
            <span className="safety-buffer-stat-label">Current</span>
            <strong className="safety-buffer-stat-value">
              {formatMonths(current)}
              <span>months</span>
            </strong>
          </div>
          <div className="safety-buffer-stat safety-buffer-stat--gap">
            <span className="safety-buffer-stat-label">Gap</span>
            <strong className="safety-buffer-stat-value">
              {hasGap ? formatMonths(gap) : "0"}
              <span>months</span>
            </strong>
          </div>
          <div className="safety-buffer-stat safety-buffer-stat--target">
            <span className="safety-buffer-stat-label">Optimal</span>
            <strong className="safety-buffer-stat-value">
              {formatMonths(optimal)}
              <span>months</span>
            </strong>
          </div>
        </div>
      </header>

      <div className="safety-buffer-frame">
        <svg
          className="safety-buffer-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Safety buffer chart. Current ${formatMonths(current)} months, optimal ${formatMonths(optimal)} months, gap ${formatMonths(gap)} months.`}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="1" y2="0">
              {hasGap ? (
                <>
                  <stop offset="0%" stopColor="#FF8A80" />
                  <stop offset="100%" stopColor="#FF5252" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#00E5FF" />
                  <stop offset="100%" stopColor="#00E676" />
                </>
              )}
            </linearGradient>
            <pattern
              id={gapPatternId}
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(35)"
            >
              <rect width="8" height="8" fill="rgba(255,82,82,0.16)" />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="8"
                stroke="rgba(255,138,128,0.65)"
                strokeWidth="2"
              />
            </pattern>
          </defs>

          <rect
            x={zeroX}
            y={BAR_Y}
            width={innerW}
            height={BAR_H}
            rx="10"
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(255,255,255,0.08)"
          />

          {hasGap ? (
            <rect
              x={currentX}
              y={BAR_Y}
              width={Math.max(optimalX - currentX, 0)}
              height={BAR_H}
              fill={`url(#${gapPatternId})`}
            />
          ) : null}

          <rect
            x={zeroX}
            y={BAR_Y}
            width={Math.max(currentX - zeroX, 0)}
            height={BAR_H}
            rx="10"
            fill={`url(#${fillId})`}
            opacity="0.95"
          />

          <line
            x1={optimalX}
            y1={BAR_Y - 12}
            x2={optimalX}
            y2={BAR_Y + BAR_H + 12}
            stroke="#C9A227"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
          <circle
            cx={optimalX}
            cy={BAR_Y - 12}
            r="4"
            fill="#0E0F12"
            stroke="#C9A227"
            strokeWidth="1.75"
          />
          <text
            x={Math.min(Math.max(optimalX, PAD.left + 72), WIDTH - PAD.right - 72)}
            y={BAR_Y - 20}
            textAnchor="middle"
            className="safety-buffer-chart-label safety-buffer-chart-label--target"
          >
            {`Optimal ${formatMonths(optimal)} months`}
          </text>

          <text
            x={
              currentX - zeroX > 88
                ? currentX - 10
                : zeroX + 10
            }
            y={BAR_Y + BAR_H / 2 + 5}
            textAnchor={currentX - zeroX > 88 ? "end" : "start"}
            className={`safety-buffer-chart-label ${
              hasGap
                ? "safety-buffer-chart-label--current-alert"
                : "safety-buffer-chart-label--current"
            }`}
          >
            {`${formatMonths(current)} months`}
          </text>

          {hasGap ? (
            <text
              x={(currentX + optimalX) / 2}
              y={BAR_Y + BAR_H + 28}
              textAnchor="middle"
              className="safety-buffer-chart-label safety-buffer-chart-label--gap"
            >
              {`${formatMonths(gap)} months short`}
            </text>
          ) : (
            <text
              x={optimalX}
              y={BAR_Y + BAR_H + 28}
              textAnchor="middle"
              className="safety-buffer-chart-label safety-buffer-chart-label--ok"
            >
              On target
            </text>
          )}

          {ticks.map((tick) => {
            const x = toX(tick);
            return (
              <g key={tick}>
                <line
                  x1={x}
                  y1={HEIGHT - 28}
                  x2={x}
                  y2={HEIGHT - 22}
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={HEIGHT - 10}
                  textAnchor="middle"
                  className="safety-buffer-tick"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          <text
            x={PAD.left + innerW / 2}
            y={HEIGHT - 1}
            textAnchor="middle"
            className="safety-buffer-axis"
          >
            Months of cover
          </text>
        </svg>
      </div>

      <p className="safety-buffer-note">
        {hasGap ? (
          <>
            You currently hold about{" "}
            <strong>{formatMonths(current)} months</strong> of accessible cash
            cover. For your age, a{" "}
            <strong>{formatMonths(optimal)}-month</strong> buffer is the
            recommended standard. Extending your safety buffer by a further{" "}
            <strong>{formatGapDollars(gapDollars)}</strong> would bring you to
            that level — so you can continue your current lifestyle without
            urgently needing to cut spending if income is interrupted.
          </>
        ) : (
          <>
            Your <strong>{formatMonths(current)}-month</strong> buffer already
            meets the recommended{" "}
            <strong>{formatMonths(optimal)}-month</strong> standard for your
            age. That gives you room to handle unforeseen events — including
            job loss or a health setback — without urgently needing to reduce
            spending.
          </>
        )}
      </p>
    </section>
  );
}
