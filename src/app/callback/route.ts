import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveUserIdForJob } from "@/server/basiq";
import { startBackgroundPoll } from "@/server/pollJob";

/**
 * Basiq dashboard Redirect URL (no query string in the dashboard value):
 *   http://localhost:3001/callback
 *
 * Basiq appends jobId only — we resolve userId from the job, start ingest,
 * then send the browser back to the signed-in app.
 */
export async function GET(request: NextRequest) {
  try {
    const jobId =
      request.nextUrl.searchParams.get("jobId") ||
      request.nextUrl.searchParams.get("jobid") ||
      request.nextUrl.searchParams.get("jobIds")?.split(",")[0]?.trim();

    let userId =
      request.nextUrl.searchParams.get("userId") ||
      request.nextUrl.searchParams.get("userid");

    if (!jobId) {
      return NextResponse.json(
        {
          error: "missing_params",
          message: "jobId query parameter is required",
          hint: "Register only http://localhost:3001/callback in the Basiq dashboard (no ?query).",
        },
        { status: 400 },
      );
    }

    if (!userId) {
      userId = await resolveUserIdForJob(String(jobId));
    }

    startBackgroundPoll(String(jobId), String(userId));

    return NextResponse.redirect(new URL("/app?linked=1", request.url));
  } catch (error) {
    console.error("[callback]", error);
    return NextResponse.json(
      {
        error: "callback_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
