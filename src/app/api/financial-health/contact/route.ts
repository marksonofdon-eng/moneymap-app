import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  contactRequested: z.boolean(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { contactRequested } = parsed.data;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      financialHealthContactRequested: contactRequested,
      financialHealthContactAt: contactRequested ? new Date() : null,
    },
    select: {
      financialHealthContactRequested: true,
      financialHealthContactAt: true,
    },
  });

  return NextResponse.json({
    contactRequested: updated.financialHealthContactRequested,
    contactedAt: updated.financialHealthContactAt,
  });
}
