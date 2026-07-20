import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin/requireAdmin";
import { prisma } from "@/lib/db";
import { getIngestPrisma } from "@/server/data/dbContext";
import { categoriseTransactionsForOwner } from "@/server/data/categoriseTransactions";
import { detectRecurringBillsForOwner } from "@/server/data/recurringBills";
import { BILL_PILL_TAXONOMY } from "@/server/taxonomy/pillMap";
import { mineSecondaryPatterns } from "@/server/taxonomy/secondaryPatterns/miner";
import { seedSecondaryL3Rules } from "@/server/taxonomy/secondaryPatterns/seedL3Rules";
import {
  disableSecondaryRule,
  revokeSecondaryRule,
} from "@/server/taxonomy/secondaryPatterns/revoke";
import { proposeSecondaryRules } from "@/server/taxonomy/secondaryPatterns/proposeRules";
import { buildMerchantMapFromLabels } from "@/server/taxonomy/merchantMap";
import {
  extractMerchantToken,
  descriptionFromPayload,
} from "@/server/taxonomy/features";
import {
  loadCategoryModel,
  modelMinConfidence,
  resolveModelVersion,
} from "@/server/taxonomy/secondaryModel";

/**
 * GET — category match metrics + secondary rule inventory + hybrid ladder stats.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const ownerUserId = admin.user.id;
    const db = getIngestPrisma();
    const [
      taxonomyCount,
      bySource,
      unmatchedSample,
      topParents,
      topExpenses,
      secondaryRules,
      secondaryTxCount,
      candidateRules,
      merchantMapCount,
      modelTxCount,
    ] = await Promise.all([
      prisma.spendCategory.count(),
      prisma.basiqTransaction.groupBy({
        by: ["categorySource"],
        where: { ownerUserId },
        _count: { _all: true },
      }),
      prisma.basiqTransaction.findMany({
        where: {
          ownerUserId,
          OR: [{ categorySource: "UNMATCHED" }, { categorySource: null }],
        },
        select: {
          transactionId: true,
          amount: true,
          postDate: true,
          rawPayload: true,
          categorySource: true,
        },
        orderBy: { postDate: "desc" },
        take: 40,
      }),
      prisma.basiqTransaction.groupBy({
        by: ["parentCategory"],
        where: { ownerUserId, parentCategory: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { parentCategory: "desc" } },
        take: 15,
      }),
      prisma.basiqTransaction.groupBy({
        by: ["expenseCategory"],
        where: { ownerUserId, expenseCategory: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { expenseCategory: "desc" } },
        take: 20,
      }),
      db.secondaryCategoryRule.findMany({
        where: { ownerScope: "GLOBAL" },
        orderBy: [{ status: "asc" }, { supportCount: "desc" }],
        take: 50,
        select: {
          id: true,
          status: true,
          patternType: true,
          patternValue: true,
          parentCategory: true,
          expenseCategory: true,
          confidence: true,
          supportCount: true,
          matcherVersion: true,
          createdBy: true,
          notes: true,
          activatedAt: true,
        },
      }),
      prisma.basiqTransaction.count({
        where: { ownerUserId, categorySource: "SECONDARY_PATTERN" },
      }),
      db.secondaryCategoryRule.count({
        where: { ownerScope: "GLOBAL", status: "CANDIDATE" },
      }),
      db.merchantCategoryMap.count(),
      prisma.basiqTransaction.count({
        where: { ownerUserId, categorySource: "MODEL" },
      }),
    ]);

    const totalTx = bySource.reduce((sum, row) => sum + row._count._all, 0);
    const unmatchedCount = bySource
      .filter(
        (row) =>
          row.categorySource === "UNMATCHED" || row.categorySource == null,
      )
      .reduce((sum, row) => sum + row._count._all, 0);
    const matched = bySource
      .filter(
        (row) =>
          row.categorySource === "KEYWORD" ||
          row.categorySource === "BASIQ_ENRICH" ||
          row.categorySource === "MANUAL" ||
          row.categorySource === "BASIQ_CLASS" ||
          row.categorySource === "INCOME_API" ||
          row.categorySource === "SECONDARY_PATTERN" ||
          row.categorySource === "MODEL",
      )
      .reduce((sum, row) => sum + row._count._all, 0);

    const unmatchedMerchantCounts = new Map<string, number>();
    for (const row of unmatchedSample) {
      const token = extractMerchantToken(descriptionFromPayload(row.rawPayload));
      if (!token) continue;
      unmatchedMerchantCounts.set(
        token,
        (unmatchedMerchantCounts.get(token) ?? 0) + 1,
      );
    }
    const topUnmatchedMerchants = [...unmatchedMerchantCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([merchantKey, count]) => ({ merchantKey, count }));

    const modelArtefact = loadCategoryModel();
    const unmatchedRate = totalTx === 0 ? null : unmatchedCount / totalTx;

    return NextResponse.json({
      taxonomyCount,
      pillMap: BILL_PILL_TAXONOMY.map(
        ({ pillId, label, expenseCategories, defaultBasiqL4Code }) => ({
          pillId,
          label,
          expenseCategories,
          defaultBasiqL4Code,
        }),
      ),
      secondary: {
        rules: secondaryRules,
        ownerSecondaryMatched: secondaryTxCount,
        candidateRules,
      },
      merchantMap: {
        entries: merchantMapCount,
      },
      model: {
        pinnedVersion: resolveModelVersion(),
        loadedVersion: modelArtefact?.version ?? null,
        minConfidence: modelMinConfidence(),
        shadow: process.env.CATEGORY_MODEL_SHADOW === "1" || process.env.CATEGORY_MODEL_SHADOW === "true",
        metrics: modelArtefact?.metrics ?? null,
        ownerModelMatched: modelTxCount,
      },
      alerts: {
        unmatchedRateHigh: unmatchedRate != null && unmatchedRate > 0.15,
        unmatchedRate,
      },
      owner: {
        totalTransactions: totalTx,
        matched,
        unmatched: unmatchedCount,
        matchRate: totalTx === 0 ? null : matched / totalTx,
        bySource: bySource.map((row) => ({
          source: row.categorySource,
          count: row._count._all,
        })),
        topParents: topParents.map((row) => ({
          parentCategory: row.parentCategory,
          count: row._count._all,
        })),
        topExpenses: topExpenses.map((row) => ({
          expenseCategory: row.expenseCategory,
          count: row._count._all,
        })),
        topUnmatchedMerchants,
        unmatchedSample: unmatchedSample.slice(0, 20).map((row) => {
          const payload = row.rawPayload as { description?: string } | null;
          return {
            transactionId: row.transactionId,
            amount: Number(row.amount),
            postDate: row.postDate?.toISOString() ?? null,
            description:
              typeof payload?.description === "string"
                ? payload.description.slice(0, 160)
                : null,
            categorySource: row.categorySource,
          };
        }),
      },
    });
  } catch (error) {
    console.error("[admin/taxonomy:get]", error);
    return NextResponse.json({ error: "taxonomy_metrics_failed" }, { status: 500 });
  }
}

/**
 * POST — categorise / recurring / mine / seed / revoke / disable / propose-rules / build-merchant-map.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      mode?: string;
      force?: boolean;
      ruleId?: string;
      rollback?: boolean;
      shadowModel?: boolean;
      useLlm?: boolean;
    };

    const mode = body.mode ?? "categorise";

    if (mode === "recurring") {
      const run = await detectRecurringBillsForOwner(admin.user.id);
      return NextResponse.json({ mode, run });
    }

    if (mode === "mine") {
      const run = await mineSecondaryPatterns();
      return NextResponse.json({ mode, run });
    }

    if (mode === "seed-secondary") {
      const run = await seedSecondaryL3Rules();
      return NextResponse.json({ mode, run });
    }

    if (mode === "build-merchant-map") {
      const run = await buildMerchantMapFromLabels();
      return NextResponse.json({ mode, run });
    }

    if (mode === "propose-rules") {
      const run = await proposeSecondaryRules({
        useLlm: body.useLlm !== false,
      });
      return NextResponse.json({ mode, run });
    }

    if (mode === "revoke") {
      if (!body.ruleId) {
        return NextResponse.json({ error: "ruleId_required" }, { status: 400 });
      }
      const run = await revokeSecondaryRule(body.ruleId, {
        rollback: body.rollback !== false,
      });
      return NextResponse.json({ mode, run });
    }

    if (mode === "disable") {
      if (!body.ruleId) {
        return NextResponse.json({ error: "ruleId_required" }, { status: 400 });
      }
      const run = await disableSecondaryRule(body.ruleId);
      return NextResponse.json({ mode, run });
    }

    const run = await categoriseTransactionsForOwner(admin.user.id, {
      force: body.force === true,
      shadowModel: body.shadowModel,
    });
    return NextResponse.json({ mode: "categorise", run });
  } catch (error) {
    console.error("[admin/taxonomy:post]", error);
    return NextResponse.json({ error: "taxonomy_rerun_failed" }, { status: 500 });
  }
}
