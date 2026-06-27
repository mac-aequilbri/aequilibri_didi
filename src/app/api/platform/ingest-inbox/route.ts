// Inbox ingestion endpoint — the event-triggered entry point for Module 2.
// Secured by CRON_SECRET (Bearer token), same as the scheduler; 503 when the
// secret is not configured so it cannot be enabled by accident.
//
// Intended caller: an n8n workflow triggered on new-mail arrival, pointed at:
//   POST /api/platform/ingest-inbox
//   Authorization: Bearer <CRON_SECRET>
//   { "orgSlug": "dulong-downs", "jobId": "rec..." }   // jobId optional
//
// It runs the same pipeline as the manual "ingest inbox" button: fetch unread
// mail (live IMAP when configured, else demo fixtures), register DOCUMENTS,
// extract attachments, and route operational content into proposals.

import { NextRequest, NextResponse } from "next/server";
import { getOrgCtx } from "@/lib/platform/org-context";
import { ingestUnreadEmails } from "@/services/platform/documents";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest): boolean | null {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return null; // not configured
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = authorized(request);
  if (auth === null) {
    return NextResponse.json({ error: "Ingestion disabled (CRON_SECRET not set)" }, { status: 503 });
  }
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { orgSlug?: string; jobId?: string | number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // empty/invalid body — fall through to the orgSlug check
  }
  const orgSlug = String(body.orgSlug ?? "").trim();
  if (!orgSlug) {
    return NextResponse.json({ error: "orgSlug is required" }, { status: 400 });
  }

  const ctx = await getOrgCtx(orgSlug);
  if (!ctx) {
    return NextResponse.json({ error: `Unknown org "${orgSlug}"` }, { status: 404 });
  }

  try {
    const result = await ingestUnreadEmails(ctx, "Inbox ingestion (n8n)", {
      jobId: body.jobId,
    });
    return NextResponse.json({ ok: true, orgSlug, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, orgSlug, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
