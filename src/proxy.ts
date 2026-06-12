import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/platform/authConfig";

// Next 16 renamed Middleware → Proxy (same behavior).
//
// Two concerns are layered here:
//  1. UC1 kill-switch (pre-existing): flip UC1_ENABLED to disable the roofing
//     app and its API.
//  2. Platform auth: when Clerk is configured (see lib/platform/authConfig),
//     everything under /app requires a signed-in user — org membership and
//     roles are then enforced in lib/platform/org-context. The public client
//     portal (/portal/[token]) and the landing page stay unauthenticated by
//     design. Without Clerk keys the platform runs in open demo mode.
const UC1_ENABLED = true;

const isPlatformRoute = createRouteMatcher(["/app", "/app/(.*)"]);

function uc1Gate(request: NextRequest) {
  if (UC1_ENABLED) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/uc1") && !pathname.startsWith("/api/uc1")) {
    return NextResponse.next();
  }
  // UC1 JSON API → 404 (a redirect would be wrong for fetch callers).
  if (pathname.startsWith("/api/uc1")) {
    return NextResponse.json({ error: "UC1 is disabled" }, { status: 404 });
  }
  // UC1 pages → bounce to the landing page.
  return NextResponse.redirect(new URL("/", request.url));
}

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isPlatformRoute(request)) await auth.protect();
  return uc1Gate(request);
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (clerkEnabled()) return withClerk(request, event);
  return uc1Gate(request);
}

export const config = {
  matcher: [
    "/app",
    "/app/:path*",
    "/uc1",
    "/uc1/:path*",
    "/api/uc1/:path*",
  ],
};
