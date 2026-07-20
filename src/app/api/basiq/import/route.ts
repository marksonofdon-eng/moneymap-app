import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  tryAcquireOwnerJob,
  releaseOwnerJob,
} from "@/server/data/ownerJobLock";
import { runImportPipeline } from "@/server/ingest";

/**
 * POST — incremental Basiq pull for the signed-in user, then bill detection.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!user.basiqUserId) {
    return NextResponse.json(
      {
        error: "basiq_not_linked",
        message: "Link a bank account before importing transactions.",
      },
      { status: 400 },
    );
  }

  if (!tryAcquireOwnerJob(user.id)) {
    return NextResponse.json(
      { error: "job_in_progress", message: "A rescan or import is already running." },
      { status: 409 },
    );
  }

  try {
    const result = await runImportPipeline(user.id, user.basiqUserId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[basiq/import]", error);
    return NextResponse.json(
      { error: "import_failed", message: "Could not import transactions." },
      { status: 500 },
    );
  } finally {
    releaseOwnerJob(user.id);
  }
}
