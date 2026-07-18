import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "mm_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  // Protect signed-in areas. Cookie presence is a soft gate only —
  // pages/APIs still validate the session against the database.
  if (
    (pathname.startsWith("/app") || pathname.startsWith("/admin")) &&
    !token
  ) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  // Do NOT bounce /login or /signup away based on cookie presence.
  // Stale/expired mm_session cookies are common after DB resets and would
  // create a login ↔ /app redirect loop if we treated the cookie as proof.

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/login", "/signup"],
};
