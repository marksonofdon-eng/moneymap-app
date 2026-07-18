import {
  InternetOfferStatus,
  type InternetMarketOffer,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type { InternetOffersQuery } from "@/server/admin/internetOffers/querySchema";
import {
  CONNECTION_TYPE_VALUES,
  DATA_ALLOWANCE_VALUES,
  OFFER_STATUS_VALUES,
  TEXT_FILTER_COLUMN_IDS,
  connectionTypeLabel,
} from "@/lib/internetOffersColumns";
import {
  NUMBER_FILTER_COLUMN_IDS,
  NUMBER_FILTER_PRISMA_FIELD,
  type NumberFilterColumnId,
} from "@/server/admin/internetOffers/numberFilterColumns";
import {
  evaluateOfferIssues,
  hasHardBlockForActive,
  summarizeIssues,
  type OfferIssueCode,
  type OfferIssueInput,
} from "@/server/admin/internetOffers/issueRules";

const EXPORT_ROW_CAP = 10_000;

export type InternetOfferListRow = {
  id: number;
  top5: boolean;
  issue: boolean;
  status: InternetOfferStatus;
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

function dec(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value.toString());
}

function serializeOffer(
  row: InternetMarketOffer,
  detectedIssues: OfferIssueCode[] = [],
): InternetOfferListRow {
  const ongoing = dec(row.ongoingMonthlyCost);
  return {
    id: row.id,
    top5: row.top5,
    issue: row.issue,
    status: row.status,
    statusUpdatedAt: row.statusUpdatedAt.toISOString(),
    lastUpdated: row.lastUpdated.toISOString(),
    providerName: row.providerName,
    planName: row.planName,
    connectionType: row.connectionType,
    connectionTypeLabel: connectionTypeLabel(row.connectionType),
    maxDownloadSpeed: row.maxDownloadSpeed,
    typicalEveningSpeed: row.typicalEveningSpeed,
    uploadSpeed: row.uploadSpeed,
    ongoingMonthlyCost: ongoing,
    promoMonthlyCost: dec(row.promoMonthlyCost),
    promoDurationMonths: row.promoDurationMonths,
    modemCost: dec(row.modemCost),
    setupFee: dec(row.setupFee),
    exitFee: dec(row.exitFee),
    dataAllowance: row.dataAllowance,
    contractTermMonths: row.contractTermMonths,
    targetPostcode: row.targetPostcode,
    networkOwner: row.networkOwner,
    calculatedFirstYearTotalCostAud: dec(row.calculatedFirstYearTotalCostAud),
    yearTwoTotalCostAud: Number((ongoing * 12).toFixed(2)),
    calculatedTrueAverageMonthlyCostAud: dec(
      row.calculatedTrueAverageMonthlyCostAud,
    ),
    calculatedCostPerMbpsMetric: dec(row.calculatedCostPerMbpsMetric),
    deepLinkUrl: row.deepLinkUrl,
    bundledPerksNotes: row.bundledPerksNotes,
    detectedIssues,
  };
}

function toIssueInput(row: InternetMarketOffer): OfferIssueInput {
  return {
    id: row.id,
    providerName: row.providerName,
    planName: row.planName,
    connectionType: row.connectionType,
    status: row.status,
    top5: row.top5,
    maxDownloadSpeed: row.maxDownloadSpeed,
    typicalEveningSpeed: row.typicalEveningSpeed,
    uploadSpeed: row.uploadSpeed,
    promoDurationMonths: row.promoDurationMonths,
    ongoingMonthlyCost: dec(row.ongoingMonthlyCost),
    promoMonthlyCost: dec(row.promoMonthlyCost),
    modemCost: dec(row.modemCost),
    setupFee: dec(row.setupFee),
    exitFee: dec(row.exitFee),
    calculatedFirstYearTotalCostAud: dec(row.calculatedFirstYearTotalCostAud),
    calculatedTrueAverageMonthlyCostAud: dec(
      row.calculatedTrueAverageMonthlyCostAud,
    ),
    calculatedCostPerMbpsMetric: dec(row.calculatedCostPerMbpsMetric),
    deepLinkUrl: row.deepLinkUrl,
  };
}

async function loadDuplicateOfferIds(): Promise<Set<number>> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT o.id
    FROM internet_market_offers o
    INNER JOIN (
      SELECT provider_name, plan_name, connection_type
      FROM internet_market_offers
      GROUP BY provider_name, plan_name, connection_type
      HAVING COUNT(*) > 1
    ) d
      ON o.provider_name = d.provider_name
     AND o.plan_name = d.plan_name
     AND o.connection_type = d.connection_type
  `;
  return new Set(rows.map((r) => r.id));
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildWhere(
  query: InternetOffersQuery,
): Prisma.InternetMarketOfferWhereInput {
  const where: Prisma.InternetMarketOfferWhereInput = {};
  const and: Prisma.InternetMarketOfferWhereInput[] = [];

  if (query.q) {
    and.push({
      OR: [
        { providerName: { contains: query.q, mode: "insensitive" } },
        { planName: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }

  applyStringEqualsFacet(and, splitCsv(query.providerName), "providerName");
  applyStringEqualsFacet(and, splitCsv(query.planName), "planName");
  applyStringEqualsFacet(and, splitCsv(query.networkOwner), "networkOwner");

  const connectionTypes = splitCsv(query.connectionType).filter((v) =>
    (CONNECTION_TYPE_VALUES as readonly string[]).includes(v),
  );
  if (connectionTypes.length === 1) {
    and.push({ connectionType: connectionTypes[0] as never });
  } else if (connectionTypes.length > 1) {
    and.push({ connectionType: { in: connectionTypes as never[] } });
  }

  const dataAllowances = splitCsv(query.dataAllowance).filter((v) =>
    (DATA_ALLOWANCE_VALUES as readonly string[]).includes(v),
  );
  if (dataAllowances.length === 1) {
    and.push({ dataAllowance: dataAllowances[0] as never });
  } else if (dataAllowances.length > 1) {
    and.push({ dataAllowance: { in: dataAllowances as never[] } });
  }

  const statuses = splitCsv(query.status).filter((v) =>
    (OFFER_STATUS_VALUES as readonly string[]).includes(v),
  );
  if (statuses.length === 1) {
    and.push({ status: statuses[0] as never });
  } else if (statuses.length > 1) {
    and.push({ status: { in: statuses as never[] } });
  }

  const postcodes = splitCsv(query.targetPostcode);
  if (postcodes.length) {
    applyStringEqualsFacet(and, postcodes, "targetPostcode");
  } else if (query.postcode) {
    and.push({
      targetPostcode: { equals: query.postcode, mode: "insensitive" },
    });
  }

  const downHasColumnFilter = applyNumberColumnFilter(
    and,
    query,
    "maxDownloadSpeed",
  );
  if (!downHasColumnFilter && query.speed != null) {
    and.push({ maxDownloadSpeed: query.speed });
  }

  for (const columnId of NUMBER_FILTER_COLUMN_IDS) {
    if (columnId === "maxDownloadSpeed") continue;
    applyNumberColumnFilter(and, query, columnId);
  }

  const top5Facet = parseBoolFacet(query.top5);
  if (top5Facet !== null) {
    and.push({ top5: top5Facet });
  } else if (query.top5Only) {
    and.push({ top5: true });
  }

  const issueFacet = parseBoolFacet(query.issue);
  if (issueFacet !== null) {
    and.push({ issue: issueFacet });
  } else if (query.issuesOnly) {
    and.push({ issue: true });
  }

  const statusDays = parseDayKeys(query.statusUpdatedAt);
  if (statusDays.length) {
    and.push({
      OR: statusDays.map((day) => {
        const { gte, lt } = utcDayBounds(day);
        return { statusUpdatedAt: { gte, lt } };
      }),
    });
  }

  const planDays = parseDayKeys(query.lastUpdated);
  if (planDays.length) {
    and.push({
      OR: planDays.map((day) => {
        const { gte, lt } = utcDayBounds(day);
        return { lastUpdated: { gte, lt } };
      }),
    });
  }

  for (const columnId of TEXT_FILTER_COLUMN_IDS) {
    const needle = (query[columnId] as string | undefined)?.trim();
    if (!needle) continue;
    if (columnId === "deepLinkUrl") {
      and.push({ deepLinkUrl: { contains: needle, mode: "insensitive" } });
    } else if (columnId === "bundledPerksNotes") {
      and.push({
        bundledPerksNotes: { contains: needle, mode: "insensitive" },
      });
    }
  }

  if (and.length) where.AND = and;
  return where;
}

function applyStringEqualsFacet(
  and: Prisma.InternetMarketOfferWhereInput[],
  values: string[],
  field: "providerName" | "planName" | "networkOwner" | "targetPostcode",
) {
  if (values.length === 1) {
    and.push({
      [field]: { equals: values[0], mode: "insensitive" },
    } as Prisma.InternetMarketOfferWhereInput);
  } else if (values.length > 1) {
    and.push({
      OR: values.map((name) => ({
        [field]: { equals: name, mode: "insensitive" as const },
      })),
    });
  }
}

/** Returns true when a column number filter (rule or values) was applied. */
function applyNumberColumnFilter(
  and: Prisma.InternetMarketOfferWhereInput[],
  query: InternetOffersQuery,
  columnId: NumberFilterColumnId,
): boolean {
  const opKey = `${columnId}Op` as keyof InternetOffersQuery;
  const minKey = `${columnId}Min` as keyof InternetOffersQuery;
  const maxKey = `${columnId}Max` as keyof InternetOffersQuery;
  const op = query[opKey] as string | undefined;
  const min = query[minKey] as number | undefined;
  const max = query[maxKey] as number | undefined;
  const rule = buildNumberRule(op, min, max);
  const prismaField = NUMBER_FILTER_PRISMA_FIELD[columnId];

  if (rule) {
    if (prismaField === "yearTwo") {
      and.push({ ongoingMonthlyCost: scaleNumberRule(rule, 1 / 12) });
    } else {
      and.push({ [prismaField]: rule } as Prisma.InternetMarketOfferWhereInput);
    }
    return true;
  }

  const values = splitCsv(query[columnId] as string | undefined)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  if (values.length === 0) return false;

  if (prismaField === "yearTwo") {
    const ongoingValues = values.map((v) => Number((v / 12).toFixed(2)));
    if (ongoingValues.length === 1) {
      and.push({ ongoingMonthlyCost: ongoingValues[0] });
    } else {
      and.push({ ongoingMonthlyCost: { in: ongoingValues } });
    }
    return true;
  }

  if (values.length === 1) {
    and.push({ [prismaField]: values[0] } as Prisma.InternetMarketOfferWhereInput);
  } else {
    and.push({
      [prismaField]: { in: values },
    } as Prisma.InternetMarketOfferWhereInput);
  }
  return true;
}

function buildNumberRule(
  op: string | undefined,
  min: number | undefined,
  max: number | undefined,
): Prisma.IntFilter | Prisma.DecimalFilter | number | undefined {
  if (!op || min == null || !Number.isFinite(min)) return undefined;
  switch (op) {
    case "eq":
      return min;
    case "neq":
      return { not: min };
    case "gt":
      return { gt: min };
    case "gte":
      return { gte: min };
    case "lt":
      return { lt: min };
    case "lte":
      return { lte: min };
    case "between": {
      if (max == null || !Number.isFinite(max)) return undefined;
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return { gte: lo, lte: hi };
    }
    default:
      return undefined;
  }
}

/** Scale a number rule (e.g. year-two dollars → monthly). */
function scaleNumberRule(
  rule: Prisma.IntFilter | Prisma.DecimalFilter | number,
  factor: number,
): Prisma.DecimalFilter | number {
  if (typeof rule === "number") return Number((rule * factor).toFixed(4));
  const next: Prisma.DecimalFilter = {};
  if ("not" in rule && rule.not != null && typeof rule.not === "number") {
    next.not = Number((rule.not * factor).toFixed(4));
  }
  if ("gt" in rule && rule.gt != null && typeof rule.gt === "number") {
    next.gt = Number((rule.gt * factor).toFixed(4));
  }
  if ("gte" in rule && rule.gte != null && typeof rule.gte === "number") {
    next.gte = Number((rule.gte * factor).toFixed(4));
  }
  if ("lt" in rule && rule.lt != null && typeof rule.lt === "number") {
    next.lt = Number((rule.lt * factor).toFixed(4));
  }
  if ("lte" in rule && rule.lte != null && typeof rule.lte === "number") {
    next.lte = Number((rule.lte * factor).toFixed(4));
  }
  return next;
}

/** Returns a single boolean when exactly one of true/false is selected; else null. */
function parseBoolFacet(value: string | undefined): boolean | null {
  const tokens = splitCsv(value).filter((v) => v === "true" || v === "false");
  const unique = [...new Set(tokens.map((v) => v === "true"))];
  return unique.length === 1 ? unique[0]! : null;
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDayKeys(value: string | undefined): string[] {
  return [...new Set(splitCsv(value).filter((v) => DAY_KEY_RE.test(v)))];
}

function utcDayBounds(day: string): { gte: Date; lt: Date } {
  const gte = new Date(`${day}T00:00:00.000Z`);
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

function buildOrderBy(
  query: InternetOffersQuery,
): Prisma.InternetMarketOfferOrderByWithRelationInput {
  if (query.sort === "yearTwoTotalCostAud") {
    return { ongoingMonthlyCost: query.dir };
  }
  const sort =
    query.sort as keyof Prisma.InternetMarketOfferOrderByWithRelationInput;
  return { [sort]: query.dir };
}

export async function listInternetOffers(query: InternetOffersQuery) {
  const where = buildWhere(query);
  const orderBy = buildOrderBy(query);

  const [total, pageRows, duplicateIds] = await Promise.all([
    prisma.internetMarketOffer.count({ where }),
    prisma.internetMarketOffer.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    loadDuplicateOfferIds(),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / query.pageSize) || 1);

  return {
    rows: pageRows.map((row) => {
      const detectedIssues = evaluateOfferIssues(
        toIssueInput(row),
        duplicateIds,
      );
      return serializeOffer(row, detectedIssues);
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: total === 0 ? 1 : pageCount,
  };
}

export async function exportInternetOffers(query: InternetOffersQuery) {
  const where = buildWhere(query);
  const orderBy = buildOrderBy(query);

  const matched = await prisma.internetMarketOffer.findMany({
    where,
    orderBy,
    take: EXPORT_ROW_CAP + 1,
  });

  if (matched.length > EXPORT_ROW_CAP) {
    return { ok: false as const, error: "export_too_large", cap: EXPORT_ROW_CAP };
  }

  return { ok: true as const, rows: matched.map((row) => serializeOffer(row)) };
}

/** Update status only. Never touches lastUpdated. */
export async function updateInternetOfferStatus(
  id: number,
  status: InternetOfferStatus,
): Promise<
  | {
      ok: true;
      data: {
        id: number;
        status: InternetOfferStatus;
        statusUpdatedAt: string;
      };
    }
  | { ok: false; error: "not_found" }
  | {
      ok: false;
      error: "active_blocked";
      issues: OfferIssueCode[];
    }
> {
  const existing = await prisma.internetMarketOffer.findUnique({
    where: { id },
  });
  if (!existing) return { ok: false, error: "not_found" };

  if (existing.status === status) {
    return {
      ok: true,
      data: {
        id: existing.id,
        status: existing.status,
        statusUpdatedAt: existing.statusUpdatedAt.toISOString(),
      },
    };
  }

  if (status === InternetOfferStatus.Active) {
    const duplicateIds = await loadDuplicateOfferIds();
    const issues = evaluateOfferIssues(toIssueInput(existing), duplicateIds);
    if (hasHardBlockForActive(issues)) {
      return { ok: false, error: "active_blocked", issues };
    }
  }

  const updated = await prisma.internetMarketOffer.update({
    where: { id },
    data: { status, statusUpdatedAt: new Date() },
    select: { id: true, status: true, statusUpdatedAt: true },
  });

  return {
    ok: true,
    data: {
      id: updated.id,
      status: updated.status,
      statusUpdatedAt: updated.statusUpdatedAt.toISOString(),
    },
  };
}

/** Update TOP5 / ISSUE flags only. Never touches lastUpdated. */
export async function updateInternetOfferFlags(
  id: number,
  flags: { top5?: boolean; issue?: boolean },
): Promise<
  | { ok: true; data: { id: number; top5: boolean; issue: boolean } }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "top5_requires_active" }
> {
  const existing = await prisma.internetMarketOffer.findUnique({
    where: { id },
    select: { id: true, top5: true, issue: true, status: true },
  });
  if (!existing) return { ok: false, error: "not_found" };

  if (flags.top5 === true && existing.status !== InternetOfferStatus.Active) {
    return { ok: false, error: "top5_requires_active" };
  }

  const data: { top5?: boolean; issue?: boolean } = {};
  if (typeof flags.top5 === "boolean" && flags.top5 !== existing.top5) {
    data.top5 = flags.top5;
  }
  if (typeof flags.issue === "boolean" && flags.issue !== existing.issue) {
    data.issue = flags.issue;
  }

  if (Object.keys(data).length === 0) {
    return {
      ok: true,
      data: { id: existing.id, top5: existing.top5, issue: existing.issue },
    };
  }

  const updated = await prisma.internetMarketOffer.update({
    where: { id },
    data,
    select: { id: true, top5: true, issue: true },
  });

  return { ok: true, data: updated };
}

/**
 * Evaluate defect rules across the catalog and sync the ISSUE flag.
 * Sets issue=true when any rule fires; clears when none fire.
 */
export async function scanInternetOfferIssues() {
  const [rows, duplicateIds] = await Promise.all([
    prisma.internetMarketOffer.findMany(),
    loadDuplicateOfferIds(),
  ]);

  const evaluated = rows.map((row) => {
    const issues = evaluateOfferIssues(toIssueInput(row), duplicateIds);
    return { id: row.id, issue: row.issue, issues };
  });

  const toFlag = evaluated.filter((r) => r.issues.length > 0 && !r.issue);
  const toClear = evaluated.filter((r) => r.issues.length === 0 && r.issue);

  const ops = [
    ...toFlag.map((r) =>
      prisma.internetMarketOffer.update({
        where: { id: r.id },
        data: { issue: true },
      }),
    ),
    ...toClear.map((r) =>
      prisma.internetMarketOffer.update({
        where: { id: r.id },
        data: { issue: false },
      }),
    ),
  ];

  // Chunk to avoid oversized transactions.
  const CHUNK = 100;
  for (let i = 0; i < ops.length; i += CHUNK) {
    await prisma.$transaction(ops.slice(i, i + CHUNK));
  }

  const withIssues = evaluated.filter((r) => r.issues.length > 0);
  return {
    scanned: rows.length,
    withIssues: withIssues.length,
    flagged: toFlag.length,
    cleared: toClear.length,
    summary: summarizeIssues(withIssues),
  };
}

export { EXPORT_ROW_CAP };
