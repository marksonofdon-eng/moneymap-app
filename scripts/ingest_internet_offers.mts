import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  InternetConnectionType,
  InternetDataAllowance,
  InternetOfferStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { computeCalculatedCosts as computeCostsShared } from "../src/lib/internetOfferCosts.ts";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Source row shape from internet_offers_master.json */
export type MasterOfferRow = {
  internet_offer_id: number;
  provider_name: string;
  plan_name: string;
  connection_technology_type: string;
  max_download_speed_mbps: number;
  typical_evening_download_speed_mbps: number;
  max_upload_speed_mbps: number;
  standard_monthly_price_aud: number;
  promotional_monthly_price_aud: number;
  promotional_duration_months: number;
  upfront_modem_cost_aud: number;
  upfront_setup_fee_aud: number;
  early_termination_exit_fee_aud: number;
  data_allowance_type: "Unlimited" | "Capped";
  contract_term_months: number;
  bundled_perks_notes: string | null;
  geographic_target_postcode: string;
  network_infrastructure_owner: string;
  offer_deep_link_url: string | null;
};

export type CalculatedCosts = {
  calculated_first_year_total_cost_aud: number;
  calculated_true_average_monthly_cost_aud: number;
  calculated_cost_per_mbps_metric: number;
};

const CONNECTION_TYPE_MAP: Record<string, InternetConnectionType> = {
  FTTP: InternetConnectionType.FTTP,
  FTTN: InternetConnectionType.FTTN,
  FTTC: InternetConnectionType.FTTC,
  HFC: InternetConnectionType.HFC,
  "Fixed Wireless": InternetConnectionType.FIXED_WIRELESS,
  FIXED_WIRELESS: InternetConnectionType.FIXED_WIRELESS,
  "5G Wireless": InternetConnectionType.FIVE_G_WIRELESS,
  FIVE_G_WIRELESS: InternetConnectionType.FIVE_G_WIRELESS,
};

const DATA_ALLOWANCE_MAP: Record<string, InternetDataAllowance> = {
  Unlimited: InternetDataAllowance.Unlimited,
  Capped: InternetDataAllowance.Capped,
};

/**
 * Production-grade first-year economics derived before DB commit.
 */
export function computeCalculatedCosts(row: {
  promotional_duration_months: number;
  promotional_monthly_price_aud: number;
  standard_monthly_price_aud: number;
  upfront_modem_cost_aud: number;
  upfront_setup_fee_aud: number;
  typical_evening_download_speed_mbps: number;
}): CalculatedCosts {
  if (row.promotional_duration_months < 0 || row.promotional_duration_months > 12) {
    throw new Error(
      `promotional_duration_months must be 0–12, got ${row.promotional_duration_months}`,
    );
  }
  if (row.typical_evening_download_speed_mbps <= 0) {
    throw new Error(
      `typical_evening_download_speed_mbps must be > 0, got ${row.typical_evening_download_speed_mbps}`,
    );
  }

  const calc = computeCostsShared({
    promoDurationMonths: row.promotional_duration_months,
    promoMonthlyCost: row.promotional_monthly_price_aud,
    ongoingMonthlyCost: row.standard_monthly_price_aud,
    modemCost: row.upfront_modem_cost_aud,
    setupFee: row.upfront_setup_fee_aud,
    typicalEveningSpeed: row.typical_evening_download_speed_mbps,
  });
  if (!calc) {
    throw new Error("Unable to compute calculated costs");
  }

  return {
    calculated_first_year_total_cost_aud: calc.calculatedFirstYearTotalCostAud,
    calculated_true_average_monthly_cost_aud:
      calc.calculatedTrueAverageMonthlyCostAud,
    calculated_cost_per_mbps_metric: calc.calculatedCostPerMbpsMetric,
  };
}

function loadMasterOffers(path: string): MasterOfferRow[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as MasterOfferRow[];
  if (!Array.isArray(raw)) {
    throw new Error("internet_offers_master.json must be a JSON array");
  }
  if (raw.length !== 250) {
    throw new Error(`Expected 250 offers, got ${raw.length}`);
  }
  return raw;
}

function toPrismaRow(row: MasterOfferRow) {
  const connectionType = CONNECTION_TYPE_MAP[row.connection_technology_type];
  if (!connectionType) {
    throw new Error(
      `Unknown connection type: ${row.connection_technology_type} (id=${row.internet_offer_id})`,
    );
  }

  const dataAllowance = DATA_ALLOWANCE_MAP[row.data_allowance_type];
  if (!dataAllowance) {
    throw new Error(
      `Unknown data allowance: ${row.data_allowance_type} (id=${row.internet_offer_id})`,
    );
  }

  const calc = computeCalculatedCosts(row);

  return {
    id: row.internet_offer_id,
    providerName: row.provider_name,
    planName: row.plan_name,
    connectionType,
    maxDownloadSpeed: row.max_download_speed_mbps,
    typicalEveningSpeed: row.typical_evening_download_speed_mbps,
    uploadSpeed: row.max_upload_speed_mbps,
    ongoingMonthlyCost: new Prisma.Decimal(row.standard_monthly_price_aud),
    promoMonthlyCost: new Prisma.Decimal(row.promotional_monthly_price_aud),
    promoDurationMonths: row.promotional_duration_months,
    modemCost: new Prisma.Decimal(row.upfront_modem_cost_aud),
    setupFee: new Prisma.Decimal(row.upfront_setup_fee_aud),
    exitFee: new Prisma.Decimal(row.early_termination_exit_fee_aud),
    dataAllowance,
    contractTermMonths: row.contract_term_months,
    bundledPerksNotes: row.bundled_perks_notes,
    targetPostcode: row.geographic_target_postcode,
    networkOwner: row.network_infrastructure_owner,
    deepLinkUrl: row.offer_deep_link_url,
    calculatedFirstYearTotalCostAud: new Prisma.Decimal(
      calc.calculated_first_year_total_cost_aud,
    ),
    calculatedTrueAverageMonthlyCostAud: new Prisma.Decimal(
      calc.calculated_true_average_monthly_cost_aud,
    ),
    calculatedCostPerMbpsMetric: new Prisma.Decimal(
      calc.calculated_cost_per_mbps_metric,
    ),
    top5: false,
    issue: false,
    // Market ingest: Draft until an admin promotes; lastUpdated = plan/market stamp.
    status: InternetOfferStatus.Draft,
    statusUpdatedAt: new Date(),
    lastUpdated: new Date(),
  };
}

async function main() {
  const masterPath = join(__dirname, "internet_offers_master.json");
  const masterRows = loadMasterOffers(masterPath);

  const data = masterRows.map(toPrismaRow);

  // Sort preview by true average monthly (matches DB index order).
  const rankedByTrueAvg = [...data].sort((a, b) =>
    a.calculatedTrueAverageMonthlyCostAud
      .minus(b.calculatedTrueAverageMonthlyCostAud)
      .toNumber(),
  );

  await prisma.$transaction([
    prisma.internetMarketOffer.deleteMany({}),
    prisma.internetMarketOffer.createMany({ data }),
  ]);

  // Best-effort: keep serial in sync when inserting explicit primary keys.
  try {
    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('internet_market_offers', 'id'),
        COALESCE((SELECT MAX(id) FROM internet_market_offers), 1)
      );
    `);
  } catch (error) {
    console.warn(
      "Skipped sequence setval (insufficient privileges); inserts still committed.",
      error instanceof Error ? error.message : error,
    );
  }

  const count = await prisma.internetMarketOffer.count();
  const cheapest = await prisma.internetMarketOffer.findMany({
    take: 5,
    orderBy: { calculatedTrueAverageMonthlyCostAud: "asc" },
    select: {
      id: true,
      providerName: true,
      planName: true,
      calculatedFirstYearTotalCostAud: true,
      calculatedTrueAverageMonthlyCostAud: true,
      calculatedCostPerMbpsMetric: true,
    },
  });

  const indexInfo = await prisma.$queryRaw<
    Array<{ indexname: string; indexdef: string }>
  >`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'internet_market_offers'
      AND indexname = 'idx_internet_market_offers_true_avg_monthly_asc'
  `;

  console.log(
    JSON.stringify(
      {
        ingested: count,
        index: indexInfo[0] ?? null,
        cheapestFiveByTrueAverageMonthly: cheapest,
        pipelineRankPreviewIds: rankedByTrueAvg.slice(0, 5).map((r) => r.id),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
