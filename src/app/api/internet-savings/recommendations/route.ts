import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getInternetRecommendations } from "@/server/data/internetRecommendations";

/** GET — filter + rank market offers for the current user's internet bill. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const recommendation = await getInternetRecommendations(user.id);
    return NextResponse.json({ recommendation });
  } catch (error) {
    console.error("[internet-savings/recommendations:get]", error);
    return NextResponse.json(
      { error: "recommendation_failed" },
      { status: 500 },
    );
  }
}
