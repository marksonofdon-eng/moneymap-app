"use client";

import {
  COLUMN_FILTER_VISIBLE_CAP,
  hiddenFilterCount,
  shouldShowFilterExpand,
} from "./columnFilterListLimit";

export function FilterListExpandButton({
  total,
  expanded,
  onExpand,
  noun = "values",
}: {
  total: number;
  expanded: boolean;
  onExpand: () => void;
  noun?: string;
}) {
  if (!shouldShowFilterExpand(total, expanded)) return null;
  const hidden = hiddenFilterCount(total, expanded);
  return (
    <button
      type="button"
      className="admin-col-filter-show-all"
      onClick={onExpand}
    >
      Show all {total} {noun} ({hidden} more)
    </button>
  );
}

export { COLUMN_FILTER_VISIBLE_CAP };
