// Generic inbound integration webhook — the PUSH counterpart to the pull-based
// /api/platform/ingest-inbox. An n8n workflow (Gmail trigger, Slack event,
// Drive change, web form, …) normalizes a message and POSTs it here; the app
// feeds it through the same Module 2 ingestion pipeline (register DOCUMENTS +
// route operational content into approval-gated proposals).
//
//   POST /api/platform/hooks
//   X-Aequilibri-Timestamp: <unix seconds>
//   X-Aequilibri-Signature: sha256=<hex HMAC-SHA256 of `${timestamp}.${rawBody}`>
//   {
//     "orgSlug": "dulong-downs",
//     "channel": "email|slack|drive|form|webhook",
//     "externalId": "<provider message id>",   // drives dedup on re-delivery
//     "from": "...", "subject": "...", "body": "...", "receivedAt": "...",
//     "jobId": "rec...",                         // optional
//     "attachments": [{ "name": "...", "mimeType": "...", "contentBase64": "..." }]
//   }
//
// Auth is a PER-ORG HMAC secret (control-base Settings JSON), falling back to a
// global PLATFORM_WEBHOOK_SECRET env for single-tenant/demo. Signing is scoped
// per org so a leaked secret cannot be used to write into a different tenant.

import { NextRequest, NextResponse } from "next/server";
import {
  controlEnabled,
  getActiveConnection,
  getOrgWebhookSecret,
  touchConnectionHealth,
} from "@/lib/airtable/control";
import { getOrgCtx } from "@/lib/platform/org-context";
import type { Module2SourceChannel } from "@/lib/platform/ingestion";
import { verifyWebhook } from "@/lib/platform/webhookAuth";
import { ingestInboundMessage } from "@/services/platform/documents";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHANNELS: Module2SourceChannel[] = ["email", "slack", "form", "drive", "webhook"];

interface HookAttachment {
  name?: string;
  mimeType?: string;
  contentBase64?: string;
}
interface HookBody {
  orgSlug?: string;
  channel?: string;
  externalId?: string;
  from?: string;
  subject?: string;
  body?: string;
  receivedAt?: string;
  jobId?: string | number;
  attachments?: HookAttachment[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Raw body first — the HMAC is over exact bytes, so we cannot re-serialize.
  const raw = await request.text();
  let payload: HookBody;
  try {
    payload = JSON.parse(raw) as HookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 2. Required fields.
  const orgSlug = String(payload.orgSlug ?? "").trim();
  const channel = String(payload.channel ?? "").trim() as Module2SourceChannel;
  const externalId = String(payload.externalId ?? "").trim();
  if (!orgSlug) return NextResponse.json({ error: "orgSlug is required" }, { status: 400 });
  if (!CHANNELS.includes(channel)) {
    return NextResponse.json(
      { error: `channel must be one of: ${CHANNELS.join(", ")}` },
      { status: 400 },
    );
  }
  if (!externalId) return NextResponse.json({ error: "externalId is required" }, { status: 400 });

  // 3. Org resolution.
  const ctx = await getOrgCtx(orgSlug);
  if (!ctx) return NextResponse.json({ error: `Unknown org "${orgSlug}"` }, { status: 404 });

  // 4. Secret: per-org, else global env fallback.
  const secret = (await getOrgWebhookSecret(orgSlug)) ?? process.env.PLATFORM_WEBHOOK_SECRET ?? "";

  // 5+6. Replay guard + HMAC verification over `${timestamp}.${rawBody}`.
  const auth = verifyWebhook({
    secret,
    rawBody: raw,
    timestampHeader: request.headers.get("x-aequilibri-timestamp"),
    signatureHeader: request.headers.get("x-aequilibri-signature"),
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 6b. Default-deny: when the control base is on, the channel must have an
  // active inbound connection for this org. Signature-only when control is off.
  if (controlEnabled() && !(await getActiveConnection(orgSlug, channel, "in"))) {
    return NextResponse.json(
      { error: `Channel '${channel}' is not enabled for this org` },
      { status: 403 },
    );
  }

  // 7. Ingest through the shared Module 2 pipeline. Attachments arrive base64.
  const attachments = (payload.attachments ?? [])
    .filter((a) => a?.contentBase64)
    .map((a) => ({
      name: String(a.name ?? "attachment"),
      mimeType: String(a.mimeType ?? "application/octet-stream"),
      buf: Buffer.from(String(a.contentBase64), "base64"),
    }));

  try {
    const result = await ingestInboundMessage(ctx, `${channel} webhook`, {
      channel,
      externalId,
      from: payload.from,
      subject: payload.subject,
      body: payload.body,
      receivedAt: payload.receivedAt,
      jobId: payload.jobId,
      attachments,
    });
    await touchConnectionHealth(orgSlug, channel, "in", result.deduped ? "ok (deduped)" : "ok");
    return NextResponse.json({ ok: true, orgSlug, channel, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await touchConnectionHealth(orgSlug, channel, "in", `error: ${message}`);
    return NextResponse.json({ ok: false, orgSlug, channel, error: message }, { status: 500 });
  }
}
