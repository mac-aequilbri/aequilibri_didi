"use server";

import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { callClaude } from "@/lib/claude";
import { randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export async function startSession(_formData: FormData) {
  const sessionId =
    "SESS-" + randomBytes(4).toString("hex").toUpperCase();

  await prisma.uc2ChatSession.create({
    data: { sessionId, startedAt: new Date() },
  });

  const jar = await cookies();
  jar.set("didi_session_id", sessionId, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  redirect("/uc2/chat");
}

export async function resetSession(_formData: FormData) {
  const jar = await cookies();
  const sessionId = jar.get("didi_session_id")?.value;

  if (sessionId) {
    try {
      await prisma.uc2ChatSession.updateMany({
        where: { sessionId },
        data: { closedAt: new Date() },
      });
    } catch {
      // Graceful — session row may already be gone
    }
  }

  jar.set("didi_session_id", "", {
    maxAge: 0,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  redirect("/uc2/chat");
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const ACTION_VERBS = [
  "update",
  "change",
  "set",
  "write",
  "modify",
  "delete",
  "create",
  "add",
];
const DATA_NOUNS = [
  "budget",
  "action",
  "cashflow",
  "decision",
  "procurement",
];

function detectProposal(text: string): boolean {
  const lower = text.toLowerCase();
  const hasVerb = ACTION_VERBS.some((v) => lower.includes(v));
  const hasNoun = DATA_NOUNS.some((n) => lower.includes(n));
  return hasVerb && hasNoun;
}

const HYPOTHESIS_PATTERN =
  /\b(should|recommend|suggest|consider|could|would|might|pattern|trend|learn|rule)\b/i;

export async function sendMessage(formData: FormData) {
  const message = (formData.get("message") as string | null)?.trim() ?? "";
  const sessionKey = (formData.get("sessionKey") as string | null)?.trim();

  if (!message) {
    revalidatePath("/uc2/chat");
    return;
  }

  const jar = await cookies();
  const cookieSessionId = jar.get("didi_session_id")?.value;
  const resolvedSessionId = sessionKey ?? cookieSessionId ?? "";

  // Find or create the chat session row
  let chatSession = resolvedSessionId
    ? await prisma.uc2ChatSession.findUnique({
        where: { sessionId: resolvedSessionId },
      })
    : null;

  if (!chatSession) {
    const newId =
      resolvedSessionId ||
      "SESS-" + randomBytes(4).toString("hex").toUpperCase();
    chatSession = await prisma.uc2ChatSession.create({
      data: { sessionId: newId, startedAt: new Date() },
    });
    const jar2 = await cookies();
    jar2.set("didi_session_id", chatSession.sessionId, {
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
  }

  // Persist user message
  await prisma.uc2ChatMessage.create({
    data: {
      sessionId: chatSession.id,
      role: "user",
      content: message,
    },
  });

  // Load active learning rules and inject into the system prompt.
  // Safety limits:
  //   - Each rule description is capped at 400 chars to prevent runaway rule content.
  //   - Only the 20 most-recently-created rules are included to stay within a safe
  //     system-prompt budget (~8 000 chars total for the rules block).
  const MAX_RULES = 20;
  const MAX_RULE_DESC_CHARS = 400;

  let rulesText = "";
  try {
    const rules = await prisma.uc2LearningRule.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      take: MAX_RULES,
    });
    if (rules.length) {
      rulesText =
        "\n\nCRITICAL RULES (must never be overridden):\n" +
        rules
          .map((r) => {
            const desc = r.description.slice(0, MAX_RULE_DESC_CHARS);
            return `${r.ruleCode}: ${desc}${r.cannotOverride ? " [CANNOT OVERRIDE]" : ""}`;
          })
          .join("\n");
    }
  } catch {
    // Non-fatal
  }

  const systemPrompt =
    `You are Didi, the intelligent project management assistant for the Dulong Downs construction project. ` +
    `You have access to the project database and can query and propose updates to budget, actions, cashflow, decisions, and procurement records. ` +
    `Always be precise, data-driven, and flag risks proactively. ` +
    `When you propose a write/update, clearly state what you intend to change so the user can confirm or reject it.` +
    rulesText;

  const start = Date.now();
  let aiResult;
  try {
    aiResult = await callClaude(systemPrompt, message, { maxTokens: 1500 });
  } catch (e) {
    aiResult = {
      content: `[Error calling Claude: ${e}]`,
      tool_uses: [],
      demo_mode: false,
    };
  }
  const durationMs = Date.now() - start;

  const isProposal = detectProposal(aiResult.content);

  // Persist assistant message
  const assistantMsg = await prisma.uc2ChatMessage.create({
    data: {
      sessionId: chatSession.id,
      role: "assistant",
      content: aiResult.content,
      toolCalls: JSON.stringify(aiResult.tool_uses),
      hasProposal: isProposal,
    },
  });

  // Log execution
  try {
    await prisma.uc2ExecutionLog.create({
      data: {
        toolName: "sendMessage",
        payload: JSON.stringify({ message: message.slice(0, 200), sessionId: chatSession.sessionId }),
        result: JSON.stringify({
          messageId: assistantMsg.id,
          demo_mode: aiResult.demo_mode,
        }),
        status: "success",
        durationMs,
        sessionId: chatSession.sessionId,
      },
    });
  } catch {
    // Non-fatal
  }

  // Auto-create hypothesis if response is substantive and matches keywords
  if (
    aiResult.content.length > 200 &&
    HYPOTHESIS_PATTERN.test(aiResult.content)
  ) {
    try {
      await prisma.uc2Hypothesis.create({
        data: {
          description: aiResult.content.slice(0, 500),
          sourceSession: chatSession.sessionId,
          evidence: `Auto-extracted from assistant response (message id ${assistantMsg.id})`,
          status: "pending",
        },
      });
    } catch {
      // Non-fatal
    }
  }

  revalidatePath("/uc2/chat");
}

export async function confirmProposal(formData: FormData) {
  const messageId = Number(formData.get("msgId"));

  await prisma.uc2ChatMessage.update({
    where: { id: messageId },
    data: { proposalConfirmed: true },
  });

  await prisma.uc2ChangeLog.create({
    data: {
      tableName: "Uc2ChatMessage",
      recordId: String(messageId),
      field: "proposalConfirmed",
      oldValue: "false",
      newValue: "true",
      changedBy: "User",
      confirmedBy: "User",
    },
  });

  revalidatePath("/uc2/chat");
}

export async function rejectProposal(formData: FormData) {
  const messageId = Number(formData.get("msgId"));

  if (messageId) {
    try {
      // Clear hasProposal so the amber "confirm?" banner disappears from the UI.
      await prisma.uc2ChatMessage.update({
        where: { id: messageId },
        data: { hasProposal: false },
      });

      // Record the rejection in the audit log.
      await prisma.uc2ChangeLog.create({
        data: {
          tableName: "Uc2ChatMessage",
          recordId: String(messageId),
          field: "proposalRejected",
          oldValue: "false",
          newValue: "true",
          changedBy: "User",
          confirmedBy: "User",
        },
      });
    } catch {
      // Non-fatal — degrade gracefully.
    }
  }

  revalidatePath("/uc2/chat");
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createAction(formData: FormData) {
  const action = (formData.get("action") as string | null)?.trim() ?? "";
  const owner =
    (formData.get("owner") as string | null)?.trim() ?? "Unassigned";
  const dueDateRaw = formData.get("dueDate") as string | null;
  const priority =
    ((formData.get("priority") as string | null) ?? "medium") as
      | "low"
      | "medium"
      | "high"
      | "critical";
  const categoryId = formData.get("categoryId")
    ? Number(formData.get("categoryId"))
    : null;
  const zoneId = formData.get("zoneId")
    ? Number(formData.get("zoneId"))
    : null;
  const notes = (formData.get("notes") as string | null)?.trim() || undefined;

  if (!action) throw new Error("Action is required");

  await prisma.uc2ActionHub.create({
    data: {
      action,
      owner,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      status: "open",
      priority,
      categoryId,
      zoneId,
      notes,
    },
  });

  redirect("/uc2/actions");
}

export async function updateActionStatus(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = (formData.get("status") as string || "") as
    | "open"
    | "in_progress"
    | "complete"
    | "overdue";

  if (!id || !status) return;

  const existing = await prisma.uc2ActionHub.findUnique({ where: { id } });
  const oldStatus = existing?.status ?? "";

  await prisma.uc2ActionHub.update({ where: { id }, data: { status } });

  await prisma.uc2ChangeLog.create({
    data: {
      tableName: "Uc2ActionHub",
      recordId: String(id),
      field: "status",
      oldValue: oldStatus,
      newValue: status,
      changedBy: "User",
      confirmedBy: "User",
    },
  });

  revalidatePath("/uc2/actions");
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export async function createDecision(formData: FormData) {
  const description = String(formData.get("description") ?? "").trim();
  const madeBy = String(formData.get("madeBy") ?? "").trim();
  const dateRaw = formData.get("date");
  const status = String(formData.get("status") ?? "draft") as
    | "draft"
    | "confirmed"
    | "superseded";
  const rationale = String(formData.get("rationale") ?? "").trim();
  const categoryIdRaw = formData.get("categoryId");

  if (!description) throw new Error("Description is required");

  const decision = await prisma.uc2Decision.create({
    data: {
      description,
      madeBy: madeBy || "",
      date: dateRaw ? new Date(String(dateRaw)) : null,
      status,
      rationale: rationale || undefined,
      categoryId: categoryIdRaw ? Number(categoryIdRaw) : null,
    },
  });

  await prisma.uc2ChangeLog.create({
    data: {
      tableName: "Uc2Decision",
      recordId: String(decision.id),
      field: "created",
      oldValue: "",
      newValue: description.slice(0, 200),
      changedBy: "User",
      confirmedBy: "User",
    },
  });

  redirect("/uc2/decisions");
}

// ---------------------------------------------------------------------------
// Procurement
// ---------------------------------------------------------------------------

export async function createProcurement(formData: FormData) {
  const item = String(formData.get("item") ?? "").trim();
  const vendorName = String(formData.get("vendorName") ?? "").trim();
  const quantity = Number(formData.get("quantity") ?? 1);
  const unitPrice = Number(formData.get("unitPrice") ?? 0);
  const status = String(formData.get("status") ?? "pending") as
    | "pending"
    | "ordered"
    | "delivered"
    | "invoiced"
    | "paid";
  const dueDateRaw = formData.get("dueDate");
  const notes = String(formData.get("notes") ?? "").trim();
  const categoryId = formData.get("categoryId")
    ? Number(formData.get("categoryId"))
    : null;

  if (!item) throw new Error("Item is required");

  await prisma.uc2Procurement.create({
    data: {
      item,
      vendorName: vendorName || "",
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      status,
      dueDate: dueDateRaw ? new Date(String(dueDateRaw)) : null,
      notes: notes || undefined,
      categoryId,
    },
  });

  redirect("/uc2/procurement");
}

export async function updateProcurementStatus(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = (formData.get("status") as string || "") as
    | "pending"
    | "ordered"
    | "delivered"
    | "invoiced"
    | "paid";

  if (!id || !status) return;

  const existing = await prisma.uc2Procurement.findUnique({ where: { id } });
  const oldStatus = existing?.status ?? "";

  await prisma.uc2Procurement.update({ where: { id }, data: { status } });

  await prisma.uc2ChangeLog.create({
    data: {
      tableName: "Uc2Procurement",
      recordId: String(id),
      field: "status",
      oldValue: oldStatus,
      newValue: status,
      changedBy: "User",
      confirmedBy: "User",
    },
  });

  revalidatePath("/uc2/procurement");
}

// ---------------------------------------------------------------------------
// Learning Rules / Hypothesis
// ---------------------------------------------------------------------------
// promoteHypothesis lives in learning-rules/actions.ts (imported by that page).
// The duplicate that was here has been removed to prevent divergent rule-code
// formats (LRN-NNNN vs HYP-{id}-{timestamp}) and a stale reviewedBy value.
