import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16 renamed Middleware → Proxy (same behavior).
// UC1 (Roofing) is temporarily disabled while the focus is on UC2 + UC3.
// To re-enable: set UC1_ENABLED = true here, and restore the UC1 nav link
// (src/app/layout.tsx) + landing card (src/app/page.tsx).
const UC1_ENABLED = false;

export function proxy(request: NextRequest) {
  if (UC1_ENABLED) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // UC1 JSON API → 404 (a redirect would be wrong for fetch callers).
  if (pathname.startsWith("/api/uc1")) {
    return NextResponse.json({ error: "UC1 is disabled" }, { status: 404 });
  }

  // UC1 pages → bounce to the landing page.
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/uc1", "/uc1/:path*", "/api/uc1/:path*"],
};
