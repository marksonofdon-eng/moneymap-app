"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FacetFieldId } from "@/server/admin/internetOffers/facetFields";
import type { FacetOption } from "./ColumnFacetFilter";
import {
  COLUMN_FILTER_VISIBLE_CAP,
  FilterListExpandButton,
} from "./FilterListExpandButton";
import { useLazyFacetOptions } from "./useLazyFacetOptions";

export type NumberFilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between";

export type NumberFilterCondition = {
  op: NumberFilterOp;
  min: number;
  max?: number;
};

type ColumnNumberFilterProps = {
  label: string;
  selected: string[];
  onSelectedChange: (next: string[]) => void;
  condition: NumberFilterCondition | null;
  onConditionChange: (next: NumberFilterCondition | null) => void;
  facetField?: FacetFieldId;
  formatLabel?: (value: string) => string;
  /** Static value checklist when facetField is not set. */
  options?: FacetOption[];
};

const MENU_WIDTH = 300;

const OP_OPTIONS: { value: NumberFilterOp; label: string }[] = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Does not equal" },
  { value: "gt", label: "Greater than" },
  { value: "gte", label: "Greater than or equal to" },
  { value: "lt", label: "Less than" },
  { value: "lte", label: "Less than or equal to" },
  { value: "between", label: "Between" },
];

function normalizeOptions(options: FacetOption[]) {
  return options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
}

function parseInput(raw: string): number | null {
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null;
}

function conditionSummary(condition: NumberFilterCondition): string {
  const opLabel =
    OP_OPTIONS.find((o) => o.value === condition.op)?.label ?? condition.op;
  if (condition.op === "between" && condition.max != null) {
    return `${opLabel} ${condition.min} – ${condition.max}`;
  }
  return `${opLabel} ${condition.min}`;
}

/**
 * Excel-style number column filter: collapsible condition rules + value checklist.
 */
export function ColumnNumberFilter({
  label,
  facetField,
  formatLabel,
  options = [],
  selected,
  onSelectedChange,
  condition,
  onConditionChange,
}: ColumnNumberFilterProps) {
  const [open, setOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, maxHeight: 420 });
  const [op, setOp] = useState<NumberFilterOp>("gt");
  const [val1, setVal1] = useState("");
  const [val2, setVal2] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const active = selected.length > 0 || condition != null;

  const { options: lazyOptions, loading, truncated: lazyTruncated } =
    useLazyFacetOptions(facetField, open, query, formatLabel);

  const normalized = useMemo(() => {
    if (facetField) return lazyOptions;
    return normalizeOptions(options);
  }, [facetField, lazyOptions, options]);

  const filtered = useMemo(() => {
    if (facetField) return normalized;
    const q = query.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [facetField, normalized, query]);

  function updateMenuPosition() {
    const btn = buttonRef.current;
    if (!btn) return;
    const th = btn.closest("th");
    const colLeft = (th ?? btn).getBoundingClientRect().left;
    const btnRect = btn.getBoundingClientRect();
    const maxLeft = window.innerWidth - MENU_WIDTH - 8;
    const left = Math.max(8, Math.min(colLeft, maxLeft));
    const spaceBelow = window.innerHeight - btnRect.bottom - 12;
    const spaceAbove = btnRect.top - 12;
    const maxHeight = Math.min(560, Math.max(320, Math.max(spaceBelow, spaceAbove)));
    const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
    const top = openUp
      ? Math.max(8, btnRect.top - maxHeight - 6)
      : btnRect.bottom + 6;
    setMenuPos({ top, left, maxHeight });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const onReposition = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      updateMenuPosition();
    };
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setListExpanded(false);
    setRulesOpen(Boolean(condition));
    if (condition) {
      setOp(condition.op);
      setVal1(String(condition.min));
      setVal2(condition.max != null ? String(condition.max) : "");
    } else {
      setOp("gt");
      setVal1("");
      setVal2("");
    }
    const id = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open, condition]);

  useEffect(() => {
    setListExpanded(false);
  }, [query]);

  function toggleValue(value: string) {
    onConditionChange(null);
    if (selected.includes(value)) {
      onSelectedChange(selected.filter((v) => v !== value));
    } else {
      onSelectedChange([...selected, value]);
    }
  }

  function selectAllFiltered() {
    onConditionChange(null);
    const next = new Set(selected);
    for (const o of filtered) next.add(o.value);
    onSelectedChange([...next]);
  }

  function clearAll() {
    onConditionChange(null);
    onSelectedChange([]);
  }

  function applyCondition() {
    const min = parseInput(val1);
    if (min == null) return;
    if (op === "between") {
      const max = parseInput(val2);
      if (max == null) return;
      onSelectedChange([]);
      onConditionChange({ op, min, max });
    } else {
      onSelectedChange([]);
      onConditionChange({ op, min });
    }
    setRulesOpen(false);
  }

  function clearCondition() {
    onConditionChange(null);
    setVal1("");
    setVal2("");
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selected.includes(o.value));

  const summary = condition ? conditionSummary(condition) : null;

  const visibleOptions = listExpanded
    ? filtered
    : filtered.slice(0, COLUMN_FILTER_VISIBLE_CAP);

  return (
    <div className="admin-col-filter" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={
          active
            ? "admin-col-filter-btn admin-col-filter-btn--active"
            : "admin-col-filter-btn"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Filter ${label}${active ? " (active)" : ""}`}
        title={`Filter ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!open) updateMenuPosition();
          setOpen((v) => !v);
        }}
      >
        <FilterIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="admin-col-filter-menu admin-col-number-menu"
            role="dialog"
            aria-label={`Filter ${label}`}
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: MENU_WIDTH,
              maxHeight: menuPos.maxHeight,
            }}
          >
            <div className="admin-col-number-rules">
              <button
                type="button"
                className="admin-col-number-toggle"
                aria-expanded={rulesOpen}
                onClick={() => setRulesOpen((v) => !v)}
              >
                <span>Number filters</span>
                <span aria-hidden="true">{rulesOpen ? "▾" : "▸"}</span>
              </button>
              {summary && !rulesOpen && (
                <p className="admin-col-number-active muted">{summary}</p>
              )}
              {rulesOpen && (
                <div className="admin-col-number-rule-panel">
                  <div
                    className={
                      op === "between"
                        ? "admin-col-number-rule-grid admin-col-number-rule-grid--between"
                        : "admin-col-number-rule-grid"
                    }
                  >
                    <select
                      className="admin-col-number-inline"
                      value={op}
                      aria-label="Number filter operator"
                      onChange={(e) => setOp(e.target.value as NumberFilterOp)}
                    >
                      {OP_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="any"
                      className="admin-col-number-inline"
                      value={val1}
                      aria-label={op === "between" ? "From value" : "Filter value"}
                      onChange={(e) => setVal1(e.target.value)}
                      placeholder={op === "between" ? "From" : "Value"}
                    />
                    {op === "between" && (
                      <input
                        type="number"
                        step="any"
                        className="admin-col-number-inline"
                        value={val2}
                        aria-label="To value"
                        onChange={(e) => setVal2(e.target.value)}
                        placeholder="To"
                      />
                    )}
                  </div>
                  <div className="admin-col-number-rule-actions">
                    <button type="button" onClick={applyCondition}>
                      Apply
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!condition}
                      onClick={clearCondition}
                    >
                      Clear rule
                    </button>
                  </div>
                  {summary && (
                    <p className="admin-col-number-active muted">{summary}</p>
                  )}
                </div>
              )}
            </div>

            <div className="admin-col-number-divider" />

            <div className="admin-col-filter-body">
              <input
                ref={searchRef}
                className="admin-col-filter-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                aria-label={`Search ${label} values`}
              />
              <div className="admin-col-filter-actions">
                <button
                  type="button"
                  className="admin-col-filter-link"
                  disabled={filtered.length === 0 || allFilteredSelected}
                  onClick={selectAllFiltered}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="admin-col-filter-link"
                  disabled={!active}
                  onClick={clearAll}
                >
                  Clear
                </button>
                <span className="admin-col-filter-count muted">
                  {loading ? "Loading…" : `${filtered.length} value${filtered.length === 1 ? "" : "s"}`}
                  {!listExpanded && filtered.length > COLUMN_FILTER_VISIBLE_CAP
                    ? ` · ${COLUMN_FILTER_VISIBLE_CAP} shown`
                    : ""}
                  {!loading && lazyTruncated ? " · refine search for more" : ""}
                </span>
              </div>
              <div className="admin-col-filter-list-wrap">
                <ul className="admin-col-filter-list">
                  {filtered.length === 0 && (
                    <li className="admin-col-filter-empty muted">No matches</li>
                  )}
                  {visibleOptions.map((option) => (
                    <li key={option.value}>
                      <label className="admin-col-filter-option">
                        <input
                          type="checkbox"
                          checked={selected.includes(option.value)}
                          onChange={() => toggleValue(option.value)}
                        />
                        <span title={option.label}>{option.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <FilterListExpandButton
                  total={filtered.length}
                  expanded={listExpanded}
                  onExpand={() => setListExpanded(true)}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function FilterIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M1.5 2.25h9L7.2 6.3v3.45L4.8 8.7V6.3L1.5 2.25Z"
      />
    </svg>
  );
}
