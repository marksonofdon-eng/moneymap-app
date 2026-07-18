"use client";

import { useId, useState, type ReactNode } from "react";

type CollapsibleSectionProps = {
  kicker?: string;
  title: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  headingId?: string;
  summary?: ReactNode;
  icon?: ReactNode;
};

/**
 * Expandable dashboard panel — trial pattern for section boxes.
 */
export function CollapsibleSection({
  kicker,
  title,
  children,
  className,
  defaultOpen = true,
  headingId,
  summary,
  icon,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const reactId = useId();
  const panelId = `${reactId}-panel`;
  const labelId = headingId ?? `${reactId}-heading`;

  return (
    <section
      className={["section", "collapsible-section", className]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={labelId}
    >
      <button
        type="button"
        className="collapsible-section-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="collapsible-section-head">
          {kicker ? (
            <span className="collapsible-section-kicker">
              {icon ? (
                <span
                  className="collapsible-section-kicker-icon"
                  aria-hidden="true"
                >
                  {icon}
                </span>
              ) : null}
              {kicker}
            </span>
          ) : null}
          <span id={labelId} className="collapsible-section-title">
            {title}
          </span>
          {!open && summary ? (
            <span className="collapsible-section-summary">{summary}</span>
          ) : null}
        </span>
        <span
          className={
            open
              ? "collapsible-section-chevron collapsible-section-chevron--open"
              : "collapsible-section-chevron"
          }
          aria-hidden="true"
        >
          <ChevronIcon />
        </span>
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={labelId}
        aria-hidden={!open}
        inert={open ? undefined : true}
        className={
          open
            ? "collapsible-section-panel collapsible-section-panel--open"
            : "collapsible-section-panel"
        }
      >
        <div className="collapsible-section-panel-inner">{children}</div>
      </div>
    </section>
  );
}

function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
