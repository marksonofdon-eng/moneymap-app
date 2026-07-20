import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { categoriseTransactionsForOwner } from "@/server/data/categoriseTransactions";
import {
  tryAcquireOwnerJob,
  releaseOwnerJob,
} from "@/server/data/ownerJobLock";
import { detectRecurringBillsForOwner } from "@/server/data/recurringBills";

/**
 * POST — force-recategorise stored transactions and re-run bill detection (no Basiq).
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!tryAcquireOwnerJob(user.id)) {
    return NextResponse.json(
      { error: "job_in_progress", message: "A rescan or import is already running." },
      { status: 409 },
    );
  }

  try {
    const categorisation = await categoriseTransactionsForOwner(user.id, {
      force: true,
    });
    const detection = await detectRecurringBillsForOwner(user.id, {
      skipCategorise: true,
    });

    return NextResponse.json({
      ok: true,
      categorisation,
      internet: detection.internet,
      otherBillsDetected: detection.otherBillsDetected,
      otherEvidenceLinked: detection.otherEvidenceLinked,
    });
  } catch (error) {
    console.error("[bills/rescan]", error);
    return NextResponse.json(
      { error: "rescan_failed", message: "Could not rescan bills." },
      { status: 500 },
    );
  } finally {
    releaseOwnerJob(user.id);
  }
}
