import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  InternetConnectionType,
  InternetDataAllowance,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

type SeedRow = {
  provider_name: string;
  plan_name: string;
  connection_type: string;
  max_download_speed: number;
  typical_evening_speed: number;
  upload_speed: number;
  ongoing_monthly_cost: number;
  promo_monthly_cost: number;
  promo_duration_months: number;
  modem_cost: number;
  setup_fee: number;
  exit_fee: number;
  data_allowance: string;
  contract_term_months: number;
  bundled_perks_notes: string;
  target_postcode: string;
  network_owner: string;
};

const CONNECTION_TYPE_MAP: Record<string, InternetConnectionType> = {
  FTTP: InternetConnectionType.FTTP,
  FTTN: InternetConnectionType.FTTN,
  FTTC: InternetConnectionType.FTTC,
  HFC: InternetConnectionType.HFC,
  "Fixed Wireless": InternetConnectionType.FIXED_WIRELESS,
  "5G Wireless": InternetConnectionType.FIVE_G_WIRELESS,
};

const DATA_ALLOWANCE_MAP: Record<string, InternetDataAllowance> = {
  Unlimited: InternetDataAllowance.Unlimited,
  Capped: InternetDataAllowance.Capped,
};

async function main() {
  const rows = JSON.parse(
    readFileSync(join(__dirname, "seed_internet_offers.json"), "utf8"),
  ) as SeedRow[];

  const data = rows.map((row) => {
    const connectionType = CONNECTION_TYPE_MAP[row.connection_type];
    const dataAllowance = DATA_ALLOWANCE_MAP[row.data_allowance];
    if (!connectionType) {
      throw new Error(`Unknown connection_type: ${row.connection_type}`);
    }
    if (!dataAllowance) {
      throw new Error(`Unknown data_allowance: ${row.data_allowance}`);
    }

    return {
      providerName: row.provider_name,
      planName: row.plan_name,
      connectionType,
      maxDownloadSpeed: row.max_download_speed,
      typicalEveningSpeed: row.typical_evening_speed,
      uploadSpeed: row.upload_speed,
      ongoingMonthlyCost: row.ongoing_monthly_cost,
      promoMonthlyCost: row.promo_monthly_cost,
      promoDurationMonths: row.promo_duration_months,
      modemCost: row.modem_cost,
      setupFee: row.setup_fee,
      exitFee: row.exit_fee,
      dataAllowance,
      contractTermMonths: row.contract_term_months,
      bundledPerksNotes: row.bundled_perks_notes,
      targetPostcode: row.target_postcode,
      networkOwner: row.network_owner,
    };
  });

  const result = await prisma.internetMarketOffer.createMany({ data });
  const count = await prisma.internetMarketOffer.count();
  console.log(`Inserted ${result.count} offers. Table now has ${count} rows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
