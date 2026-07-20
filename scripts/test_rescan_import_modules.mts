import assert from "node:assert/strict";

/**
 * Smoke: unauthenticated Rescan/Import APIs reject; module surface loads.
 * Run with: npx tsx scripts/test_rescan_import_modules.mts
 * Optional: BASE_URL=http://localhost:3001
 */

const BASE = process.env.BASE_URL || "http://localhost:3001";

async function expectUnauthorized(path: string) {
  const res = await fetch(`${BASE}${path}`, { method: "POST" });
  assert.equal(res.status, 401, `${path} should be 401 without session`);
  const body = await res.json();
  assert.equal(body.error, "unauthorized");
}

async function main() {
  const { resolveIncrementalFromDate, runImportPipeline } = await import(
    "../src/server/ingest"
  );
  const { detectRecurringBillsForOwner } = await import(
    "../src/server/data/recurringBills"
  );
  assert.equal(typeof resolveIncrementalFromDate, "function");
  assert.equal(typeof runImportPipeline, "function");
  assert.equal(typeof detectRecurringBillsForOwner, "function");

  try {
    await expectUnauthorized("/api/bills/rescan");
    await expectUnauthorized("/api/basiq/import");
    console.log("rescan/import API auth smoke passed");
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("fetch failed") ||
        error.message.includes("ECONNREFUSED"))
    ) {
      console.log(
        "rescan/import module smoke passed (dev server not running; skipped HTTP checks)",
      );
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
