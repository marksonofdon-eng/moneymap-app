import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildConsentBrowserLink,
  createBasiqUser,
  getClientAccessToken,
} from "@/server/basiq";

/**
 * Creates (or reuses) a Basiq user for the signed-in MoneyMap user
 * and returns a consent browser link.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let basiqUserId = user.basiqUserId;
    if (!basiqUserId) {
      const basiqUser = await createBasiqUser(user.email);
      basiqUserId = basiqUser.id;
      if (!basiqUserId) {
        throw new Error("Basiq createUser did not return an id");
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { basiqUserId },
      });
    }

    const clientToken = await getClientAccessToken(basiqUserId);
    const browserLink = buildConsentBrowserLink(clientToken);
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

    return NextResponse.json({
      basiqUserId,
      browserLink,
      callbackHint: `${appUrl}/callback`,
      note: "Open browserLink to complete Open Banking consent. Configure Basiq dashboard redirect to http://localhost:3001/callback",
    });
  } catch (error) {
    console.error("[basiq/consent]", error);
    return NextResponse.json(
      {
        error: "consent_init_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
