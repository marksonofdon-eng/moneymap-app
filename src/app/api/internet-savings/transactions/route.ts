import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listInternetBillTransactions } from "@/server/data/internetSavings";

/** GET — evidence transactions for the primary detected internet bill. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const transactions = await listInternetBillTransactions(user.id);
    return NextResponse.json({ transactions });
  } catch (error) {
    console.error("[internet-savings/transactions:get]", error);
    return NextResponse.json(
      { error: "transactions_failed" },
      { status: 500 },
    );
  }
}
