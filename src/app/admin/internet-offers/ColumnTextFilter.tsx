"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ColumnTextFilterProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

const MENU_WIDTH = 280;

/**
 * Contains-text filter for freeform text / URL columns.
 */
export function ColumnTextFilter({
  label,
  value,
  onChange,
  placeholder,
}: ColumnTextFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, maxHeight: 280 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const active = value.trim().length > 0;

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
    const maxHeight = Math.min(320, Math.max(160, Math.max(spaceBelow, spaceAbove)));
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
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
    setDraft(value);
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open, value]);

  function apply() {
    onChange(draft.trim());
    setOpen(false);
  }

  function clear() {
    setDraft("");
    onChange("");
    setOpen(false);
  }

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
            className="admin-col-filter-menu"
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
                ref={inputRef}
                className="admin-col-filter-search"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    apply();
                  }
                }}
                placeholder={placeholder ?? `Contains…`}
                aria-label={`${label} contains`}
              />
              <div className="admin-col-filter-actions">
                <button type="button" onClick={apply}>
                  Apply
                </button>
                <button
                  type="button"
                  className="admin-col-filter-link"
                  disabled={!active && !draft.trim()}
                  onClick={clear}
                >
                  Clear
                </button>
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
