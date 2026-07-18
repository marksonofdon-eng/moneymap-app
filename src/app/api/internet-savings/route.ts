import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getInternetSavingsState } from "@/server/data/internetSavings";

/** GET — home CTA tone + detected bill summary for Internet Savings. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const state = await getInternetSavingsState(user.id);
    return NextResponse.json(state);
  } catch (error) {
    console.error("[internet-savings:get]", error);
    return NextResponse.json(
      { error: "internet_savings_state_failed" },
      { status: 500 },
    );
  }
}
