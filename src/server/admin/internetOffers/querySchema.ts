import { z } from "zod";
import {
  FACET_FILTER_COLUMN_IDS,
  SORTABLE_COLUMN_IDS,
  SPEED_TIER_VALUES,
  TEXT_FILTER_COLUMN_IDS,
} from "./columns";
import {
  NUMBER_FILTER_COLUMN_IDS,
  type NumberFilterColumnId,
} from "./numberFilterColumns";

const sortEnum = z.enum(
  SORTABLE_COLUMN_IDS as [string, ...string[]],
);

/** Comma-separated multi-value column filters (and single toolbar values). */
const csvString = z.string().trim().max(2000).optional().default("");

const numberFilterOp = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
]);

export type NumberFilterOp = z.infer<typeof numberFilterOp>;

const baseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(50),
  sort: sortEnum.default("calculatedTrueAverageMonthlyCostAud"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().trim().max(200).optional().default(""),
  postcode: z.string().trim().max(16).optional(),
  /** Toolbar single speed (max download). */
  speed: z.coerce
    .number()
    .refine((n) => (SPEED_TIER_VALUES as readonly number[]).includes(n), {
      message: "Invalid speed tier",
    })
    .optional(),
  /** Column multi-select of calendar days YYYY-MM-DD (Status at). */
  statusUpdatedAt: csvString,
  /** Column multi-select of calendar days YYYY-MM-DD (Plan at). */
  lastUpdated: csvString,
  issuesOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  top5Only: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

type FacetFilterQueryFields = {
  [K in (typeof FACET_FILTER_COLUMN_IDS)[number]]: string;
};

type TextFilterQueryFields = {
  [K in (typeof TEXT_FILTER_COLUMN_IDS)[number]]: string;
};

type NumberFilterQueryFields = {
  [K in NumberFilterColumnId]: string;
} & {
  [K in NumberFilterColumnId as `${K}Op`]?: NumberFilterOp;
} & {
  [K in NumberFilterColumnId as `${K}Min`]?: number;
} & {
  [K in NumberFilterColumnId as `${K}Max`]?: number;
};

export type InternetOffersQuery = z.infer<typeof baseQuerySchema> &
  FacetFilterQueryFields &
  TextFilterQueryFields &
  NumberFilterQueryFields;

const QUERY_KEYS = [
  "page",
  "pageSize",
  "sort",
  "dir",
  "q",
  "postcode",
  "speed",
  "statusUpdatedAt",
  "lastUpdated",
  "issuesOnly",
  "top5Only",
  ...FACET_FILTER_COLUMN_IDS,
  ...TEXT_FILTER_COLUMN_IDS,
  ...NUMBER_FILTER_COLUMN_IDS.flatMap((id) => [
    id,
    `${id}Op`,
    `${id}Min`,
    `${id}Max`,
  ]),
] as const;

function parseFacetFields(
  raw: Record<string, string>,
): FacetFilterQueryFields {
  const data = {} as FacetFilterQueryFields;
  for (const id of FACET_FILTER_COLUMN_IDS) {
    data[id] = raw[id]?.trim() ?? "";
  }
  return data;
}

function parseTextFields(
  raw: Record<string, string>,
): { ok: true; data: TextFilterQueryFields } | { ok: false; error: string } {
  const data = {} as TextFilterQueryFields;
  for (const id of TEXT_FILTER_COLUMN_IDS) {
    const value = raw[id]?.trim() ?? "";
    if (value.length > 200) {
      return { ok: false, error: `invalid_${id}` };
    }
    data[id] = value;
  }
  return { ok: true, data };
}

function parseNumberFilterFields(
  raw: Record<string, string>,
): { ok: true; data: NumberFilterQueryFields } | { ok: false; error: string } {
  const data = {} as NumberFilterQueryFields;

  for (const id of NUMBER_FILTER_COLUMN_IDS) {
    data[id] = raw[id]?.trim() ?? "";

    const opRaw = raw[`${id}Op`];
    if (opRaw) {
      const opParsed = numberFilterOp.safeParse(opRaw);
      if (!opParsed.success) {
        return { ok: false, error: `invalid_${id}Op` };
      }
      data[`${id}Op`] = opParsed.data;
    }

    const minRaw = raw[`${id}Min`];
    if (minRaw != null && minRaw !== "") {
      const min = Number(minRaw);
      if (!Number.isFinite(min)) {
        return { ok: false, error: `invalid_${id}Min` };
      }
      data[`${id}Min`] = min;
    }

    const maxRaw = raw[`${id}Max`];
    if (maxRaw != null && maxRaw !== "") {
      const max = Number(maxRaw);
      if (!Number.isFinite(max)) {
        return { ok: false, error: `invalid_${id}Max` };
      }
      data[`${id}Max`] = max;
    }
  }

  return { ok: true, data };
}

export function parseInternetOffersQuery(
  searchParams: URLSearchParams,
): { ok: true; data: InternetOffersQuery } | { ok: false; error: string } {
  const raw: Record<string, string> = {};
  for (const key of QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value != null && value !== "") raw[key] = value;
  }

  const parsed = baseQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.flatten().formErrors.join("; ") || "invalid_query",
    };
  }

  const numberFields = parseNumberFilterFields(raw);
  if (!numberFields.ok) return numberFields;

  const textFields = parseTextFields(raw);
  if (!textFields.ok) return textFields;

  return {
    ok: true,
    data: {
      ...parsed.data,
      ...parseFacetFields(raw),
      ...textFields.data,
      ...numberFields.data,
    },
  };
}
