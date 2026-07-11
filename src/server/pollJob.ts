import { getJob } from "@/server/basiq";
import { runIngestionPipeline } from "@/server/ingest";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 200;
const activeJobs = new Set<string>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findRetrieveTransactionsStep(steps: any[] | undefined) {
  if (!Array.isArray(steps)) return null;
  return steps.find((step) => step.title === "retrieve-transactions") || null;
}

async function pollJobUntilTransactionsReady(jobId: string, basiqUserId: string) {
  const key = `${jobId}:${basiqUserId}`;
  if (activeJobs.has(key)) return;
  activeJobs.add(key);

  try {
    for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
      const job = await getJob(jobId);
      const steps = job?.steps || [];
      const retrieveTx = findRetrieveTransactionsStep(steps);

      if (retrieveTx?.status === "failed") {
        console.error("[poll] retrieve-transactions failed", retrieveTx.result);
        return;
      }
      if (retrieveTx?.status === "success") {
        await runIngestionPipeline(basiqUserId);
        return;
      }

      await sleep(POLL_INTERVAL_MS);
    }
    console.error(`[poll] Timed out after ${MAX_POLLS} attempts`);
  } catch (error) {
    console.error("[poll] Background poller error:", error);
  } finally {
    activeJobs.delete(key);
  }
}

export function startBackgroundPoll(jobId: string, basiqUserId: string) {
  setImmediate(() => {
    void pollJobUntilTransactionsReady(jobId, basiqUserId);
  });
}
