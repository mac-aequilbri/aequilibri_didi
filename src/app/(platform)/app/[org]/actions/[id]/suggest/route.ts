// AI-assist for the action editor. A route handler (not a server action) so the
// editor can call it with fetch() and stay mounted — a server action would
// trigger an RSC refresh of this force-dynamic route and swap the whole subtree
// for the [org] loading fallback while it ran. Returns suggested field values
// the client fills in for the user to review before saving; writes nothing.

import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/claude";
import { isAppStatus } from "@/lib/platform/actionStatus";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const SUGGEST_SYSTEM = `You are an operations assistant helping a construction/field-service manager tidy up an action item on their register.

Given the action's current fields, propose improved values: fill in anything missing or vague, tighten the description, and pick sensible priority/status. Do NOT invent facts you can't infer (e.g. don't fabricate a specific person's name for owner or a precise due date unless the text clearly implies one — leave those blank instead).

Return ONLY minified JSON, no prose, no code fences, in exactly this shape:
{"title":"...","detail":"...","owner":"...","dueDate":"YYYY-MM-DD","priority":"P1|P2|P3","status":"open|in_progress|done|deferred","note":"one short sentence on what you changed"}

Rules:
- priority is exactly one of P1, P2, P3 (P1 = urgent).
- status is exactly one of open, in_progress, done, deferred.
- dueDate is YYYY-MM-DD or "" if not inferable.
- Omit or blank any field you have no basis to suggest — never fabricate names or dates.
- JSON only.`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ org: string; id: string }> },
) {
  const { org } = await params;
  const ctx = await requireOrgCtx(org);
  await getCurrentUser(ctx); // gate on an authorised user

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty body is fine — the model just gets blanks */
  }

  const current = {
    title: str(body.title),
    detail: str(body.detail),
    owner: str(body.owner),
    dueDate: str(body.dueDate),
    priority: str(body.priority),
    status: str(body.status),
    issueType: str(body.issueType),
  };

  const res = await callClaude(SUGGEST_SYSTEM, JSON.stringify(current), { maxTokens: 800 });
  if (res.demo_mode) {
    return NextResponse.json({
      ok: true,
      demo: true,
      note: "Demo mode — set ANTHROPIC_API_KEY to get real suggestions.",
    });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(res.content.replace(/^```(json)?|```$/g, "").trim());
  } catch {
    return NextResponse.json({ ok: false, error: "The assistant returned something unexpected. Try again." });
  }

  const ps = str(parsed.priority).toUpperCase();
  const ss = str(parsed.status).toLowerCase();
  const suggestion = {
    title: str(parsed.title).trim() || undefined,
    detail: str(parsed.detail).trim() || undefined,
    owner: str(parsed.owner).trim() || undefined,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(str(parsed.dueDate)) ? str(parsed.dueDate) : undefined,
    priority: ["P1", "P2", "P3"].includes(ps) ? ps : undefined,
    status: isAppStatus(ss) ? ss : undefined,
  };
  return NextResponse.json({
    ok: true,
    note: str(parsed.note).trim() || "Suggested edits ready — review and save.",
    suggestion,
  });
}
