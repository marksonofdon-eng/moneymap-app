import { NextResponse } from "next/server";
import { SESSION_COOKIE, getCurrentUser } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const hadCookie = Boolean(cookieStore.get(SESSION_COOKIE)?.value);
  const user = await getCurrentUser();

  if (!user) {
    const res = NextResponse.json({ user: null }, { status: 401 });
    // Ensure stale cookies are cleared in the browser (Route Handler can set cookies).
    if (hadCookie) {
      res.cookies.delete(SESSION_COOKIE);
    }
    return res;
  }

  return NextResponse.json({ user });
}
