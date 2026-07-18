"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FacetFieldId } from "@/server/admin/internetOffers/facetFields";
import { FACET_MAX_LIMIT } from "@/server/admin/internetOffers/facetFields";
import {
  COLUMN_FILTER_VISIBLE_CAP,
  FilterListExpandButton,
} from "./FilterListExpandButton";
import { useLazyFacetOptions } from "./useLazyFacetOptions";

type ColumnDateFilterProps = {
  label: string;
  selected: string[];
  onChange: (next: string[]) => void;
  /** Load distinct calendar days from the facets API when the menu opens. */
  facetField: FacetFieldId;
};

const MENU_WIDTH = 280;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type MonthNode = { month: number; days: string[] };
type YearNode = { year: number; months: MonthNode[] };

type CheckState = "all" | "some" | "none";

function buildTree(days: string[]): YearNode[] {
  const byYear = new Map<number, Map<number, string[]>>();
  for (const day of days) {
    const [ys, ms] = day.split("-");
    const year = Number(ys);
    const month = Number(ms);
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
    if (!byYear.has(year)) byYear.set(year, new Map());
    const months = byYear.get(year)!;
    if (!months.has(month)) months.set(month, []);
    months.get(month)!.push(day);
  }

  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([month, monthDays]) => ({
          month,
          days: [...monthDays].sort((a, b) => b.localeCompare(a)),
        })),
    }));
}

function checkState(days: string[], selected: Set<string>): CheckState {
  if (days.length === 0) return "none";
  let hit = 0;
  for (const d of days) if (selected.has(d)) hit += 1;
  if (hit === 0) return "none";
  if (hit === days.length) return "all";
  return "some";
}

function yearDays(node: YearNode): string[] {
  return node.months.flatMap((m) => m.days);
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Excel-style date filter: Year → Month → Day hierarchy.
 * Selection is stored as calendar day keys (YYYY-MM-DD).
 */
export function ColumnDateFilter({
  label,
  facetField,
  selected,
  onChange,
}: ColumnDateFilterProps) {
  const [open, setOpen] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, maxHeight: 420 });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const active = selected.length > 0;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const { options: lazyOptions, loading } = useLazyFacetOptions(
    facetField,
    open,
    query,
    undefined,
    FACET_MAX_LIMIT,
  );
  const days = useMemo(
    () => lazyOptions.map((o) => o.value),
    [lazyOptions],
  );

  const tree = useMemo(() => buildTree(days), [days]);

  const filteredTree = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tree;
    return tree
      .map((yearNode) => {
        const yearHit = String(yearNode.year).includes(q);
        const months = yearNode.months
          .map((monthNode) => {
            const monthName = MONTH_NAMES[monthNode.month - 1] ?? "";
            const monthHit =
              yearHit ||
              monthName.toLowerCase().includes(q) ||
              String(monthNode.month).padStart(2, "0").includes(q);
            const days = monthHit
              ? monthNode.days
              : monthNode.days.filter(
                  (d) =>
                    d.includes(q) ||
                    d.slice(8).includes(q) ||
                    `${Number(d.slice(8))} ${monthName} ${yearNode.year}`
                      .toLowerCase()
                      .includes(q),
                );
            if (!days.length) return null;
            return { ...monthNode, days };
          })
          .filter((m): m is MonthNode => m != null);
        if (!months.length) return null;
        return { ...yearNode, months };
      })
      .filter((y): y is YearNode => y != null);
  }, [tree, query]);

  const totalDays = useMemo(
    () => filteredTree.reduce((n, y) => n + yearDays(y).length, 0),
    [filteredTree],
  );

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
    // Expand first year by default for commercial drill-down.
    if (tree[0]) {
      setExpanded(new Set([String(tree[0].year)]));
    }
    const id = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open, tree]);

  useEffect(() => {
    setListExpanded(false);
  }, [query]);

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setDaysSelected(dayList: string[], on: boolean) {
    const next = new Set(selected);
    for (const d of dayList) {
      if (on) next.add(d);
      else next.delete(d);
    }
    onChange([...next].sort((a, b) => b.localeCompare(a)));
  }

  function clearAll() {
    onChange([]);
  }

  function selectAllVisible() {
    const visible = filteredTree.flatMap(yearDays);
    setDaysSelected(visible, true);
  }

  const allVisible = filteredTree.flatMap(yearDays);
  const allVisibleSelected =
    allVisible.length > 0 && allVisible.every((d) => selectedSet.has(d));

  let dayBudget = listExpanded
    ? Number.POSITIVE_INFINITY
    : COLUMN_FILTER_VISIBLE_CAP;

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
        aria-label={`Filter ${label}${active ? ` (${selected.length} days)` : ""}`}
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
            className="admin-col-filter-menu admin-col-date-menu"
            role="dialog"
            aria-label={`Filter ${label}`}
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: MENU_WIDTH,
              maxHeight: menuPos.maxHeight,
            }}
          >
            <div className="admin-col-filter-body">
              <input
                ref={searchRef}
                className="admin-col-filter-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search year, month, day…"
                aria-label={`Search ${label} dates`}
              />
              <div className="admin-col-filter-actions">
                <button
                  type="button"
                  className="admin-col-filter-link"
                  disabled={allVisible.length === 0 || allVisibleSelected}
                  onClick={selectAllVisible}
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
              </div>
              <div className="admin-col-filter-list-wrap">
              <ul className="admin-col-date-tree">
              {loading && (
                <li className="admin-col-filter-empty muted">Loading dates…</li>
              )}
              {!loading && filteredTree.length === 0 && (
                <li className="admin-col-filter-empty muted">No dates</li>
              )}
              {filteredTree.map((yearNode) => {
                const yKey = String(yearNode.year);
                const yDays = yearDays(yearNode);
                const yState = checkState(yDays, selectedSet);
                const yOpen = expanded.has(yKey);
                return (
                  <li key={yKey} className="admin-col-date-year">
                    <div className="admin-col-date-row">
                      <button
                        type="button"
                        className="admin-col-date-twist"
                        aria-expanded={yOpen}
                        aria-label={`${yOpen ? "Collapse" : "Expand"} ${yearNode.year}`}
                        onClick={() => toggleExpanded(yKey)}
                      >
                        {yOpen ? "▾" : "▸"}
                      </button>
                      <label className="admin-col-date-label">
                        <input
                          type="checkbox"
                          checked={yState === "all"}
                          ref={(el) => {
                            if (el) el.indeterminate = yState === "some";
                          }}
                          onChange={() =>
                            setDaysSelected(yDays, yState !== "all")
                          }
                        />
                        <span>{yearNode.year}</span>
                      </label>
                    </div>
                    {yOpen && (
                      <ul className="admin-col-date-months">
                        {yearNode.months.map((monthNode) => {
                          const mKey = monthKey(yearNode.year, monthNode.month);
                          const mState = checkState(monthNode.days, selectedSet);
                          const mOpen = expanded.has(mKey);
                          const monthName =
                            MONTH_NAMES[monthNode.month - 1] ?? mKey;
                          return (
                            <li key={mKey} className="admin-col-date-month">
                              <div className="admin-col-date-row">
                                <button
                                  type="button"
                                  className="admin-col-date-twist"
                                  aria-expanded={mOpen}
                                  aria-label={`${mOpen ? "Collapse" : "Expand"} ${monthName}`}
                                  onClick={() => toggleExpanded(mKey)}
                                >
                                  {mOpen ? "▾" : "▸"}
                                </button>
                                <label className="admin-col-date-label">
                                  <input
                                    type="checkbox"
                                    checked={mState === "all"}
                                    ref={(el) => {
                                      if (el)
                                        el.indeterminate = mState === "some";
                                    }}
                                    onChange={() =>
                                      setDaysSelected(
                                        monthNode.days,
                                        mState !== "all",
                                      )
                                    }
                                  />
                                  <span>{monthName}</span>
                                </label>
                              </div>
                              {mOpen && (
                                <ul className="admin-col-date-days">
                                  {monthNode.days.map((day) => {
                                    if (dayBudget <= 0) return null;
                                    dayBudget -= 1;
                                    const dayNum = Number(day.slice(8));
                                    return (
                                      <li key={day}>
                                        <label className="admin-col-date-label admin-col-date-day">
                                          <input
                                            type="checkbox"
                                            checked={selectedSet.has(day)}
                                            onChange={() =>
                                              setDaysSelected(
                                                [day],
                                                !selectedSet.has(day),
                                              )
                                            }
                                          />
                                          <span>
                                            {dayNum} {monthName.slice(0, 3)}{" "}
                                            {yearNode.year}
                                          </span>
                                        </label>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <FilterListExpandButton
              total={totalDays}
              expanded={listExpanded}
              onExpand={() => setListExpanded(true)}
              noun="dates"
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
