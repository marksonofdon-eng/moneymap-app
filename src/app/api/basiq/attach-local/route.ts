import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getIngestPrisma } from "@/server/data/dbContext";

/**
 * DEV ONLY: link the signed-in user to existing local bank rows.
 * Requires NODE_ENV=development and ALLOW_ATTACH_LOCAL=true.
 * Does not call the Basiq API.
 */
export async function POST() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.ALLOW_ATTACH_LOCAL !== "true"
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const ingestDb = getIngestPrisma();

    if (user.basiqUserId) {
      const accountCount = await ingestDb.basiqAccount.count({
        where: { ownerUserId: user.id },
      });
      return NextResponse.json({
        status: "already_linked",
        basiqUserId: user.basiqUserId,
        accountCount,
      });
    }

    const grouped = await ingestDb.basiqAccount.groupBy({
      by: ["basiqUserId"],
      _count: { accountId: true },
      orderBy: { _count: { accountId: "desc" } },
    });

    if (grouped.length === 0) {
      return NextResponse.json(
        {
          error: "no_local_data",
          message: "No accounts in the database to attach.",
        },
        { status: 404 },
      );
    }

    let basiqUserId: string | null = null;
    for (const row of grouped) {
      const claimed = await prisma.user.findFirst({
        where: { basiqUserId: row.basiqUserId, NOT: { id: user.id } },
        select: { id: true },
      });
      if (!claimed) {
        basiqUserId = row.basiqUserId;
        break;
      }
    }

    if (!basiqUserId) {
      return NextResponse.json(
        {
          error: "already_claimed",
          message: "Local bank data is already linked to another account.",
        },
        { status: 409 },
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { basiqUserId },
    });
    await ingestDb.basiqAccount.updateMany({
      where: { basiqUserId },
      data: { ownerUserId: user.id },
    });
    await ingestDb.basiqTransaction.updateMany({
      where: { account: { basiqUserId } },
      data: { ownerUserId: user.id },
    });

    const accountCount = await ingestDb.basiqAccount.count({
      where: { ownerUserId: user.id },
    });
    const txCount = await ingestDb.basiqTransaction.count({
      where: { ownerUserId: user.id },
    });

    return NextResponse.json({
      status: "attached",
      basiqUserId,
      accountCount,
      txCount,
    });
  } catch (error) {
    console.error("[basiq/attach-local]", error);
    return NextResponse.json(
      {
        error: "attach_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
