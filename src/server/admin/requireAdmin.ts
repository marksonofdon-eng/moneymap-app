import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { isAdminEmail, isAdminGateConfigured } from "@/lib/admin";

export type AdminResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Session + allowlist gate for /api/admin/* handlers.
 * Production requires ADMIN_EMAILS to be configured.
 */
export async function requireAdmin(): Promise<AdminResult> {
  if (
    process.env.NODE_ENV === "production" &&
    !isAdminGateConfigured()
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "admin_not_configured" },
        { status: 503 },
      ),
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  if (!isAdminEmail(user.email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user };
}

/** Page-level helper: returns user or null (caller redirects). */
export async function getAdminUser(): Promise<SessionUser | null> {
  if (
    process.env.NODE_ENV === "production" &&
    !isAdminGateConfigured()
  ) {
    return null;
  }
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}
