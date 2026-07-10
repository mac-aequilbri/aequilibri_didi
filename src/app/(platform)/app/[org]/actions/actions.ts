"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { airtableEnabled, core } from "@/lib/airtable";
import { callClaude } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { STATUS_MAP_REF_TYPE, isAppStatus, normStatusKey } from "@/lib/platform/actionStatus";
import { formToObject } from "@/lib/platform/forms";
import { getCurrentUser, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { writeRecord } from "@/lib/platform/recordWriter";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function createActionItem(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate

  await writeRecord(ctx, {
    table: "action",
    op: "create",
    data: formToObject(formData),
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/actions"));
  redirect(orgPath(ctx.orgSlug, "/actions"));
}

export async function updateActionStatus(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate
  const recordIdRaw = String(formData.get("recordId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!recordIdRaw || !status) return;

  // recordWriter routes to Airtable (rec…) or Postgres (numeric) by id shape.
  await writeRecord(ctx, {
    table: "action",
    op: "update",
    recordId: recordIdRaw,
    data: { status },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/actions"));
}

/** Edit a single action's core fields from the detail page. Unlike the inline
 *  quick-set (updateActionStatus), this writes title/detail/owner/due/priority
 *  together. Presence-driven: the field map skips blanks so an untouched field
 *  isn't clobbered. */
export async function updateActionDetail(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  const user = await getCurrentUser(ctx); // also enforces the write gate
  const recordId = String(formData.get("recordId") ?? "");
  if (!recordId) return;

  await writeRecord(ctx, {
    table: "action",
    op: "update",
    recordId,
    data: {
      title: str(formData.get("title")),
      detail: str(formData.get("detail")),
      owner: str(formData.get("owner")),
      priority: str(formData.get("priority")) || "P2",
      status: str(formData.get("status")) || "open",
      dueDate: str(formData.get("dueDate")),
    },
    actor: { type: "human", name: user.name },
  });
  revalidatePath(orgPath(ctx.orgSlug, "/actions"));
  redirect(orgPath(ctx.orgSlug, "/actions"));
}

/** What the AI-assist returns to the editor: a suggested value per field plus a
 *  short rationale. Fields the model leaves blank are simply not suggested. */
export interface ActionSuggestion {
  title?: string;
  detail?: string;
  owner?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
}
export interface SuggestResult {
  ok: boolean;
  demo?: boolean;
  error?: string;
  note?: string;
  suggestion?: ActionSuggestion;
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

/** AI-assist for the editor: suggest edits / auto-fill missing fields. Returns a
 *  suggestion the client fills into the form for the user to review before
 *  saving — nothing is written here. Signature matches useActionState. */
export async function suggestActionEdits(
  _prev: SuggestResult | null,
  formData: FormData,
): Promise<SuggestResult> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await getCurrentUser(ctx); // gate on an authorised user

  const current = {
    title: str(formData.get("title")),
    detail: str(formData.get("detail")),
    owner: str(formData.get("owner")),
    dueDate: str(formData.get("dueDate")),
    priority: str(formData.get("priority")),
    status: str(formData.get("status")),
    issueType: str(formData.get("issueType")),
  };

  const res = await callClaude(SUGGEST_SYSTEM, JSON.stringify(current), { maxTokens: 800 });
  if (res.demo_mode) {
    return { ok: true, demo: true, note: "Demo mode — set ANTHROPIC_API_KEY to get real suggestions." };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(res.content.replace(/^```(json)?|```$/g, "").trim());
  } catch {
    return { ok: false, error: "The assistant returned something unexpected. Try again." };
  }

  const ps = str(parsed.priority).toUpperCase();
  const ss = str(parsed.status).toLowerCase();
  const suggestion: ActionSuggestion = {
    title: str(parsed.title).trim() || undefined,
    detail: str(parsed.detail).trim() || undefined,
    owner: str(parsed.owner).trim() || undefined,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(str(parsed.dueDate)) ? str(parsed.dueDate) : undefined,
    priority: ["P1", "P2", "P3"].includes(ps) ? ps : undefined,
    status: isAppStatus(ss) ? ss : undefined,
  };
  return { ok: true, note: str(parsed.note).trim() || "Suggested edits ready — review and save.", suggestion };
}

/** Save (or update) a per-org raw→canonical action-status mapping. This is the
 *  non-destructive cleanup for migrated bases: it records how to interpret an
 *  unrecognised Status value, never touching the ISSUES rows themselves. Stored
 *  as a PLAT_CFG_REFERENCE row (Ref_Type=action_status_map). */
export async function saveStatusMapping(formData: FormData): Promise<void> {
  const ctx = await requireOrgCtx(String(formData.get("org") ?? ""));
  await getCurrentUser(ctx); // enforces the write gate
  const raw = String(formData.get("raw") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!raw || !isAppStatus(status)) return;
  const code = normStatusKey(raw);

  if (airtableEnabled()) {
    const rows = await core.list(ctx.orgSlug, "PLAT_CFG_REFERENCE", { maxRecords: 500 });
    const existing = rows.find(
      (r) => str(r["Ref_Type"]) === STATUS_MAP_REF_TYPE && str(r["Code"]) === code,
    );
    const fields = {
      Name: raw,
      Ref_Type: STATUS_MAP_REF_TYPE,
      Code: code,
      Value: status,
      Is_Active: true,
    };
    if (existing) await core.update(ctx.orgSlug, "PLAT_CFG_REFERENCE", existing.id, fields);
    else await core.create(ctx.orgSlug, "PLAT_CFG_REFERENCE", fields);
  } else {
    const existing = await prisma.platCfgReference.findFirst({
      where: { orgId: ctx.orgId, type: STATUS_MAP_REF_TYPE, code },
    });
    if (existing) {
      await prisma.platCfgReference.update({
        where: { id: existing.id },
        data: { value: status, name: raw, isActive: true },
      });
    } else {
      await prisma.platCfgReference.create({
        data: { orgId: ctx.orgId, type: STATUS_MAP_REF_TYPE, code, name: raw, value: status, sortOrder: 0 },
      });
    }
  }
  revalidatePath(orgPath(ctx.orgSlug, "/actions"));
  revalidatePath(orgPath(ctx.orgSlug)); // dashboard shares the definition
}
