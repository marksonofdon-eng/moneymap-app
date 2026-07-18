"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FacetFieldId } from "@/server/admin/internetOffers/facetFields";
import {
  COLUMN_FILTER_VISIBLE_CAP,
  FilterListExpandButton,
} from "./FilterListExpandButton";
import { useLazyFacetOptions } from "./useLazyFacetOptions";

export type FacetOption = string | { value: string; label: string };

type NormalizedFacetOption = { value: string; label: string };

type ColumnFacetFilterProps = {
  label: string;
  selected: string[];
  onChange: (next: string[]) => void;
  /** Load distinct values from the facets API when the menu opens. */
  facetField?: FacetFieldId;
  /** Static options when facetField is not set. */
  options?: FacetOption[];
  formatLabel?: (value: string) => string;
};

const MENU_WIDTH = 320;

function normalizeOptions(options: FacetOption[]): NormalizedFacetOption[] {
  return options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
}

/**
 * Excel-style facet filter for a column header.
 * Empty selection = no filter (all values). Non-empty = match any selected.
 */
export function ColumnFacetFilter({
  label,
  facetField,
  options = [],
  formatLabel,
  selected,
  onChange,
}: ColumnFacetFilterProps) {
  const [open, setOpen] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, maxHeight: 420 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const active = selected.length > 0;

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
    const id = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setListExpanded(false);
  }, [query]);

  function toggleValue(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  function selectAllFiltered() {
    const next = new Set(selected);
    for (const o of filtered) next.add(o.value);
    onChange([...next]);
  }

  function clearAll() {
    onChange([]);
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selected.includes(o.value));

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
        aria-label={`Filter ${label}${active ? ` (${selected.length} selected)` : ""}`}
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
            className="admin-col-filter-menu"
            role="dialog"
            aria-label={`Filter ${label}`}
            style={{
              top: menuPos.top,
              left: menuPos.left,
              maxHeight: menuPos.maxHeight,
            }}
          >
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
