// Health endpoint for load balancers and uptime monitoring.
//
//   GET /api/health          — config-level checks only (cheap, no I/O), for
//                              high-frequency platform health pings.
//   GET /api/health?deep=1   — additionally verifies Airtable API reachability,
//                              cached for 60s so monitors cannot burn quota.
//
// Returns 200 with a per-check breakdown when healthy, 503 when any required
// check fails — unlike the static landing page, this actually goes red during
// a data-layer outage. No secrets or base ids appear in the response.

import { NextRequest, NextResponse } from "next/server";
import { airtableEnabled } from "@/lib/airtable/config";
import { clerkEnabled, clerkMisconfigured, demoModeAllowed } from "@/lib/platform/authConfig";

export const dynamic = "force-dynamic";

type CheckState = "ok" | "fail" | "skipped";

// Deep-check memo: Render/uptime monitors poll frequently; one Airtable probe
// per minute is plenty and stays far below the per-base rate limit.
const DEEP_TTL_MS = 60_000;
let deepCache: { at: number; ok: boolean } | null = null;

async function airtableReachable(): Promise<boolean> {
  if (deepCache && Date.now() - deepCache.at < DEEP_TTL_MS) return deepCache.ok;
  let ok = false;
  try {
    // whoami is base-independent and does not count against any base's quota.
    const res = await fetch("https://api.airtable.com/v0/meta/whoami", {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_PAT ?? ""}` },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  deepCache = { at: Date.now(), ok };
  return ok;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const deep = request.nextUrl.searchParams.get("deep") === "1";

  const checks: Record<string, CheckState> = {
    // Data layer: when Airtable is the system of record its PAT must be set.
    airtable_config: !airtableEnabled() || !!process.env.AIRTABLE_PAT ? "ok" : "fail",
    // Auth: either Clerk fully configured or demo mode explicitly allowed;
    // a half-configured Clerk is a deployment mistake.
    auth_config: clerkMisconfigured() ? "fail" : clerkEnabled() || demoModeAllowed() ? "ok" : "fail",
    airtable_reachable: "skipped",
  };

  if (deep && airtableEnabled()) {
    checks.airtable_reachable = (await airtableReachable()) ? "ok" : "fail";
  }

  const ok = Object.values(checks).every((s) => s !== "fail");
  return NextResponse.json(
    { ok, checks, ts: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
