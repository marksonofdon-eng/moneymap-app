import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  InternetConnectionType,
  InternetDataAllowance,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

const PROVIDERS = [
  { provider_name: "Dodo", deep_link_url: "https://whistleout.com.au" },
  { provider_name: "Superloop", deep_link_url: "https://superloop.com" },
  { provider_name: "Optus", deep_link_url: "https://finder.com.au" },
  { provider_name: "Kogan Internet", deep_link_url: "https://koganinternet.com.au" },
  {
    provider_name: "TPG",
    deep_link_url:
      "https://whistleout.com.au/National-Broadband-Network-NBN-Plans",
  },
  { provider_name: "SpinTel", deep_link_url: "https://spintel.net.au" },
  { provider_name: "Flip", deep_link_url: "https://techradar.com" },
  {
    provider_name: "Aussie Broadband",
    deep_link_url: "https://aussiebroadband.com.au",
  },
  {
    provider_name: "Tangerine",
    deep_link_url: "https://whistleout.com.au/Guides/nbn-100-plans-australia",
  },
  { provider_name: "Swoop", deep_link_url: "https://canstar.com.au" },
  { provider_name: "Mate Internet", deep_link_url: "https://letsbemates.com.au" },
  { provider_name: "Exetel", deep_link_url: "https://exetel.com.au" },
  { provider_name: "More Telecom", deep_link_url: "https://more.com.au" },
  {
    provider_name: "Southern Phone",
    deep_link_url: "https://southernphone.com.au",
  },
  { provider_name: "Belong", deep_link_url: "https://belong.com.au" },
  { provider_name: "Telstra", deep_link_url: "https://telstra.com.au" },
  { provider_name: "Vodafone", deep_link_url: "https://vodafone.com.au" },
  { provider_name: "iiNet", deep_link_url: "https://iinet.net.au" },
  { provider_name: "Internode", deep_link_url: "https://on.net" },
  { provider_name: "Westnet", deep_link_url: "https://westnet.com.au" },
  { provider_name: "MyRepublic", deep_link_url: "https://whistleout.com.au" },
  { provider_name: "Moose Mobile", deep_link_url: "https://moosemobile.com.au" },
  { provider_name: "Commander", deep_link_url: "https://commander.com.au" },
  { provider_name: "iPrimus", deep_link_url: "https://iprimus.com.au" },
  { provider_name: "TPG Telecom", deep_link_url: "https://tpg.com.au" },
];

const SPEED_TIERS = [
  {
    tier_name: "Basic 12",
    infrastructure_tech: "FTTN",
    dl_max: 12,
    dl_evening: 12,
    ul_max: 1,
    cost_standard: 59.0,
    cost_promo: 44.0,
  },
  {
    tier_name: "Casual 25",
    infrastructure_tech: "FTTC",
    dl_max: 25,
    dl_evening: 25,
    ul_max: 5,
    cost_standard: 69.9,
    cost_promo: 49.9,
  },
  {
    tier_name: "Everyday 50",
    infrastructure_tech: "HFC",
    dl_max: 50,
    dl_evening: 50,
    ul_max: 20,
    cost_standard: 84.0,
    cost_promo: 59.0,
  },
  {
    tier_name: "Family Fast 100",
    infrastructure_tech: "HFC",
    dl_max: 100,
    dl_evening: 98,
    ul_max: 20,
    cost_standard: 95.0,
    cost_promo: 69.9,
  },
  {
    tier_name: "Superfast 250",
    infrastructure_tech: "FTTP",
    dl_max: 250,
    dl_evening: 240,
    ul_max: 25,
    cost_standard: 115.0,
    cost_promo: 85.0,
  },
];

const CONNECTION_TYPE_MAP: Record<string, InternetConnectionType> = {
  FTTP: InternetConnectionType.FTTP,
  FTTN: InternetConnectionType.FTTN,
  FTTC: InternetConnectionType.FTTC,
  HFC: InternetConnectionType.HFC,
  "Fixed Wireless": InternetConnectionType.FIXED_WIRELESS,
  "5G Wireless": InternetConnectionType.FIVE_G_WIRELESS,
};

function buildOffers() {
  const offers = [];
  let primaryKeyId = 1;

  for (const [providerIndex, provider] of PROVIDERS.entries()) {
    for (const [tierIndex, tier] of SPEED_TIERS.entries()) {
      for (let variationIndex = 0; variationIndex < 2; variationIndex += 1) {
        const pricingSkew =
          providerIndex * 0.35 - tierIndex * 0.15 + variationIndex * 0.95;
        const standardPrice = Number(
          (tier.cost_standard + pricingSkew).toFixed(2),
        );
        const promotionalPrice = Number(
          (tier.cost_promo + pricingSkew * 0.82).toFixed(2),
        );

        const promotionalDurationMonths = primaryKeyId % 2 === 0 ? 6 : 12;
        let networkInfrastructureOwner =
          primaryKeyId % 5 !== 0 ? "NBN" : "OptiComm";

        let connectionTechnologyType = tier.infrastructure_tech;
        if (tier.infrastructure_tech === "FTTN" && primaryKeyId % 3 === 0) {
          connectionTechnologyType = "Fixed Wireless";
          networkInfrastructureOwner = "Independent";
        }

        const geographicTargetPostcode =
          primaryKeyId % 4 !== 0 ? "ALL" : "3187";
        const upfrontModemCostAud = primaryKeyId % 3 !== 0 ? 0.0 : 120.0;

        offers.push({
          internet_offer_id: primaryKeyId,
          provider_name: provider.provider_name,
          plan_name: `${provider.provider_name} ${tier.tier_name} (Variant V${variationIndex + 1})`,
          connection_technology_type: connectionTechnologyType,
          max_download_speed_mbps: tier.dl_max,
          typical_evening_download_speed_mbps: tier.dl_evening,
          max_upload_speed_mbps: tier.ul_max,
          standard_monthly_price_aud: standardPrice,
          promotional_monthly_price_aud: promotionalPrice,
          promotional_duration_months: promotionalDurationMonths,
          upfront_modem_cost_aud: upfrontModemCostAud,
          upfront_setup_fee_aud: 0.0,
          early_termination_exit_fee_aud: 0.0,
          data_allowance_type: "Unlimited",
          contract_term_months: 0,
          bundled_perks_notes: `System tracking profile configuration index line code reference #${primaryKeyId}.`,
          geographic_target_postcode: geographicTargetPostcode,
          network_infrastructure_owner: networkInfrastructureOwner,
          offer_deep_link_url: provider.deep_link_url,
        });

        primaryKeyId += 1;
      }
    }
  }

  return offers;
}

async function main() {
  const generated = buildOffers();
  if (generated.length !== 250) {
    throw new Error(`Expected 250 offers, got ${generated.length}`);
  }

  writeFileSync(
    join(__dirname, "internet_offers_master.json"),
    JSON.stringify(generated, null, 2),
  );

  const data = generated.map((row) => {
    const connectionType = CONNECTION_TYPE_MAP[row.connection_technology_type];
    if (!connectionType) {
      throw new Error(
        `Unknown connection type: ${row.connection_technology_type}`,
      );
    }

    return {
      id: row.internet_offer_id,
      providerName: row.provider_name,
      planName: row.plan_name,
      connectionType,
      maxDownloadSpeed: row.max_download_speed_mbps,
      typicalEveningSpeed: row.typical_evening_download_speed_mbps,
      uploadSpeed: row.max_upload_speed_mbps,
      ongoingMonthlyCost: row.standard_monthly_price_aud,
      promoMonthlyCost: row.promotional_monthly_price_aud,
      promoDurationMonths: row.promotional_duration_months,
      modemCost: row.upfront_modem_cost_aud,
      setupFee: row.upfront_setup_fee_aud,
      exitFee: row.early_termination_exit_fee_aud,
      dataAllowance: InternetDataAllowance.Unlimited,
      contractTermMonths: row.contract_term_months,
      bundledPerksNotes: row.bundled_perks_notes,
      targetPostcode: row.geographic_target_postcode,
      networkOwner: row.network_infrastructure_owner,
      deepLinkUrl: row.offer_deep_link_url,
    };
  });

  await prisma.$transaction([
    prisma.internetMarketOffer.deleteMany({}),
    prisma.internetMarketOffer.createMany({ data }),
  ]);

  const count = await prisma.internetMarketOffer.count();
  const sample = await prisma.internetMarketOffer.findMany({
    take: 3,
    orderBy: { id: "asc" },
  });

  console.log(`Cleared old rows and inserted ${count} offers.`);
  console.log(JSON.stringify(sample, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
