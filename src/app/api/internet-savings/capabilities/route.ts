import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  assessInternetCapabilitiesForOwner,
  getLatestInternetCapabilities,
} from "@/server/data/internetCapabilities";

/** GET — latest address capability assessment, if one has been run. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const assessment = await getLatestInternetCapabilities(user.id);
    return NextResponse.json({ assessment });
  } catch (error) {
    console.error("[internet-savings/capabilities:get]", error);
    return NextResponse.json(
      { error: "capability_load_failed" },
      { status: 500 },
    );
  }
}

/** POST — assess the saved service address using the configured provider. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await assessInternetCapabilitiesForOwner(user.id);
    if (!result.ok) {
      if (result.error === "intake_not_ready") {
        return NextResponse.json({ error: result.error }, { status: 409 });
      }
      return NextResponse.json(
        { error: result.error, assessment: result.data },
        { status: 502 },
      );
    }
    return NextResponse.json({ assessment: result.data });
  } catch (error) {
    console.error("[internet-savings/capabilities:post]", error);
    return NextResponse.json(
      { error: "capability_assessment_failed" },
      { status: 500 },
    );
  }
}
