import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getInternetSavingsIntake,
  upsertInternetSavingsIntake,
} from "@/server/data/internetSavings";
import { internetSavingsIntakeSchema } from "@/server/internetSavings/intakeSchema";

/** GET — load existing address + delivery prefs for the intake form. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const intake = await getInternetSavingsIntake(user.id);
    return NextResponse.json(intake);
  } catch (error) {
    console.error("[internet-savings/intake:get]", error);
    return NextResponse.json(
      { error: "internet_savings_intake_failed" },
      { status: 500 },
    );
  }
}

/** PUT — save address + delivery preferences (requires a detected bill). */
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = internetSavingsIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_intake", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await upsertInternetSavingsIntake(user.id, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[internet-savings/intake:put]", error);
    return NextResponse.json(
      { error: "internet_savings_save_failed" },
      { status: 500 },
    );
  }
}
