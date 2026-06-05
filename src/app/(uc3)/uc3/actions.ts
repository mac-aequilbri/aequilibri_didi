"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma as db } from "@/lib/db";
import { callClaude } from "@/lib/claude";

async function getTenantId(): Promise<number | null> {
  try {
    const cookieStore = await cookies();
    const val = cookieStore.get("uc3_tenant_id")?.value;
    if (!val) return null; // No cookie → caller redirects to /uc3/select-tenant
    return Number(val);
  } catch {
    return null;
  }
}

// ── Tenant ────────────────────────────────────────────────────────────────────

export async function setActiveTenant(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  if (!tenantId) redirect("/uc3/select-tenant");
  const cookieStore = await cookies();
  cookieStore.set("uc3_tenant_id", tenantId, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/uc3");
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function createProject(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const name = (formData.get("name") as string)?.trim();
  const client = (formData.get("client") as string)?.trim() || "";
  const status = (formData.get("status") as string) || "planning";
  const startDateRaw = formData.get("startDate") as string | null;
  const endDateRaw = formData.get("endDate") as string | null;

  if (!name) redirect("/uc3/projects/new?error=name_required");

  await db.uc3Project.create({
    data: {
      tenantId,
      name,
      client,
      status,
      startDate: startDateRaw ? new Date(startDateRaw) : null,
      endDate: endDateRaw ? new Date(endDateRaw) : null,
      healthScore: 100,
    },
  });

  redirect("/uc3/projects");
}

export async function updateProject(idOrFormData: number | FormData, formData?: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const fd = formData ?? (idOrFormData as FormData);
  const id = typeof idOrFormData === "number" ? idOrFormData : Number(fd.get("id"));
  const name = (fd.get("name") as string)?.trim();
  const client = (fd.get("client") as string)?.trim() || "";
  const status = (fd.get("status") as string) || "planning";
  const startDateRaw = fd.get("startDate") as string | null;
  const endDateRaw = fd.get("endDate") as string | null;

  if (!name) redirect(`/uc3/projects/${id}/edit?error=name_required`);

  await db.uc3Project.updateMany({
    where: { id, tenantId },
    data: {
      name,
      client,
      status,
      startDate: startDateRaw ? new Date(startDateRaw) : null,
      endDate: endDateRaw ? new Date(endDateRaw) : null,
    },
  });

  redirect("/uc3/projects");
}

// ── Action Items ──────────────────────────────────────────────────────────────

export async function createActionItem(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || undefined;
  const owner = (formData.get("owner") as string)?.trim() || undefined;
  const dueDateRaw = formData.get("dueDate") as string;
  const priority = (formData.get("priority") as string) || "medium";
  const projectIdRaw = formData.get("projectId") as string;
  const phaseIdRaw = formData.get("phaseId") as string;

  if (!title) redirect("/uc3/actions/new?error=title_required");
  if (!projectIdRaw) redirect("/uc3/actions/new?error=project_required");

  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const projectId = Number(projectIdRaw);
  const phaseId = phaseIdRaw ? Number(phaseIdRaw) : null;

  await db.uc3ActionItem.create({
    data: {
      tenantId,
      projectId,
      phaseId: phaseId ?? undefined,
      title,
      description,
      owner,
      dueDate,
      priority: priority as "low" | "medium" | "high" | "critical",
      status: "open",
      createdByAi: false,
    },
  });

  redirect("/uc3/actions");
}

export async function updateActionItem(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const id = Number(formData.get("id"));
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || undefined;
  const owner = (formData.get("owner") as string)?.trim() || undefined;
  const dueDateRaw = formData.get("dueDate") as string;
  const priority = (formData.get("priority") as string) || "medium";
  const status = (formData.get("status") as string) || "open";

  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;

  try {
    await db.uc3ActionItem.updateMany({
      where: { id, tenantId },
      data: {
        title: title || undefined,
        description,
        owner,
        dueDate,
        priority: priority as "low" | "medium" | "high" | "critical",
        status: status as "open" | "in_progress" | "complete" | "overdue" | "cancelled",
      },
    });
  } catch {
    // silent
  }

  revalidatePath("/uc3/actions");
}

// ── Risks ─────────────────────────────────────────────────────────────────────

export async function createRisk(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const description = (formData.get("description") as string)?.trim();
  const owner = (formData.get("owner") as string)?.trim() || undefined;
  const likelihood = parseInt(formData.get("likelihood") as string, 10) || 3;
  const impact = parseInt(formData.get("impact") as string, 10) || 3;
  const mitigation = (formData.get("mitigation") as string)?.trim() || undefined;
  const projectIdRaw = formData.get("projectId") as string;

  if (!description) redirect("/uc3/risks/new?error=description_required");
  if (!projectIdRaw) redirect("/uc3/risks/new?error=project_required");
  const projectId = Number(projectIdRaw);

  await db.uc3Risk.create({
    data: {
      tenantId,
      projectId,
      description,
      owner,
      likelihood,
      impact,
      mitigation,
      status: "open",
      createdByAi: false,
    },
  });

  redirect("/uc3/risks");
}

export async function escalateRisk(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const id = Number(formData.get("id"));
  const likelihood = parseInt(formData.get("likelihood") as string, 10) || 1;
  const impact = parseInt(formData.get("impact") as string, 10) || 1;

  if (!id) redirect("/uc3/risk-escalation");

  const score = likelihood * impact;

  try {
    await db.uc3Risk.updateMany({
      where: { id, tenantId },
      data: {
        escalatedAt: new Date(),
        escalationNote: `Auto-escalated: score ${score}`,
      },
    });
  } catch {
    // silent
  }

  revalidatePath("/uc3/risk-escalation");
}

export async function escalateAllRisks(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const candidates = await db.uc3Risk.findMany({
    where: { tenantId, status: "open", escalatedAt: null },
    select: { id: true, likelihood: true, impact: true },
  });

  const toEscalate = candidates.filter((r) => r.likelihood * r.impact >= 15);

  if (toEscalate.length > 0) {
    const now = new Date();
    await db.$transaction(
      toEscalate.map((r) =>
        db.uc3Risk.update({
          where: { id: r.id },
          data: {
            escalatedAt: now,
            escalationNote: `Auto-escalated: score ${r.likelihood * r.impact}`,
          },
        })
      )
    );
  }

  redirect("/uc3/risk-escalation");
}

// ── Budget Lines ──────────────────────────────────────────────────────────────

export async function createBudgetLine(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const description = (formData.get("description") as string)?.trim();
  const estimatedRaw = formData.get("estimated") as string;
  const projectIdRaw = formData.get("projectId") as string;
  const phaseIdRaw = formData.get("phaseId") as string;

  if (!description) redirect("/uc3/budget/new?error=desc_required");

  const estimated = parseFloat(estimatedRaw);
  if (isNaN(estimated)) redirect("/uc3/budget/new?error=estimated_required");

  if (!projectIdRaw) redirect("/uc3/budget/new?error=project_required");
  const projectId = Number(projectIdRaw);
  const phaseId = phaseIdRaw ? Number(phaseIdRaw) : null;

  await db.uc3Budget.create({
    data: {
      tenantId,
      projectId,
      phaseId: phaseId ?? undefined,
      description,
      estimated,
      actual: 0,
    },
  });

  redirect("/uc3/budget");
}

export async function updateBudgetLine(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const id = Number(formData.get("id"));
  const actualRaw = formData.get("actual") as string;
  const projectIdRaw = formData.get("projectId") as string;
  const projectId = projectIdRaw ? Number(projectIdRaw) : null;

  if (!id) redirect("/uc3/budget");

  const actual = parseFloat(actualRaw);
  if (isNaN(actual)) redirect("/uc3/budget");

  try {
    const existing = await db.uc3Budget.findFirst({ where: { id, tenantId } });
    if (existing) {
      const estimated = Number(existing.estimated);
      const variance = actual - estimated;
      const variancePct = estimated !== 0 ? (variance / estimated) * 100 : 0;

      await db.uc3Budget.updateMany({
        where: { id, tenantId },
        data: { actual },
      });

      await db.uc3ExecutionLog.create({
        data: {
          tenantId,
          projectId: projectId ?? existing.projectId ?? undefined,
          toolName: "update_budget_actual",
          payload: JSON.stringify({ budgetId: id, actual }),
          result: "Budget actual updated",
          status: "success",
          aiAuthority: "human_action", // User-initiated write; AI is blocked from this field.
        },
      });
    }
  } catch {
    // silent
  }

  revalidatePath("/uc3/budget");
}

// ── Cashflow ──────────────────────────────────────────────────────────────────

export async function createCashflowEntry(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const projectIdRaw = formData.get("projectId") as string;
  const period = (formData.get("period") as string)?.trim();
  const projectedRaw = formData.get("projected") as string;

  if (!period || !/^\d{4}-\d{2}$/.test(period))
    redirect("/uc3/cashflow/new?error=period_required");

  const projected = parseFloat(projectedRaw);
  if (isNaN(projected)) redirect("/uc3/cashflow/new?error=projected_required");

  if (!projectIdRaw) redirect("/uc3/cashflow/new?error=project_required");
  const projectId = Number(projectIdRaw);

  await db.uc3Cashflow.create({
    data: {
      tenantId,
      projectId,
      period,
      projected,
      actual: 0,
    },
  });

  redirect("/uc3/cashflow");
}

export async function updateCashflowActual(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const id = Number(formData.get("id"));
  const actualRaw = formData.get("actual") as string;
  const projectIdRaw = formData.get("projectId") as string;
  const projectId = projectIdRaw ? Number(projectIdRaw) : null;

  if (!id) redirect("/uc3/cashflow");

  const actual = parseFloat(actualRaw);
  if (isNaN(actual)) redirect("/uc3/cashflow");

  try {
    const existing = await db.uc3Cashflow.findFirst({ where: { id, tenantId } });
    if (existing) {
      await db.uc3Cashflow.updateMany({
        where: { id, tenantId },
        data: { actual },
      });

      await db.uc3ExecutionLog.create({
        data: {
          tenantId,
          projectId: projectId ?? existing.projectId ?? undefined,
          toolName: "update_cashflow_actual",
          payload: JSON.stringify({ cashflowId: id, actual }),
          result: "Cashflow actual updated",
          status: "success",
          aiAuthority: "human_action", // User-initiated write; AI is blocked from this field.
        },
      });
    }
  } catch {
    // silent
  }

  revalidatePath("/uc3/cashflow");
}

// ── Vendors ───────────────────────────────────────────────────────────────────

export async function createVendor(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const name = (formData.get("name") as string)?.trim();
  if (!name) redirect("/uc3/vendors/new?error=name_required");

  const category = (formData.get("category") as string)?.trim() || undefined;
  const contactName = (formData.get("contactName") as string)?.trim() || undefined;
  const contactEmail = (formData.get("contactEmail") as string)?.trim() || undefined;
  const contactPhone = (formData.get("contactPhone") as string)?.trim() || undefined;
  const ratingRaw = formData.get("rating") as string | null;
  const rating = ratingRaw ? parseInt(ratingRaw, 10) : undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;

  await db.uc3Vendor.create({
    data: {
      tenantId,
      name,
      category,
      contactName,
      contactEmail,
      contactPhone,
      rating,
      notes,
      isActive: true,
    },
  });

  redirect("/uc3/vendors");
}

export async function updateVendor(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const id = Number(formData.get("id"));
  const name = (formData.get("name") as string)?.trim();
  const category = (formData.get("category") as string)?.trim() || undefined;
  const contactName = (formData.get("contactName") as string)?.trim() || undefined;
  const contactEmail = (formData.get("contactEmail") as string)?.trim() || undefined;
  const contactPhone = (formData.get("contactPhone") as string)?.trim() || undefined;
  const ratingRaw = formData.get("rating") as string | null;
  const rating = ratingRaw ? parseInt(ratingRaw, 10) : undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;
  const isActiveRaw = formData.get("isActive") as string | null;
  const isActive = isActiveRaw !== "false";

  try {
    await db.uc3Vendor.updateMany({
      where: { id, tenantId },
      data: {
        name: name || undefined,
        category,
        contactName,
        contactEmail,
        contactPhone,
        rating,
        notes,
        isActive,
      },
    });
  } catch {
    // silent
  }

  revalidatePath("/uc3/vendors");
}

// ── Variation Orders ──────────────────────────────────────────────────────────

async function nextVoRefNumber(tenantId: number, projectId: number | null): Promise<string> {
  const count = await db.uc3VariationOrder.count({
    where: { tenantId, projectId: projectId ?? undefined },
  });
  const seq = String(count + 1).padStart(3, "0");
  const proj = String(projectId ?? 0).padStart(3, "0");
  return `VO-${proj}-${seq}`;
}

export async function createVariationOrder(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || "";
  const scopeChange = (formData.get("scopeChange") as string)?.trim() || "";
  const costImpactRaw = formData.get("costImpact") as string;
  const timeImpactRaw = formData.get("timeImpactDays") as string;
  const submittedBy = (formData.get("submittedBy") as string)?.trim() || undefined;
  const projectIdRaw = formData.get("projectId") as string;

  if (!title) redirect("/uc3/variations/new?error=title_required");
  if (!projectIdRaw) redirect("/uc3/variations/new?error=project_required");
  const projectId = Number(projectIdRaw);
  const costImpact = costImpactRaw ? parseFloat(costImpactRaw) : 0;
  const timeImpactDaysRaw = timeImpactRaw ? parseInt(timeImpactRaw, 10) : 0;
  const timeImpactDays = !isNaN(timeImpactDaysRaw) ? timeImpactDaysRaw : 0;
  const refNumber = await nextVoRefNumber(tenantId, projectId);

  const vo = await db.uc3VariationOrder.create({
    data: {
      tenantId,
      projectId,
      refNumber,
      title,
      description,
      scopeChange,
      costImpact,
      timeImpactDays,
      submittedBy,
      status: "draft",
      isAiDrafted: false,
    },
  });

  redirect("/uc3/variations");
}

export async function aiDraftVariation(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const projectIdRaw = formData.get("projectId") as string;
  const scopeChange = (formData.get("scopeChange") as string)?.trim() || "";
  const submittedBy = (formData.get("submittedBy") as string)?.trim() || undefined;

  if (!scopeChange) redirect("/uc3/variations/new?error=scope_required");
  if (!projectIdRaw) redirect("/uc3/variations/new?error=project_required");
  const projectId = Number(projectIdRaw);

  const systemPrompt =
    "You are a construction VO drafter. Return ONLY a JSON object with these exact keys: " +
    "{title, description, cost_impact_dollars, time_impact_days, cost_estimate_rationale, risk_flags}. " +
    "cost_impact_dollars must be a number (dollars, no currency symbol). " +
    "time_impact_days must be a number (integer days). " +
    "If unknown, use 0 for numeric fields.";

  const result = await callClaude(systemPrompt, scopeChange, { maxTokens: 1024 });

  let parsed: {
    title?: string;
    description?: string;
    cost_impact_dollars?: number;
    time_impact_days?: number;
    cost_estimate_rationale?: string;
    risk_flags?: string;
  } = {};
  try {
    const cleaned = result.content
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {
      title: "AI Draft Variation Order",
      description: scopeChange,
      cost_impact_dollars: 0,
      time_impact_days: 0,
      cost_estimate_rationale: "Pending review",
      risk_flags: "Review required",
    };
  }

  // Defensively coerce: the model may return strings even when asked for numbers.
  const costImpact = Number(parsed.cost_impact_dollars ?? 0) || 0;
  const timeImpactDays = Math.round(Number(parsed.time_impact_days ?? 0) || 0);

  const refNumber = await nextVoRefNumber(tenantId, projectId);

  const vo = await db.uc3VariationOrder.create({
    data: {
      tenantId,
      projectId: projectId ?? undefined,
      refNumber,
      title: parsed.title ?? "AI Draft Variation Order",
      description: parsed.description ?? "",
      scopeChange,
      costImpact,
      timeImpactDays,
      submittedBy,
      status: "draft",
      isAiDrafted: true,
    },
  });

  await db.uc3ExecutionLog.create({
    data: {
      tenantId,
      projectId: projectId ?? undefined,
      toolName: "variation_draft",
      payload: JSON.stringify({ scopeChange, submittedBy }),
      result: result.content,
      status: result.demo_mode ? "demo" : "success",
      aiAuthority: "approval_required",
    },
  });

  redirect("/uc3/variations");
}

export async function approveVariation(idOrFormData: number | FormData, formData?: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const fd = formData ?? (idOrFormData as FormData);
  const id = typeof idOrFormData === "number" ? idOrFormData : Number(fd.get("id"));
  const approvedBy = (fd.get("approvedBy") as string)?.trim() || undefined;

  try {
    await db.uc3VariationOrder.updateMany({
      where: { id, tenantId },
      data: { status: "approved", approvedBy, approvedAt: new Date() },
    });
  } catch {
    // silent
  }

  revalidatePath("/uc3/variations");
}

export async function rejectVariation(idOrFormData: number | FormData, formData?: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const fd = formData ?? (idOrFormData as FormData);
  const id = typeof idOrFormData === "number" ? idOrFormData : Number(fd.get("id"));

  try {
    await db.uc3VariationOrder.updateMany({
      where: { id, tenantId },
      data: { status: "rejected" },
    });
  } catch {
    // silent
  }

  revalidatePath("/uc3/variations");
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function createDocument(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const name = (formData.get("name") as string)?.trim();
  const projectIdRaw = formData.get("projectId") as string;
  const docType = (formData.get("docType") as string)?.trim() || undefined;
  const version = (formData.get("version") as string)?.trim() || undefined;
  const uploadedBy = (formData.get("uploadedBy") as string)?.trim() || undefined;
  const notes = (formData.get("notes") as string)?.trim() || undefined;
  const fileContent = (formData.get("fileContent") as string)?.trim() || undefined;

  if (!name) redirect("/uc3/documents/new?error=name_required");
  if (!projectIdRaw) redirect("/uc3/documents/new?error=project_required");
  const projectId = Number(projectIdRaw);

  const doc = await db.uc3Document.create({
    data: {
      tenantId,
      projectId,
      name,
      docType,
      version,
      uploadedBy,
      notes,
      fileContent,
      uploadDate: new Date(),
    },
  });

  redirect("/uc3/documents");
}

export async function analyzeDocument(docId: number, formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const id = docId || Number(formData.get("id"));
  if (!id) redirect("/uc3/documents");

  const doc = await db.uc3Document.findFirst({ where: { id, tenantId } });
  if (!doc) redirect("/uc3/documents");

  const systemPrompt =
    "You are a construction contract analyst. Identify: key clauses, financial terms, obligations, risk flags, recommended actions.";

  const userMessage = doc.fileContent?.slice(0, 4000) ?? "[empty]";

  const result = await callClaude(systemPrompt, userMessage, { maxTokens: 1500 });

  try {
    await db.uc3Document.update({
      where: { id },
      data: { aiAnalysis: result.content, analyzedAt: new Date() },
    });

    await db.uc3ExecutionLog.create({
      data: {
        tenantId,
        projectId: doc.projectId ?? undefined,
        toolName: "document_analysis",
        payload: JSON.stringify({ documentId: id }),
        result: result.content.slice(0, 500),
        status: result.demo_mode ? "demo" : "success",
        aiAuthority: "blocked",
      },
    });
  } catch {
    // silent
  }

  revalidatePath("/uc3/documents");
  redirect(`/uc3/documents/${id}/analyze`);
}

// ── Weekly Reports ────────────────────────────────────────────────────────────

export async function generateWeeklyReport(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const projectIdRaw = formData.get("projectId") as string;
  const weekEndingRaw = formData.get("weekEnding") as string;

  if (!projectIdRaw) redirect("/uc3/reports/generate?error=project_required");
  if (!weekEndingRaw) redirect("/uc3/reports/generate?error=week_required");

  const projectId = Number(projectIdRaw);
  const weekEnding = new Date(weekEndingRaw);

  const [project, phases, openActions, openRisks, budgets, cashflows, openVariations] =
    await Promise.all([
      db.uc3Project.findFirst({ where: { id: projectId, tenantId } }),
      db.uc3Phase.findMany({ where: { projectId, tenantId }, orderBy: { order: "asc" } }),
      db.uc3ActionItem.findMany({
        where: { projectId, tenantId, status: { in: ["open", "in_progress", "overdue"] } },
        orderBy: { dueDate: "asc" },
        take: 20,
      }),
      db.uc3Risk.findMany({
        where: { projectId, tenantId, status: { in: ["open", "accepted"] } },
        orderBy: { id: "desc" },
        take: 10,
      }),
      db.uc3Budget.findMany({ where: { projectId, tenantId }, orderBy: { id: "asc" } }),
      db.uc3Cashflow.findMany({ where: { projectId, tenantId }, orderBy: { period: "asc" } }),
      db.uc3VariationOrder.findMany({
        where: { projectId, tenantId, status: { in: ["draft", "pending", "submitted"] } },
        orderBy: { id: "desc" },
        take: 10,
        select: { refNumber: true, title: true, costImpact: true, timeImpactDays: true, status: true },
      }),
    ]);

  if (!project) redirect("/uc3/reports/generate?error=project_not_found");

  const contextStr = JSON.stringify({
    project,
    phases,
    openActions,
    openRisks,
    budgets,
    cashflows,
    openVariations,
  });

  const systemPrompt =
    "You are a construction project reporter. Generate a weekly status report in markdown: " +
    "executive summary, phase progress, budget status (including cashflow actuals vs projected), " +
    "open variation orders, open risks, open actions, recommendations.";

  const result = await callClaude(systemPrompt, contextStr, { maxTokens: 1500 });

  const weekEndingFormatted = weekEnding.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const title = `Weekly Report — ${project.name} — ${weekEndingFormatted}`;

  const report = await db.uc3WeeklyReport.create({
    data: {
      tenantId,
      projectId,
      weekEnding,
      title,
      content: result.content,
      isAiGenerated: true,
      status: "draft",
      generatedAt: new Date(),
    },
  });

  await db.uc3ExecutionLog.create({
    data: {
      tenantId,
      projectId,
      toolName: "weekly_report",
      payload: JSON.stringify({ projectId, weekEnding: weekEndingRaw }),
      result: result.demo_mode ? "demo_mode" : "success",
      status: result.demo_mode ? "demo" : "success",
      aiAuthority: "approval_required",
    },
  });

  redirect(`/uc3/reports/${report.id}`);
}

export async function approveReport(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const reportId = Number(formData.get("reportId"));
  const approvedBy = (formData.get("approvedBy") as string)?.trim() || undefined;

  try {
    await db.uc3WeeklyReport.updateMany({
      where: { id: reportId, tenantId },
      data: { status: "approved", approvedBy, approvedAt: new Date() },
    });
  } catch {
    // silent
  }

  revalidatePath(`/uc3/reports/${reportId}`);
}

export async function markReportSent(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const reportId = Number(formData.get("reportId"));

  try {
    await db.uc3WeeklyReport.updateMany({
      where: { id: reportId, tenantId },
      data: { status: "sent" },
    });
  } catch {
    // silent
  }

  revalidatePath(`/uc3/reports/${reportId}`);
}

export { approveReport as approveWeeklyReport, markReportSent as markWeeklyReportSent };

// ── Meeting Minutes ───────────────────────────────────────────────────────────

export async function processMeetingMinutes(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const projectIdRaw = formData.get("projectId") as string;
  const rawMinutes = (formData.get("rawMinutes") as string)?.trim();
  const meetingDateRaw = formData.get("meetingDate") as string;
  const title = (formData.get("title") as string)?.trim() || "";
  const attendees = (formData.get("attendees") as string)?.trim() || "";

  if (!projectIdRaw) redirect("/uc3/meeting-minutes/new?error=project_required");
  if (!rawMinutes) redirect("/uc3/meeting-minutes/new?error=minutes_required");

  const projectId = Number(projectIdRaw);
  const meetingDate = meetingDateRaw ? new Date(meetingDateRaw) : new Date();

  let record: { id: number } | null = null;
  try {
    record = await db.uc3MeetingMinutes.create({
      data: {
        tenantId,
        projectId,
        meetingDate,
        title,
        attendees,
        rawMinutes,
        extractedActions: "[]",
        actionsCount: 0,
        status: "raw",
      },
      select: { id: true },
    });
  } catch {
    redirect("/uc3/meeting-minutes/new?error=save_failed");
  }

  if (!record) redirect("/uc3/meeting-minutes/new?error=save_failed");

  const systemPrompt =
    "You are a meeting secretary. Extract action items. Return ONLY a JSON array: [{action,owner,due_date,priority}].";

  const result = await callClaude(systemPrompt, rawMinutes, { maxTokens: 1500 });

  type ExtractedEntry = { action: string; owner: string; due_date: string; priority: string };
  let extracted: ExtractedEntry[] = [];
  try {
    const cleaned = result.content
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) extracted = parsed as ExtractedEntry[];
  } catch {
    // leave empty
  }

  await db.uc3MeetingMinutes.update({
    where: { id: record.id },
    data: {
      extractedActions: JSON.stringify(extracted),
      actionsCount: extracted.length,
      status: "processed",
    },
  });

  await db.uc3ExecutionLog.create({
    data: {
      tenantId,
      projectId,
      toolName: "minutes_extraction",
      payload: JSON.stringify({ minutesId: record.id }),
      result: result.content.slice(0, 500),
      status: result.demo_mode ? "demo" : "success",
      aiAuthority: "full_write",
    },
  });

  redirect(`/uc3/meeting-minutes/${record.id}`);
}

export async function confirmMeetingMinutes(id: number, formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const projectIdRaw = formData.get("projectId") as string;
  const projectId = projectIdRaw ? Number(projectIdRaw) : null;

  const minutes = await db.uc3MeetingMinutes.findFirst({ where: { id, tenantId } });
  if (!minutes) redirect("/uc3/meeting-minutes");

  const extractedRaw = minutes.extractedActions;
  type ExtractedEntry = { action: string; owner: string; due_date: string; priority: string };
  let extracted: ExtractedEntry[] = [];
  try {
    if (Array.isArray(extractedRaw)) {
      extracted = extractedRaw as ExtractedEntry[];
    } else if (typeof extractedRaw === "string") {
      extracted = JSON.parse(extractedRaw) as ExtractedEntry[];
    }
  } catch {
    // leave empty
  }

  if (extracted.length > 0) {
    await db.$transaction(
      extracted.map((entry) =>
        db.uc3ActionItem.create({
          data: {
            tenantId,
            projectId: minutes.projectId ?? undefined,
            title: entry.action,
            owner: entry.owner || undefined,
            dueDate: entry.due_date ? new Date(entry.due_date) : null,
            priority: (["low", "medium", "high", "critical"].includes(entry.priority)
              ? entry.priority
              : "medium") as "low" | "medium" | "high" | "critical",
            status: "open",
            createdByAi: true,
          },
        })
      )
    );
  }

  await db.uc3MeetingMinutes.updateMany({
    where: { id, tenantId },
    data: { status: "confirmed" },
  });

  // Log the bulk action-item creation so it appears in the exec log.
  try {
    await db.uc3ExecutionLog.create({
      data: {
        tenantId,
        projectId: minutes.projectId ?? undefined,
        toolName: "minutes_confirm",
        payload: JSON.stringify({ minutesId: id, actionsCreated: extracted.length }),
        result: `Created ${extracted.length} action item(s) from meeting minutes.`,
        status: "success",
        aiAuthority: "approval_required",
      },
    });
  } catch {
    // Non-fatal.
  }

  const pid = projectId ?? minutes.projectId;
  redirect(`/uc3/actions${pid ? `?project=${pid}` : ""}`);
}

// ── AI Chat ───────────────────────────────────────────────────────────────────

export async function sendChatMessage(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const content = (formData.get("content") as string)?.trim();
  const projectIdRaw = formData.get("projectId") as string;
  const projectId = projectIdRaw ? Number(projectIdRaw) : null;

  if (!content) return;

  await db.uc3ChatMessage.create({
    data: {
      tenantId,
      projectId: projectId ?? undefined,
      role: "user",
      content,
      requiresApproval: false,
      approved: false,
    },
  });

  const [recentMessages, project, actionCount, riskCount] = await Promise.all([
    db.uc3ChatMessage.findMany({
      where: { tenantId, projectId: projectId ?? undefined },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    projectId
      ? db.uc3Project.findFirst({ where: { id: projectId, tenantId } })
      : Promise.resolve(null),
    db.uc3ActionItem.count({
      where: { tenantId, projectId: projectId ?? undefined, status: { in: ["open", "in_progress", "overdue"] } },
    }),
    db.uc3Risk.count({
      where: { tenantId, projectId: projectId ?? undefined, status: { in: ["open", "accepted"] } },
    }),
  ]);

  const contextSummary =
    `Project: ${project?.name ?? "All projects"} | Open Actions: ${actionCount} | Open Risks: ${riskCount}`;

  const systemPrompt =
    "You are a construction project AI assistant. " +
    "CRUD policy — Full write: ACTION_ITEMS, RISKS, VENDORS.rating, CASHFLOWS.projected. " +
    "Requires approval: PHASES, DECISIONS. " +
    "BLOCKED: BUDGET.actual, PROJECT.creation, DOCUMENTS. " +
    "Prefix responses requiring approval with [REQUIRES_APPROVAL]. " +
    `Context: ${contextSummary}`;

  const result = await callClaude(systemPrompt, content, { maxTokens: 1024 });

  const requiresApproval = result.content.includes("[REQUIRES_APPROVAL]");

  const assistantMsg = await db.uc3ChatMessage.create({
    data: {
      tenantId,
      projectId: projectId ?? undefined,
      role: "assistant",
      content: result.content,
      requiresApproval,
      approved: false,
    },
  });

  await db.uc3ExecutionLog.create({
    data: {
      tenantId,
      projectId: projectId ?? undefined,
      toolName: "ai_chat",
      payload: JSON.stringify({ userMessage: content }),
      result: result.content.slice(0, 500),
      status: result.demo_mode ? "demo" : "success",
      aiAuthority: requiresApproval ? "approval_required" : "full_write",
    },
  });

  revalidatePath("/uc3/ai-chat");
}

export async function approveMessage(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const id = Number(formData.get("id"));
  if (!id) return;

  try {
    await db.uc3ChatMessage.updateMany({
      where: { id, tenantId },
      data: { requiresApproval: false, approved: true },
    });
  } catch {
    // silent
  }

  revalidatePath("/uc3/ai-chat");
}

export async function rejectMessage(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const id = Number(formData.get("id"));
  if (!id) return;

  try {
    await db.uc3ChatMessage.updateMany({
      where: { id, tenantId },
      data: { approved: false },
    });
  } catch {
    // silent
  }

  revalidatePath("/uc3/ai-chat");
}

// ── Client Portal Tokens ──────────────────────────────────────────────────────

export async function generatePortalToken(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const projectIdRaw = formData.get("projectId") as string;
  const label = (formData.get("label") as string)?.trim() || undefined;
  const expiresAtRaw = formData.get("expiresAt") as string | null;

  if (!projectIdRaw) redirect("/uc3/portal?error=project_required");

  const projectId = Number(projectIdRaw);
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
  const token = randomBytes(32).toString("hex");

  await db.uc3ClientPortalToken.create({
    data: {
      tenantId,
      projectId,
      token,
      label,
      isActive: true,
      viewsCount: 0,
      expiresAt,
    },
  });

  revalidatePath("/uc3/portal");
}

export async function deactivateToken(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const tokenId = Number(formData.get("tokenId"));
  if (!tokenId) redirect("/uc3/portal");

  try {
    await db.uc3ClientPortalToken.updateMany({
      where: { id: tokenId, tenantId },
      data: { isActive: false },
    });
  } catch {
    // silent
  }

  revalidatePath("/uc3/portal");
}

// ── Accounting ────────────────────────────────────────────────────────────────
// SECURITY TODO (D6): The `accessToken` field is stored as plain text.
// Before replacing this simulated flow with real OAuth (Xero/MYOB/QBO), the
// token MUST be encrypted at rest using a server-side key (e.g. AES-256-GCM
// with a key stored in an environment secret, not in the database). The current
// `demo-token-*` values are harmless, but the column will silently accept a
// real bearer token if the OAuth flow is wired in without this change.

export async function connectAccounting(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const provider = formData.get("provider") as string;
  if (!["xero", "myob", "qbo"].includes(provider)) redirect("/uc3/accounting");

  const existing = await db.uc3AccountingConnection.findFirst({ where: { tenantId, provider } });
  if (existing) {
    await db.uc3AccountingConnection.update({
      where: { id: existing.id },
      data: {
        status: "connected",
        orgName: "Demo Org (simulated)",
        accessToken: `demo-token-${Date.now()}`,
        recordsSynced: 42,
      },
    });
  } else {
    await db.uc3AccountingConnection.create({
      data: {
        tenantId,
        provider,
        status: "connected",
        orgName: "Demo Org (simulated)",
        accessToken: `demo-token-${Date.now()}`,
        recordsSynced: 42,
      },
    });
  }

  revalidatePath("/uc3/accounting");
}

export async function syncAccounting(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const provider = formData.get("provider") as string;
  if (!["xero", "myob", "qbo"].includes(provider)) redirect("/uc3/accounting");

  const connection = await db.uc3AccountingConnection.findFirst({
    where: { tenantId, provider },
  });

  if (!connection) redirect("/uc3/accounting");

  const now = new Date();
  const newLog = `${connection.syncLog ?? ""}\nSync completed at ${now.toISOString()}. No errors.`.trim();

  await db.uc3AccountingConnection.updateMany({
    where: { tenantId, provider },
    data: {
      lastSync: now,
      syncLog: newLog,
      recordsSynced: (connection.recordsSynced ?? 0) + 3,
    },
  });

  revalidatePath("/uc3/accounting");
}

export async function disconnectAccounting(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const provider = formData.get("provider") as string;
  if (!["xero", "myob", "qbo"].includes(provider)) redirect("/uc3/accounting");

  await db.uc3AccountingConnection.updateMany({
    where: { tenantId, provider },
    data: {
      status: "disconnected",
      accessToken: "",
      lastSync: null,
      syncLog: "",
    },
  });

  revalidatePath("/uc3/accounting");
}

// ── Delay Cascade Analysis ────────────────────────────────────────────────────

export async function analyzeDelayCascade(formData: FormData) {
  const tenantId = await getTenantId();
  if (!tenantId) redirect("/uc3/select-tenant");

  const projectId = Number(formData.get("projectId"));
  const delayTrigger = (formData.get("delayTrigger") as string)?.trim();
  const delayDays = Number(formData.get("delayDays")) || 0;

  if (!projectId || !delayTrigger) {
    redirect(`/uc3/delay-cascade?project=${projectId}&error=missing_fields`);
  }

  const [project, phases, openRisks] = await Promise.all([
    db.uc3Project.findFirst({ where: { id: projectId, tenantId } }),
    db.uc3Phase.findMany({ where: { projectId, tenantId }, orderBy: { order: "asc" } }),
    db.uc3Risk.findMany({
      where: { projectId, tenantId, status: { in: ["open", "accepted"] } },
      orderBy: { id: "desc" },
    }),
  ]);

  if (!project) redirect("/uc3/delay-cascade");

  const systemPrompt =
    "You are a construction project scheduler. Analyse delay cascade impact. " +
    "Provide: affected phases, end-date shift, cost implications, mitigation recommendations.";

  const result = await callClaude(
    systemPrompt,
    JSON.stringify({ project, phases, openRisks, delayTrigger, delayDays }),
    { maxTokens: 1500 }
  );

  const log = await db.uc3ExecutionLog.create({
    data: {
      tenantId,
      projectId,
      toolName: "delay_cascade",
      payload: JSON.stringify({ projectId, delayTrigger, delayDays }),
      result: result.content,
      status: result.demo_mode ? "demo" : "success",
      aiAuthority: "approval_required",
    },
  });

  redirect(`/uc3/delay-cascade?project=${projectId}&log=${log.id}`);
}
