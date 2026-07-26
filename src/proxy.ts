import { NextResponse } from "next/server";
import type { NextRequest, NextFetchEvent } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { clerkEnabled, demoModeAllowed } from "@/lib/platform/authConfig";

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
// UC1 (pages + API) requires a signed-in user too: several /api/uc1 routes
// write to the DB and call paid third-party APIs (Google Solar/Maps, Claude
// Vision), so leaving them open is both a data and a cost exposure.
const isUc1Route = createRouteMatcher(["/uc1(.*)", "/api/uc1(.*)"]);

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
  if (isPlatformRoute(request) || isUc1Route(request)) await auth.protect();
  return uc1Gate(request);
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (clerkEnabled()) return withClerk(request, event);

  // Fail CLOSED: without working auth, the platform routes only serve when
  // open demo mode was explicitly opted into (ALLOW_DEMO_MODE=true) — a
  // missing or mistyped Clerk key must never silently open the platform.
  if ((isPlatformRoute(request) || isUc1Route(request)) && !demoModeAllowed()) {
    return new NextResponse(
      "Authentication is not configured. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and " +
        "CLERK_SECRET_KEY, or explicitly set ALLOW_DEMO_MODE=true for an open demo deployment.",
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }
  return uc1Gate(request);
}

export const config = {
  // clerkMiddleware must run on every route that renders the root layout:
  // RootLayout calls currentUser() (via isPlatformAdmin) on ALL pages, and
  // Clerk throws if auth()/currentUser() runs on a request the middleware
  // didn't process. So match everything except Next internals and static
  // assets. auth.protect() stays scoped to /app inside the handler, and the
  // UC1 page/API gating + fail-closed 503 also key off the pathname there.
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|otf|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
