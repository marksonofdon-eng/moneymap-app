import { createHash } from "node:crypto";
import { Prisma, type IncomeSourceKind } from "@prisma/client";
import { createIncomeSummary } from "@/server/basiq";
import { getIngestPrisma } from "@/server/data/dbContext";
import {
  CREDIT_MATCHER_VERSION,
  incomeCategoryFromApiSource,
} from "@/server/taxonomy/creditTaxonomy";

export type IncomeSyncRun = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  reportId?: string;
  sourcesUpserted?: number;
  transactionsAnnotated?: number;
};

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sourceStableId(
  reportId: string,
  kind: IncomeSourceKind,
  source: string,
): string {
  const digest = createHash("sha1")
    .update(`${reportId}|${kind}|${source}`)
    .digest("hex")
    .slice(0, 24);
  return `incsrc_${digest}`;
}

function normalizeSourceText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type HistoryHit = {
  sourceId: string;
  parentCategory: string;
  incomeCategory: string;
  flowType: "INCOME" | "TRANSFER" | "OTHER";
  amount: number;
  date: Date;
  sourceText: string;
};

function collectHistoryHits(
  sources: Array<{
    id: string;
    parentCategory: string;
    incomeCategory: string;
    flowType: "INCOME" | "TRANSFER" | "OTHER";
    rawPayload: unknown;
  }>,
): HistoryHit[] {
  const hits: HistoryHit[] = [];
  for (const source of sources) {
    if (!isRecord(source.rawPayload)) continue;
    const history = source.rawPayload.changeHistory;
    if (!Array.isArray(history)) continue;
    for (const row of history) {
      if (!isRecord(row)) continue;
      const amount = toNumber(row.amount);
      const date = toDate(row.date);
      const sourceText =
        typeof row.source === "string" ? row.source : source.incomeCategory;
      if (amount == null || !date) continue;
      hits.push({
        sourceId: source.id,
        parentCategory: source.parentCategory,
        incomeCategory: source.incomeCategory,
        flowType: source.flowType,
        amount: Math.abs(amount),
        date,
        sourceText,
      });
    }
  }
  return hits;
}

function parseSourceRows(
  reportId: string,
  ownerUserId: string,
  payload: Record<string, unknown>,
) {
  const buckets: Array<{
    kind: IncomeSourceKind;
    rows: unknown;
  }> = [
    { kind: "REGULAR", rows: payload.regular },
    { kind: "IRREGULAR", rows: payload.irregular },
    { kind: "OTHER_CREDIT", rows: payload.otherCredit },
  ];

  const out: Array<{
    id: string;
    reportId: string;
    ownerUserId: string;
    kind: IncomeSourceKind;
    source: string;
    frequency: string | null;
    ageDays: number | null;
    stability: Prisma.Decimal | null;
    amountAvg: Prisma.Decimal | null;
    amountAvgMonthly: Prisma.Decimal | null;
    occurrenceCount: number | null;
    avgMonthlyOccurrence: Prisma.Decimal | null;
    currentAmount: Prisma.Decimal | null;
    currentDate: Date | null;
    nextDate: Date | null;
    otherCreditLabel: string | null;
    parentCategory: string;
    incomeCategory: string;
    flowType: "INCOME" | "TRANSFER" | "OTHER";
    rawPayload: Record<string, unknown>;
  }> = [];

  for (const bucket of buckets) {
    if (!Array.isArray(bucket.rows)) continue;
    for (const row of bucket.rows) {
      if (!isRecord(row)) continue;
      const source =
        typeof row.source === "string" && row.source.trim()
          ? row.source.trim()
          : "Unknown source";
      const current = isRecord(row.current) ? row.current : {};
      const previous3 = isRecord(row.previous3Months) ? row.previous3Months : {};
      const irregularity = isRecord(row.irregularity) ? row.irregularity : {};
      const otherCreditLabel =
        typeof current.otherCreditLabel === "string"
          ? current.otherCreditLabel
          : null;
      const labels = incomeCategoryFromApiSource({
        kind: bucket.kind,
        source,
        otherCreditLabel,
      });

      const amountAvg =
        toNumber(previous3.amountAvg) ??
        toNumber(row.amountAvg) ??
        toNumber(current.amount);
      const amountAvgMonthly = toNumber(previous3.amountAvgMonthly);
      const stability = toNumber(irregularity.stability);

      out.push({
        id: sourceStableId(reportId, bucket.kind, source),
        reportId,
        ownerUserId,
        kind: bucket.kind,
        source: source.slice(0, 240),
        frequency: typeof row.frequency === "string" ? row.frequency : null,
        ageDays: toNumber(row.ageDays ?? row.ageDay),
        stability:
          stability == null ? null : new Prisma.Decimal(stability.toFixed(4)),
        amountAvg:
          amountAvg == null ? null : new Prisma.Decimal(amountAvg.toFixed(4)),
        amountAvgMonthly:
          amountAvgMonthly == null
            ? null
            : new Prisma.Decimal(amountAvgMonthly.toFixed(4)),
        occurrenceCount: toNumber(row.noOccurrences),
        avgMonthlyOccurrence: (() => {
          const n = toNumber(row.avgMonthlyOccurence ?? row.avgMonthlyOccurrence);
          return n == null ? null : new Prisma.Decimal(n.toFixed(4));
        })(),
        currentAmount: (() => {
          const n = toNumber(current.amount);
          return n == null ? null : new Prisma.Decimal(n.toFixed(4));
        })(),
        currentDate: toDate(current.date),
        nextDate: toDate(current.nextDate ?? current.nextdate),
        otherCreditLabel,
        parentCategory: labels.parentCategory,
        incomeCategory: labels.incomeCategory.slice(0, 120),
        flowType: labels.flowType,
        rawPayload: row,
      });
    }
  }

  return out;
}

/**
 * Create + persist Basiq Income summary, then annotate matching credit txs.
 */
export async function syncIncomeForOwner(
  ownerUserId: string,
  basiqUserId: string,
  opts?: { accounts?: string[] },
): Promise<IncomeSyncRun> {
  const db = getIngestPrisma();

  let payload: Record<string, unknown> | null;
  try {
    payload = await createIncomeSummary(basiqUserId, {
      accounts: opts?.accounts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[income] createIncomeSummary failed", message);
    return { ok: false, reason: message };
  }

  if (!payload) {
    return { ok: true, skipped: true, reason: "no_income_content" };
  }

  const reportId = typeof payload.id === "string" ? payload.id : null;
  if (!reportId) {
    return { ok: false, reason: "missing_income_id" };
  }

  const summary = isRecord(payload.summary) ? payload.summary : {};
  const sources = parseSourceRows(reportId, ownerUserId, payload);

  await db.basiqIncomeReport.upsert({
    where: { id: reportId },
    create: {
      id: reportId,
      ownerUserId,
      basiqUserId,
      fromMonth: String(payload.fromMonth ?? ""),
      toMonth: String(payload.toMonth ?? ""),
      coverageDays: toNumber(payload.coverageDays),
      generatedAt: toDate(payload.generatedDate),
      regularIncomeAvg: (() => {
        const n = toNumber(summary.regularIncomeAvg);
        return n == null ? null : new Prisma.Decimal(n.toFixed(4));
      })(),
      regularIncomeYtd: (() => {
        const n = toNumber(summary.regularIncomeYTD);
        return n == null ? null : new Prisma.Decimal(n.toFixed(4));
      })(),
      regularIncomeYear: (() => {
        const n = toNumber(summary.regularIncomeYear);
        return n == null ? null : new Prisma.Decimal(n.toFixed(4));
      })(),
      irregularIncomeAvg: (() => {
        const n = toNumber(summary.irregularIncomeAvg);
        return n == null ? null : new Prisma.Decimal(n.toFixed(4));
      })(),
      summary,
      rawPayload: payload,
      syncedAt: new Date(),
    },
    update: {
      ownerUserId,
      basiqUserId,
      fromMonth: String(payload.fromMonth ?? ""),
      toMonth: String(payload.toMonth ?? ""),
      coverageDays: toNumber(payload.coverageDays),
      generatedAt: toDate(payload.generatedDate),
      regularIncomeAvg: (() => {
        const n = toNumber(summary.regularIncomeAvg);
        return n == null ? null : new Prisma.Decimal(n.toFixed(4));
      })(),
      regularIncomeYtd: (() => {
        const n = toNumber(summary.regularIncomeYTD);
        return n == null ? null : new Prisma.Decimal(n.toFixed(4));
      })(),
      regularIncomeYear: (() => {
        const n = toNumber(summary.regularIncomeYear);
        return n == null ? null : new Prisma.Decimal(n.toFixed(4));
      })(),
      irregularIncomeAvg: (() => {
        const n = toNumber(summary.irregularIncomeAvg);
        return n == null ? null : new Prisma.Decimal(n.toFixed(4));
      })(),
      summary,
      rawPayload: payload,
      syncedAt: new Date(),
    },
  });

  // Replace sources for this report snapshot.
  await db.basiqIncomeSource.deleteMany({ where: { reportId } });
  if (sources.length > 0) {
    await db.basiqIncomeSource.createMany({
      data: sources.map(
        ({
          flowType: _flowType,
          ...row
        }) => row,
      ),
    });
  }

  const historyHits = collectHistoryHits(sources);
  let transactionsAnnotated = 0;

  if (historyHits.length > 0) {
    const credits = await db.basiqTransaction.findMany({
      where: { ownerUserId, direction: "credit" },
      select: {
        transactionId: true,
        amount: true,
        postDate: true,
        rawPayload: true,
      },
    });

    for (const tx of credits) {
      if (!tx.postDate) continue;
      const amount = Math.abs(Number(tx.amount));
      const day = tx.postDate.toISOString().slice(0, 10);
      const desc =
        isRecord(tx.rawPayload) && typeof tx.rawPayload.description === "string"
          ? normalizeSourceText(tx.rawPayload.description)
          : "";

      const match = historyHits.find((hit) => {
        const sameDay = hit.date.toISOString().slice(0, 10) === day;
        const amountClose = Math.abs(hit.amount - amount) <= 0.05;
        if (!sameDay || !amountClose) return false;
        if (!desc) return true;
        const hitText = normalizeSourceText(hit.sourceText);
        return (
          !hitText ||
          desc.includes(hitText.slice(0, 24)) ||
          hitText.includes(desc.slice(0, 24))
        );
      });

      if (!match) continue;

      // UI enrichment only — never clear/overwrite Basiq subclass/group/rawPayload.
      await db.basiqTransaction.update({
        where: { transactionId: tx.transactionId },
        data: {
          incomeSourceId: match.sourceId,
          parentCategory: match.parentCategory,
          expenseCategory: match.incomeCategory,
          flowType: match.flowType,
          categorySource: "INCOME_API",
          categoryConfidence: 95,
          categoryMatcherVersion: CREDIT_MATCHER_VERSION,
          categorisedAt: new Date(),
        },
      });
      transactionsAnnotated += 1;
    }
  }

  return {
    ok: true,
    reportId,
    sourcesUpserted: sources.length,
    transactionsAnnotated,
  };
}
