export const COLUMN_FILTER_VISIBLE_CAP = 40;

export function hiddenFilterCount(total: number, expanded: boolean): number {
  if (expanded || total <= COLUMN_FILTER_VISIBLE_CAP) return 0;
  return total - COLUMN_FILTER_VISIBLE_CAP;
}

export function shouldShowFilterExpand(total: number, expanded: boolean): boolean {
  return !expanded && total > COLUMN_FILTER_VISIBLE_CAP;
}
