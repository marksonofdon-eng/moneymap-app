"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import {
  COLUMNS_STORAGE_KEY,
  DEFAULT_VISIBLE_COLUMN_IDS,
  FACET_FILTER_COLUMN_IDS,
  OFFER_COLUMNS,
  OFFER_STATUS_VALUES,
  TEXT_FILTER_COLUMN_IDS,
  columnClipsContent,
  columnFilterKind,
  connectionTypeLabel,
  type OfferColumnDef,
  type OfferColumnId,
  type OfferStatusValue,
} from "@/lib/internetOffersColumns";
import {
  OFFER_ISSUE_LABELS,
  type OfferIssueCode,
} from "@/server/admin/internetOffers/issueRules";
import { isFacetFieldId } from "@/server/admin/internetOffers/facetFields";
import {
  isMoneyNumberColumnId,
  NUMBER_FILTER_COLUMN_IDS,
  type NumberFilterColumnId,
} from "@/server/admin/internetOffers/numberFilterColumns";
import { ColumnFacetFilter } from "./ColumnFacetFilter";
import { ColumnDateFilter } from "./ColumnDateFilter";
import {
  ColumnNumberFilter,
  type NumberFilterCondition,
} from "./ColumnNumberFilter";
import { ColumnTextFilter } from "./ColumnTextFilter";
import { useDebouncedValue } from "./useDebouncedValue";

function boolFacetLabel(value: string) {
  return value === "true" ? "Yes" : "No";
}

type ListQueryInput = {
  page: number;
  sort: string;
  dir: "asc" | "desc";
  q: string;
  columnFilters: Partial<Record<OfferColumnId, string[]>>;
  columnNumberFilters: Partial<Record<OfferColumnId, NumberFilterCondition>>;
  columnTextFilters: Partial<Record<OfferColumnId, string>>;
};

const DEFAULT_SORT_KEY = "statusUpdatedAt";
const DEFAULT_SORT_DIR: "asc" | "desc" = "desc";

function onlyVisibleColumnMap<T>(
  map: Partial<Record<OfferColumnId, T>>,
  visibleColumns: OfferColumnId[],
): Partial<Record<OfferColumnId, T>> {
  const visible = new Set(visibleColumns);
  const next: Partial<Record<OfferColumnId, T>> = {};
  for (const id of Object.keys(map) as OfferColumnId[]) {
    if (visible.has(id) && map[id] !== undefined) {
      next[id] = map[id] as T;
    }
  }
  return next;
}

/** Sort/filter only apply while their column is visible. */
function resolveActiveSort(
  sort: string,
  dir: "asc" | "desc",
  visibleColumns: OfferColumnId[],
): { sort: string; dir: "asc" | "desc" } {
  const visible = new Set(visibleColumns);
  const activeCol = OFFER_COLUMNS.find((c) => c.sortKey === sort);
  if (activeCol && visible.has(activeCol.id)) {
    return { sort, dir };
  }
  if (visible.has("statusUpdatedAt")) {
    return { sort: DEFAULT_SORT_KEY, dir: DEFAULT_SORT_DIR };
  }
  for (const id of visibleColumns) {
    const col = OFFER_COLUMNS.find((c) => c.id === id);
    if (col?.sortable && col.sortKey) {
      return { sort: col.sortKey, dir: "asc" };
    }
  }
  return { sort: "id", dir: "desc" };
}

function buildInternetOffersQueryParams(input: ListQueryInput): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(input.page));
  params.set("pageSize", "50");
  params.set("sort", input.sort);
  params.set("dir", input.dir);
  if (input.q) params.set("q", input.q);

  const { columnFilters, columnNumberFilters, columnTextFilters } = input;

  for (const columnId of FACET_FILTER_COLUMN_IDS) {
    const values = columnFilters[columnId];
    if (!values?.length) continue;
    params.set(columnId, values.join(","));
  }

  if (columnFilters.statusUpdatedAt?.length) {
    params.set("statusUpdatedAt", columnFilters.statusUpdatedAt.join(","));
  }
  if (columnFilters.lastUpdated?.length) {
    params.set("lastUpdated", columnFilters.lastUpdated.join(","));
  }

  for (const columnId of NUMBER_FILTER_COLUMN_IDS) {
    appendNumberColumnParams(
      params,
      columnId,
      columnFilters,
      columnNumberFilters,
    );
  }

  for (const columnId of TEXT_FILTER_COLUMN_IDS) {
    const text = columnTextFilters[columnId]?.trim();
    if (text) params.set(columnId, text);
  }

  return params;
}

function appendNumberColumnParams(
  params: URLSearchParams,
  columnId: NumberFilterColumnId,
  columnFilters: Partial<Record<OfferColumnId, string[]>>,
  columnNumberFilters: Partial<Record<OfferColumnId, NumberFilterCondition>>,
): boolean {
  const rule = columnNumberFilters[columnId];
  if (rule) {
    params.set(`${columnId}Op`, rule.op);
    params.set(`${columnId}Min`, String(rule.min));
    if (rule.max != null) {
      params.set(`${columnId}Max`, String(rule.max));
    }
    return true;
  }
  const values = columnFilters[columnId];
  if (values?.length) {
    params.set(columnId, values.join(","));
    return true;
  }
  return false;
}

type OfferRow = {
  id: number;
  top5: boolean;
  issue: boolean;
  status: OfferStatusValue;
  statusUpdatedAt: string;
  lastUpdated: string;
  providerName: string;
  planName: string;
  connectionType: string;
  connectionTypeLabel: string;
  maxDownloadSpeed: number;
  typicalEveningSpeed: number;
  uploadSpeed: number;
  ongoingMonthlyCost: number;
  promoMonthlyCost: number;
  promoDurationMonths: number;
  modemCost: number;
  setupFee: number;
  exitFee: number;
  dataAllowance: string;
  contractTermMonths: number;
  targetPostcode: string;
  networkOwner: string;
  calculatedFirstYearTotalCostAud: number;
  yearTwoTotalCostAud: number;
  calculatedTrueAverageMonthlyCostAud: number;
  calculatedCostPerMbpsMetric: number;
  deepLinkUrl: string | null;
  bundledPerksNotes: string | null;
  detectedIssues: OfferIssueCode[];
};

type ListResponse = {
  rows: OfferRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

function money(n: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(n);
}

function facetFormatLabel(columnId: OfferColumnId, value: string): string {
  switch (columnId) {
    case "connectionType":
      return connectionTypeLabel(value);
    case "top5":
    case "issue":
      return boolFacetLabel(value);
    default: {
      if (isMoneyNumberColumnId(columnId)) {
        const n = Number(value);
        return Number.isFinite(n) ? money(n) : value;
      }
      return value;
    }
  }
}

/** Compact local datetime: 13/07/26 07:18 — shortest form that keeps day/month/year/time. */
function formatDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${yy} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function loadVisibleColumns(): OfferColumnId[] {
  if (typeof window === "undefined") return [...DEFAULT_VISIBLE_COLUMN_IDS];
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_VISIBLE_COLUMN_IDS];
    const parsed = JSON.parse(raw) as string[];
    const valid = parsed.filter((id): id is OfferColumnId =>
      OFFER_COLUMNS.some((c) => c.id === id),
    );
    return valid.length ? valid : [...DEFAULT_VISIBLE_COLUMN_IDS];
  } catch {
    return [...DEFAULT_VISIBLE_COLUMN_IDS];
  }
}

export function InternetOffersAdminClient({
  userEmail,
}: {
  userEmail: string;
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(DEFAULT_SORT_KEY);
  const [dir, setDir] = useState<"asc" | "desc">(DEFAULT_SORT_DIR);
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [columnFilters, setColumnFilters] = useState<
    Partial<Record<OfferColumnId, string[]>>
  >({});
  const [columnNumberFilters, setColumnNumberFilters] = useState<
    Partial<Record<OfferColumnId, NumberFilterCondition>>
  >({});
  const [columnTextFilters, setColumnTextFilters] = useState<
    Partial<Record<OfferColumnId, string>>
  >({});
  const [visibleColumns, setVisibleColumns] = useState<OfferColumnId[]>(
    [...DEFAULT_VISIBLE_COLUMN_IDS],
  );
  const [columnsReady, setColumnsReady] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);
  const [flagBusyId, setFlagBusyId] = useState<number | null>(null);
  const [jumpPage, setJumpPage] = useState("1");
  const [exporting, setExporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [dragColId, setDragColId] = useState<OfferColumnId | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: OfferColumnId;
    edge: "before" | "after";
  } | null>(null);
  const dragColIdRef = useRef<OfferColumnId | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [headerWidthsPx, setHeaderWidthsPx] = useState<Partial<
    Record<OfferColumnId, number>
  > | null>(null);

  useEffect(() => {
    const cols = loadVisibleColumns();
    setVisibleColumns(cols);
    const resolved = resolveActiveSort(DEFAULT_SORT_KEY, DEFAULT_SORT_DIR, cols);
    setSort(resolved.sort);
    setDir(resolved.dir);
    setColumnsReady(true);
  }, []);

  useEffect(() => {
    if (!columnsReady) return;
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns, columnsReady]);

  const columnFiltersKey = useMemo(
    () => JSON.stringify(columnFilters),
    [columnFilters],
  );
  const columnNumberFiltersKey = useMemo(
    () => JSON.stringify(columnNumberFilters),
    [columnNumberFilters],
  );
  const columnTextFiltersKey = useMemo(
    () => JSON.stringify(columnTextFilters),
    [columnTextFilters],
  );
  const debouncedColumnFiltersKey = useDebouncedValue(columnFiltersKey, 350);
  const debouncedColumnNumberFiltersKey = useDebouncedValue(
    columnNumberFiltersKey,
    350,
  );
  const debouncedColumnTextFiltersKey = useDebouncedValue(
    columnTextFiltersKey,
    350,
  );
  const debouncedColumnFilters = useMemo(
    () =>
      JSON.parse(debouncedColumnFiltersKey) as Partial<
        Record<OfferColumnId, string[]>
      >,
    [debouncedColumnFiltersKey],
  );
  const debouncedColumnNumberFilters = useMemo(
    () =>
      JSON.parse(debouncedColumnNumberFiltersKey) as Partial<
        Record<OfferColumnId, NumberFilterCondition>
      >,
    [debouncedColumnNumberFiltersKey],
  );
  const debouncedColumnTextFilters = useMemo(
    () =>
      JSON.parse(debouncedColumnTextFiltersKey) as Partial<
        Record<OfferColumnId, string>
      >,
    [debouncedColumnTextFiltersKey],
  );

  const activeSort = useMemo(
    () => resolveActiveSort(sort, dir, visibleColumns),
    [sort, dir, visibleColumns],
  );
  const activeColumnFilters = useMemo(
    () => onlyVisibleColumnMap(debouncedColumnFilters, visibleColumns),
    [debouncedColumnFilters, visibleColumns],
  );
  const activeColumnNumberFilters = useMemo(
    () => onlyVisibleColumnMap(debouncedColumnNumberFilters, visibleColumns),
    [debouncedColumnNumberFilters, visibleColumns],
  );
  const activeColumnTextFilters = useMemo(
    () => onlyVisibleColumnMap(debouncedColumnTextFilters, visibleColumns),
    [debouncedColumnTextFilters, visibleColumns],
  );

  const queryString = useMemo(() => {
    return buildInternetOffersQueryParams({
      page,
      sort: activeSort.sort,
      dir: activeSort.dir,
      q,
      columnFilters: activeColumnFilters,
      columnNumberFilters: activeColumnNumberFilters,
      columnTextFilters: activeColumnTextFilters,
    }).toString();
  }, [
    page,
    activeSort,
    q,
    activeColumnFilters,
    activeColumnNumberFilters,
    activeColumnTextFilters,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/internet-offers?${queryString}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const json = (await res.json()) as ListResponse;
      setData(json);
      setJumpPage(String(json.page));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load offers");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFilters() {
    setQ("");
    setQDraft("");
    setColumnFilters({});
    setColumnNumberFilters({});
    setColumnTextFilters({});
    setPage(1);
  }

  function clearColumnFilterState(columnId: OfferColumnId) {
    setColumnFilters((prev) => {
      if (!prev[columnId]) return prev;
      const next = { ...prev };
      delete next[columnId];
      return next;
    });
    setColumnNumberFilters((prev) => {
      if (!prev[columnId]) return prev;
      const next = { ...prev };
      delete next[columnId];
      return next;
    });
    setColumnTextFilters((prev) => {
      if (!prev[columnId]) return prev;
      const next = { ...prev };
      delete next[columnId];
      return next;
    });
  }

  function setColumnFacetFilter(columnId: OfferColumnId, values: string[]) {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (values.length === 0) delete next[columnId];
      else next[columnId] = values;
      return next;
    });
    if (values.length > 0) {
      setColumnNumberFilters((prev) => {
        if (!prev[columnId]) return prev;
        const next = { ...prev };
        delete next[columnId];
        return next;
      });
    }
    setPage(1);
  }

  function setColumnNumberFilter(
    columnId: OfferColumnId,
    condition: NumberFilterCondition | null,
  ) {
    setColumnNumberFilters((prev) => {
      const next = { ...prev };
      if (!condition) delete next[columnId];
      else next[columnId] = condition;
      return next;
    });
    if (condition) {
      setColumnFilters((prev) => {
        if (!prev[columnId]?.length) return prev;
        const next = { ...prev };
        delete next[columnId];
        return next;
      });
    }
    setPage(1);
  }

  function setColumnTextFilter(columnId: OfferColumnId, value: string) {
    setColumnTextFilters((prev) => {
      const next = { ...prev };
      const trimmed = value.trim();
      if (!trimmed) delete next[columnId];
      else next[columnId] = trimmed;
      return next;
    });
    setPage(1);
  }

  function toggleSort(columnId: OfferColumnId) {
    const col = OFFER_COLUMNS.find((c) => c.id === columnId);
    if (!col?.sortable || !col.sortKey) return;
    if (sort === col.sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(col.sortKey);
      setDir("asc");
    }
    setPage(1);
  }

  function toggleColumn(id: OfferColumnId) {
    if (visibleColumns.includes(id)) {
      if (visibleColumns.length === 1) return;
      clearColumnFilterState(id);
      const nextVisible = visibleColumns.filter((x) => x !== id);
      setVisibleColumns(nextVisible);
      const col = OFFER_COLUMNS.find((c) => c.id === id);
      if (col?.sortKey && sort === col.sortKey) {
        const resolved = resolveActiveSort(sort, dir, nextVisible);
        setSort(resolved.sort);
        setDir(resolved.dir);
      }
      setPage(1);
      return;
    }
    setVisibleColumns([...visibleColumns, id]);
  }

  function reorderVisibleColumns(
    fromId: OfferColumnId,
    toId: OfferColumnId,
    edge: "before" | "after",
  ) {
    setVisibleColumns((prev) => {
      if (fromId === toId) return prev;
      const from = prev.indexOf(fromId);
      if (from < 0 || prev.indexOf(toId) < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      const to = next.indexOf(toId);
      if (to < 0) return prev;
      next.splice(edge === "before" ? to : to + 1, 0, fromId);
      return next;
    });
  }

  function onColumnDragStart(
    e: DragEvent<HTMLElement>,
    columnId: OfferColumnId,
  ) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", columnId);
    dragColIdRef.current = columnId;
    setDragColId(columnId);
  }

  function onColumnDragOver(
    e: DragEvent<HTMLTableCellElement>,
    columnId: OfferColumnId,
  ) {
    const fromId = dragColIdRef.current;
    if (!fromId || fromId === columnId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const edge: "before" | "after" =
      e.clientX < rect.left + rect.width / 2 ? "before" : "after";
    setDropTarget((prev) =>
      prev?.id === columnId && prev.edge === edge ? prev : { id: columnId, edge },
    );
  }

  function onColumnDrop(
    e: DragEvent<HTMLTableCellElement>,
    columnId: OfferColumnId,
  ) {
    e.preventDefault();
    const fromId =
      (e.dataTransfer.getData("text/plain") as OfferColumnId) ||
      dragColIdRef.current;
    if (!fromId) return;
    const edge =
      dropTarget?.id === columnId
        ? dropTarget.edge
        : (() => {
            const rect = e.currentTarget.getBoundingClientRect();
            return e.clientX < rect.left + rect.width / 2 ? "before" : "after";
          })();
    reorderVisibleColumns(fromId, columnId, edge);
    dragColIdRef.current = null;
    setDragColId(null);
    setDropTarget(null);
  }

  function onColumnDragEnd() {
    dragColIdRef.current = null;
    setDragColId(null);
    setDropTarget(null);
  }

  async function onFlagChange(
    id: number,
    flags: { top5?: boolean; issue?: boolean },
  ) {
    setFlagBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/internet-offers/${id}/flags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flags),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.error === "top5_requires_active") {
          throw new Error("TOP5 requires status Active");
        }
        throw new Error(body.error || "Flag update failed");
      }
      const updated = (await res.json()) as {
        id: number;
        top5: boolean;
        issue: boolean;
      };
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((row) =>
            row.id === updated.id
              ? {
                  ...row,
                  top5: updated.top5,
                  issue: updated.issue,
                  detectedIssues:
                    updated.top5 && row.status !== "Active"
                      ? Array.from(
                          new Set<OfferIssueCode>([
                            ...row.detectedIssues.filter(
                              (c) => c !== "top5_inactive_status",
                            ),
                            "top5_inactive_status",
                          ]),
                        )
                      : row.detectedIssues.filter(
                          (c) => c !== "top5_inactive_status",
                        ),
                }
              : row,
          ),
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Flag update failed");
    } finally {
      setFlagBusyId(null);
    }
  }

  async function onStatusChange(id: number, next: OfferStatusValue) {
    setStatusBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/internet-offers/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.error === "active_blocked" && Array.isArray(body.labels)) {
          throw new Error(
            `Cannot set Active: ${(body.labels as string[]).join("; ")}`,
          );
        }
        throw new Error(body.error || "Status update failed");
      }
      const updated = (await res.json()) as {
        id: number;
        status: OfferStatusValue;
        statusUpdatedAt: string;
      };
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((row) => {
            if (row.id !== updated.id) return row;
            const withoutTop5Inactive = row.detectedIssues.filter(
              (c) => c !== "top5_inactive_status",
            );
            const detectedIssues =
              row.top5 && updated.status !== "Active"
                ? [...withoutTop5Inactive, "top5_inactive_status" as const]
                : withoutTop5Inactive;
            return {
              ...row,
              status: updated.status,
              statusUpdatedAt: updated.statusUpdatedAt,
              detectedIssues,
            };
          }),
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status update failed");
    } finally {
      setStatusBusyId(null);
    }
  }

  async function onScanIssues() {
    setScanning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/internet-offers/scan-issues", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Issue scan failed");
      }
      const result = (await res.json()) as {
        scanned: number;
        withIssues: number;
        flagged: number;
        cleared: number;
      };
      setNotice(
        `Scan complete: ${result.withIssues} with defects · flagged ${result.flagged} · cleared ${result.cleared}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Issue scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function onExport() {
    setExporting(true);
    setError(null);
    try {
      const params = buildInternetOffersQueryParams({
        page,
        sort: activeSort.sort,
        dir: activeSort.dir,
        q,
        columnFilters: onlyVisibleColumnMap(columnFilters, visibleColumns),
        columnNumberFilters: onlyVisibleColumnMap(
          columnNumberFilters,
          visibleColumns,
        ),
        columnTextFilters: onlyVisibleColumnMap(
          columnTextFilters,
          visibleColumns,
        ),
      });
      params.delete("page");
      params.delete("pageSize");
      params.set("columns", visibleColumns.join(","));
      const res = await fetch(
        `/api/admin/internet-offers/export?${params.toString()}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] ?? "internet-offers.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const visibleDefs = visibleColumns
    .map((id) => OFFER_COLUMNS.find((c) => c.id === id))
    .filter((c): c is OfferColumnDef => Boolean(c));

  const headerMeasureKey = useMemo(
    () =>
      visibleDefs
        .map((c) => `${c.id}:${activeSort.sort === c.sortKey ? activeSort.dir : ""}`)
        .join("|"),
    [visibleDefs, activeSort],
  );

  useLayoutEffect(() => {
    setHeaderWidthsPx(null);
  }, [headerMeasureKey]);

  useLayoutEffect(() => {
    if (headerWidthsPx !== null) return;
    const table = tableRef.current;
    if (!table) return;

    const next: Partial<Record<OfferColumnId, number>> = {};
    for (const th of Array.from(
      table.querySelectorAll<HTMLTableCellElement>("thead th[data-col-id]"),
    )) {
      const id = th.dataset.colId as OfferColumnId;
      const inner = th.querySelector<HTMLElement>(".admin-th-inner");
      const cs = getComputedStyle(th);
      const padL = Number.parseFloat(cs.paddingLeft) || 0;
      const padR = Number.parseFloat(cs.paddingRight) || 0;
      const contentW = inner ? inner.scrollWidth : th.scrollWidth;
      // Fit heading + grip + filter exactly; small buffer for subpixel/sort glyph.
      next[id] = Math.ceil(contentW + padL + padR + 2);
    }
    if (Object.keys(next).length) setHeaderWidthsPx(next);
  }, [headerWidthsPx, headerMeasureKey, columnsReady]);

  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;
  const currentPage = data?.page ?? page;
  const from = total === 0 ? 0 : (currentPage - 1) * 50 + 1;
  const to = Math.min(currentPage * 50, total);

  function cellPlainTitle(row: OfferRow, columnId: OfferColumnId): string | undefined {
    switch (columnId) {
      case "providerName":
        return row.providerName;
      case "planName":
        return row.planName;
      case "connectionType":
        return row.connectionTypeLabel;
      case "status":
        return row.status;
      case "dataAllowance":
        return row.dataAllowance;
      case "targetPostcode":
        return row.targetPostcode;
      case "networkOwner":
        return row.networkOwner;
      case "statusUpdatedAt":
        return formatDateTime(row.statusUpdatedAt);
      case "lastUpdated":
        return formatDateTime(row.lastUpdated);
      case "deepLinkUrl":
        return row.deepLinkUrl ?? undefined;
      case "bundledPerksNotes":
        return row.bundledPerksNotes ?? undefined;
      default:
        return undefined;
    }
  }

  function renderCell(row: OfferRow, columnId: OfferColumnId) {
    switch (columnId) {
      case "id":
        return row.id;
      case "top5":
        return (
          <input
            type="checkbox"
            className="admin-flag-check"
            checked={row.top5}
            disabled={flagBusyId === row.id}
            onChange={(e) => void onFlagChange(row.id, { top5: e.target.checked })}
            aria-label={`TOP5 for offer ${row.id}`}
          />
        );
      case "issue": {
        const labels = (row.detectedIssues ?? []).map(
          (code) => OFFER_ISSUE_LABELS[code],
        );
        const title =
          labels.length > 0
            ? labels.join("\n")
            : row.issue
              ? "Manually flagged"
              : "No defects detected";
        return (
          <span className="admin-issue-cell" title={title}>
            <input
              type="checkbox"
              className="admin-flag-check"
              checked={row.issue}
              disabled={flagBusyId === row.id}
              onChange={(e) =>
                void onFlagChange(row.id, { issue: e.target.checked })
              }
              aria-label={`ISSUE for offer ${row.id}`}
            />
            {labels.length > 0 && (
              <span className="admin-issue-count" aria-label={`${labels.length} defects`}>
                {labels.length}
              </span>
            )}
          </span>
        );
      }
      case "status":
        return (
          <select
            className="admin-status-select"
            value={row.status}
            disabled={statusBusyId === row.id}
            onChange={(e) =>
              void onStatusChange(row.id, e.target.value as OfferStatusValue)
            }
            aria-label={`Status for offer ${row.id}`}
          >
            {OFFER_STATUS_VALUES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        );
      case "statusUpdatedAt":
        return formatDateTime(row.statusUpdatedAt);
      case "lastUpdated":
        return formatDateTime(row.lastUpdated);
      case "providerName":
        return row.providerName;
      case "planName":
        return row.planName;
      case "connectionType":
        return row.connectionTypeLabel;
      case "maxDownloadSpeed":
      case "typicalEveningSpeed":
      case "uploadSpeed":
      case "promoDurationMonths":
      case "contractTermMonths":
        return row[columnId];
      case "ongoingMonthlyCost":
      case "promoMonthlyCost":
      case "modemCost":
      case "setupFee":
      case "exitFee":
      case "calculatedFirstYearTotalCostAud":
      case "yearTwoTotalCostAud":
      case "calculatedTrueAverageMonthlyCostAud":
        return money(row[columnId]);
      case "calculatedCostPerMbpsMetric":
        return row.calculatedCostPerMbpsMetric.toFixed(4);
      case "dataAllowance":
        return row.dataAllowance;
      case "targetPostcode":
        return row.targetPostcode;
      case "networkOwner":
        return row.networkOwner;
      case "deepLinkUrl":
        return row.deepLinkUrl ? (
          <a href={row.deepLinkUrl} target="_blank" rel="noreferrer">
            Open
          </a>
        ) : (
          "—"
        );
      case "bundledPerksNotes":
        return row.bundledPerksNotes ?? "—";
      default:
        return "—";
    }
  }

  return (
    <div className="admin-offers">
      <div className="panel-head">
        <div>
          <h1 className="page-title">Internet market offers</h1>
          <p className="muted" style={{ margin: 0 }}>
            Review catalog quality, filter to a plan, and update status. Signed in as{" "}
            <strong style={{ color: "var(--fg)" }}>{userEmail}</strong>
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <form
          className="admin-toolbar-form"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qDraft.trim());
            setPage(1);
          }}
        >
          <label className="admin-search">
            <span className="admin-sr-only">Search</span>
            <span className="admin-search-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              className="admin-search-input"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="Search provider or plan"
            />
          </label>
          <div className="admin-toolbar-actions">
            <button type="submit" className="admin-toolbar-apply">
              Apply
            </button>
            <button
              type="button"
              className="admin-toolbar-clear"
              onClick={resetFilters}
            >
              Clear
            </button>
          </div>
          <div
            className="admin-toolbar-tools"
            role="toolbar"
            aria-label="Offer tools"
          >
            <button
              type="button"
              className="admin-icon-btn"
              disabled={scanning || loading}
              onClick={() => void onScanIssues()}
              title="Scan for Issues"
              aria-label={
                scanning
                  ? "Scanning for issues"
                  : "Scan for Issues and sync the ISSUE flag"
              }
            >
              {scanning ? <SpinnerIcon /> : <ScanIcon />}
            </button>
            <button
              type="button"
              className={
                showColumns
                  ? "admin-icon-btn admin-icon-btn--active"
                  : "admin-icon-btn"
              }
              onClick={() => setShowColumns((v) => !v)}
              title="Columns"
              aria-label="Toggle columns"
              aria-pressed={showColumns}
            >
              <ColumnsIcon />
            </button>
            <button
              type="button"
              className="admin-icon-btn"
              disabled={exporting || loading}
              onClick={() => void onExport()}
              title="Export to Excel"
              aria-label={exporting ? "Exporting to Excel" : "Export to Excel"}
            >
              {exporting ? <SpinnerIcon /> : <ExportIcon />}
            </button>
          </div>
        </form>

        {showColumns && (
          <div className="admin-columns-panel">
            <div className="admin-columns-panel-head">
              <strong>Visible columns</strong>
              <button
                type="button"
                className="admin-columns-close"
                onClick={() => setShowColumns(false)}
                aria-label="Close columns panel"
              >
                ×
              </button>
            </div>
            <div className="admin-columns-grid">
              {OFFER_COLUMNS.map((col) => (
                <label key={col.id} className="admin-check" title={col.label}>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(col.id)}
                    onChange={() => toggleColumn(col.id)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {notice && !error && <p className="admin-notice">{notice}</p>}

      <div className="admin-table-wrap">
        <table
          ref={tableRef}
          className={
            headerWidthsPx
              ? "admin-table admin-table--sized"
              : "admin-table"
          }
        >
          <thead>
            <tr>
              {visibleDefs.map((col) => {
                const widthPx = headerWidthsPx?.[col.id];
                const thClass = [
                  "admin-col",
                  `admin-col--${col.valueKind}`,
                  col.align === "right"
                    ? "num"
                    : col.align === "center"
                      ? "center"
                      : "",
                  dragColId === col.id ? "admin-th-dragging" : "",
                  dropTarget?.id === col.id
                    ? `admin-th-drop-${dropTarget.edge}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <th
                    key={col.id}
                    data-col-id={col.id}
                    className={thClass}
                    style={
                      widthPx != null
                        ? ({ "--admin-col-w": `${widthPx}px` } as CSSProperties)
                        : undefined
                    }
                    title={col.label}
                    onDragOver={(e) => onColumnDragOver(e, col.id)}
                    onDrop={(e) => onColumnDrop(e, col.id)}
                  >
                    <span className="admin-th-inner">
                      <span
                        className="admin-col-grip"
                        draggable
                        title="Drag to reorder column"
                        aria-label={`Reorder ${col.label} column`}
                        onDragStart={(e) => onColumnDragStart(e, col.id)}
                        onDragEnd={onColumnDragEnd}
                      >
                        ⋮⋮
                      </span>
                      {col.sortable ? (
                        <button
                          type="button"
                          className="admin-sort-btn"
                          onClick={() => toggleSort(col.id)}
                        >
                          {col.label}
                          {activeSort.sort === col.sortKey ? (
                            <span className="admin-sort-arrow" aria-hidden="true">
                              {activeSort.dir === "asc" ? "↑" : "↓"}
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <span className="admin-th-label">{col.label}</span>
                      )}
                      {(() => {
                        const filterKind = columnFilterKind(col);
                        if (filterKind === "facet" && isFacetFieldId(col.id)) {
                          return (
                            <ColumnFacetFilter
                              label={col.label}
                              facetField={col.id}
                              formatLabel={(value) =>
                                facetFormatLabel(col.id, value)
                              }
                              selected={columnFilters[col.id] ?? []}
                              onChange={(next) =>
                                setColumnFacetFilter(col.id, next)
                              }
                            />
                          );
                        }
                        if (filterKind === "date" && isFacetFieldId(col.id)) {
                          return (
                            <ColumnDateFilter
                              label={col.label}
                              facetField={col.id}
                              selected={columnFilters[col.id] ?? []}
                              onChange={(next) =>
                                setColumnFacetFilter(col.id, next)
                              }
                            />
                          );
                        }
                        if (filterKind === "number" && isFacetFieldId(col.id)) {
                          return (
                            <ColumnNumberFilter
                              label={col.label}
                              facetField={col.id}
                              formatLabel={(value) =>
                                facetFormatLabel(col.id, value)
                              }
                              selected={columnFilters[col.id] ?? []}
                              onSelectedChange={(next) =>
                                setColumnFacetFilter(col.id, next)
                              }
                              condition={columnNumberFilters[col.id] ?? null}
                              onConditionChange={(next) =>
                                setColumnNumberFilter(col.id, next)
                              }
                            />
                          );
                        }
                        if (filterKind === "text") {
                          return (
                            <ColumnTextFilter
                              label={col.label}
                              value={columnTextFilters[col.id] ?? ""}
                              onChange={(next) =>
                                setColumnTextFilter(col.id, next)
                              }
                              placeholder={
                                col.valueKind === "url"
                                  ? "URL contains…"
                                  : "Contains…"
                              }
                            />
                          );
                        }
                        return null;
                      })()}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={visibleDefs.length} className="muted">
                  Loading offers…
                </td>
              </tr>
            )}
            {!loading && data && data.rows.length === 0 && (
              <tr>
                <td colSpan={visibleDefs.length} className="muted">
                  No offers match the current filters.
                </td>
              </tr>
            )}
            {!loading &&
              data?.rows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    row.issue || (row.detectedIssues?.length ?? 0) > 0
                      ? "admin-row-issue"
                      : undefined
                  }
                >
                  {visibleDefs.map((col) => {
                    const widthPx = headerWidthsPx?.[col.id];
                    const tdClass = [
                      "admin-col",
                      `admin-col--${col.valueKind}`,
                      columnClipsContent(col) ? "admin-col--clip" : "",
                      col.align === "right"
                        ? "num"
                        : col.align === "center"
                          ? "center"
                          : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td
                        key={col.id}
                        className={tdClass}
                        style={
                          widthPx != null
                            ? ({ "--admin-col-w": `${widthPx}px` } as CSSProperties)
                            : undefined
                        }
                        title={
                          columnClipsContent(col)
                            ? cellPlainTitle(row, col.id)
                            : undefined
                        }
                      >
                        {renderCell(row, col.id)}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="admin-pager">
        <span className="muted">
          Showing {from}–{to} of {total} · Page {currentPage} of {pageCount}
        </span>
        <div className="admin-pager-controls">
          <button
            type="button"
            className="secondary"
            disabled={currentPage <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <label className="admin-jump">
            Go to
            <input
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Number(jumpPage);
                  if (Number.isInteger(n) && n >= 1 && n <= pageCount) {
                    setPage(n);
                  }
                }
              }}
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={currentPage >= pageCount || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6.8 1.5a5.3 5.3 0 0 1 4.2 8.5l2.9 2.9a.75.75 0 1 1-1.06 1.06l-2.9-2.9A5.3 5.3 0 1 1 6.8 1.5Zm0 1.5a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"
      />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M9 2.25a.9.9 0 0 1 .9.9v7.7a.9.9 0 0 1-1.8 0V3.15a.9.9 0 0 1 .9-.9Zm0 11.05a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Z"
      />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M9 3.75c3.25 0 5.95 2.05 7.2 5.05a.75.75 0 0 1 0 .7C14.95 12.5 12.25 14.55 9 14.55S3.05 12.5 1.8 9.5a.75.75 0 0 1 0-.7C3.05 5.8 5.75 3.75 9 3.75Zm0 1.5c-2.5 0-4.65 1.5-5.75 3.9 1.1 2.4 3.25 3.9 5.75 3.9s4.65-1.5 5.75-3.9C13.65 6.75 11.5 5.25 9 5.25Zm0 1.65a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Z"
      />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M9 2.25a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 1.06-1.06l1.72 1.72V3a.75.75 0 0 1 .75-.75ZM3.5 11.5a.75.75 0 0 1 .75.75v1.5c0 .14.11.25.25.25h9c.14 0 .25-.11.25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 13.5 15.5h-9A1.75 1.75 0 0 1 2.75 13.75v-1.5a.75.75 0 0 1 .75-.75Z"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="admin-icon-spin"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M9 2.25a6.75 6.75 0 1 1-6.53 8.4.75.75 0 1 1 1.45-.38A5.25 5.25 0 1 0 9 3.75V2.25Z"
      />
    </svg>
  );
}
