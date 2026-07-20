# Transaction taxonomy categoriser

## Sources of truth

| Tier | Source | Audit id |
|------|--------|----------|
| **1 Primary — debits** | `end_user_expense_mapping.csv` (Basiq L3/L4 → Parent/Expense) | `categoryRuleId` null; `categorySource` BASIQ_ENRICH / KEYWORD |
| **1 Primary — credits** | `creditTaxonomy.ts` + Income API | `BASIQ_CLASS` / `KEYWORD` / `INCOME_API` |
| **2a Merchant map** | `merchant_category_map` (+ promoted `scr_` MERCHANT_TOKEN) | `SECONDARY_PATTERN` + `categoryRuleId` / `merchant-map-v1` |
| **2b Secondary rules** | `secondary_category_rules` mined/seeded patterns | `categorySource=SECONDARY_PATTERN` + `categoryRuleId=scr_…` |
| **2c Model** | Hashed logistic classifier (`models/category-clf/{version}`) | `categorySource=MODEL` + `categoryMatcherVersion=clf-…` |
| **3 Future — per-user** | User instruction + UI approval | Reserved: `USER_RULE` |

Plan: [HYBRID_SECONDARY_CATEGORISATION_PLAN.md](./HYBRID_SECONDARY_CATEGORISATION_PLAN.md)

## Setup

```bash
npx prisma migrate deploy
npm run db:seed-spend-categories
npm run categorise:secondary-seed
npm run categorise:merchant-map
npm run categorise:secondary-mine
npm run categorise:train-model
# optional: pin model + shadow week
# CATEGORY_MODEL_VERSION=clf-YYYYMMDD CATEGORY_MODEL_SHADOW=1
npm run categorise:transactions -- --force
npm run categorise:propose-rules
# optional LLM proposals: OPENAI_API_KEY=… npm run categorise:propose-rules -- --llm
```

## How assignment works

1. **Primary** — user Parent/Expense **only** when Basiq provides a real **L4**
   - Codes that are known **L3 groups** in the mapping (e.g. `411` supermarket) are never treated as L4, even if a colliding L4 row exists (e.g. coal `411` → Bulk Fuel)
   - When L4 is present it is master; stored L3 is the mapping parent of that L4
   - Lookup `end_user_expense_mapping.csv` → `BASIQ_ENRICH`
   - If enrich/merchant/L3-only/no code → leave Parent/Expense **empty** (`UNMATCHED`)
   - Credits never get primary labels (no ANZSIC L4)
2. **Secondary** — only when primary left L4 empty; sets **UI** Parent/Expense + `categorySource` only
   - Keywords (`KEYWORD`) → Basiq credit `class` (`BASIQ_CLASS`) → merchant map / `scr_` (`SECONDARY_PATTERN`) → model (`MODEL`)
   - When Basiq provided an **L3** (and L4 empty), secondary may only assign a UI label whose mapping L4 sits **under that L3**; out-of-family candidates are skipped
   - When Basiq provided a real **L4** already mapped in primary → secondary does not run
   - May use description + Basiq L3 from the raw payload; never overwrites a primary L4
3. **Basiq source audit fields stay source-of-truth**
   - `rawPayload` is never mutated by categorisation
   - `subclassCode` / `groupCode` are denormalized **only** from what Basiq sent; if Basiq left L3/L4 empty they stay `null` (secondary must not invent them)
4. Append `category_assignment_events` on change
5. Else remain `UNMATCHED`

Secondary auto-promote thresholds (miner): support ≥ 3, confidence ≥ 85.  
Propose-rules auto-ACTIVE: labelled agreement ≥ 95% and support ≥ 10; else `CANDIDATE`.

## Env

| Variable | Purpose |
|----------|---------|
| `CATEGORY_MODEL_VERSION` | Pin artefact under `models/category-clf/{version}` |
| `CATEGORY_MODEL_MIN_CONFIDENCE` | Auto-apply floor (default 90) |
| `CATEGORY_MODEL_SHADOW` | `1` / `true` = predict + log only, do not write |
| `OPENAI_API_KEY` | Optional for `categorise:propose-rules -- --llm` |

## Rollback / audit

- Disable: `POST /api/admin/taxonomy` `{ "mode": "disable", "ruleId": "scr_…" }`
- Revoke + rollback txs: `{ "mode": "revoke", "ruleId": "scr_…", "rollback": true }`
- Mine: `{ "mode": "mine" }`
- Seed L3 + merchant seeds: `{ "mode": "seed-secondary" }`
- Build merchant map from labels: `{ "mode": "build-merchant-map" }`
- Propose rules: `{ "mode": "propose-rules", "useLlm": true }`
- Model rollback: change/remove `CATEGORY_MODEL_VERSION` and re-run categorise with `force`

## Scripts

- `npm run categorise:secondary-seed`
- `npm run categorise:merchant-map`
- `npm run categorise:secondary-mine`
- `npm run categorise:train-model`
- `npm run categorise:propose-rules`
- `npm run categorise:transactions -- --force`
- `npm run test:secondary-patterns`
- `npm run test:taxonomy-categoriser`

## GET /api/admin/taxonomy

Returns match rates by source, top unmatched merchants, secondary rules, candidate count, merchant map size, pinned model version + train metrics, and `alerts.unmatchedRateHigh` when unmatched rate &gt; 15%.

## Ingest

Import/consent pipelines call `detectRecurringBillsForOwner` → `categoriseTransactionsForOwner`, which applies merchant map, secondary rules, then model automatically.

## Runbook (ops)

1. **Unmatched spike (&gt;15%)** — inspect GET taxonomy `topUnmatchedMerchants`; seed/map or propose-rules; force categorise.
2. **Bad secondary rule** — `disable` or `revoke` with `rollback: true`.
3. **Bad model** — unset `CATEGORY_MODEL_VERSION` or pin previous folder; force categorise.
4. **Retrain** — weekly or after large labelled growth: `categorise:train-model`, pin new version, shadow one week, then clear shadow.
5. **Windows Prisma EPERM** — stop Next/dev before `prisma generate` / migrate.
