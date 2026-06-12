// Scheduler trigger endpoint — the platform's automation entry point.
// Secured by CRON_SECRET (Bearer token); 503 when the secret is not
// configured, so the endpoint cannot be enabled by accident.
//
// Callers: the repo's GitHub Actions workflow (hourly), or any external
// scheduler (n8n, Render cron, cron-job.org) pointed at:
//   POST /api/platform/scheduler   Authorization: Bearer <CRON_SECRET>

import { NextRequest, NextResponse } from "next/server";
import { runScheduledTasks } from "@/services/platform/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest): boolean | null {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return null; // not configured
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const auth = authorized(request);
  if (auth === null) {
    return NextResponse.json({ error: "Scheduler disabled (CRON_SECRET not set)" }, { status: 503 });
  }
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runScheduledTasks();
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

// GET supported for schedulers that can't POST.
export async function GET(request: NextRequest) {
  return handle(request);
}
