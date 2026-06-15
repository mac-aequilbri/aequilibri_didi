// Record writer with typecast (Platform Architecture doc utility layer).
// Every platform mutation goes through writeRecord: input is Zod-validated and
// type-coerced, orgId is force-stamped, and a PlatExecutionLog row is written.
// With requireApproval the write is NOT performed — a PlatPendingWrite
// proposal is queued instead, and executeProposal() performs the deferred
// write once a human approves it (proposals expire after 7 days). The
// execution log itself is append-only: workflow state lives on the pending
// row, audit events only ever get added.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { Actor, OrgCtx } from "./types";

// ── field helpers (typecast layer) ────────────────────────────────────

const id = z.coerce.number().int().positive();
const optId = z.preprocess((v) => (v === "" || v == null ? undefined : v), id.optional());
const num = z.coerce.number();
const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : v), num.optional());
const int = z.coerce.number().int();
const bool = z.preprocess(
  (v) => (typeof v === "string" ? ["true", "on", "1", "yes"].includes(v.toLowerCase()) : v),
  z.coerce.boolean(),
);
const date = z.coerce.date();
const optDate = z.preprocess((v) => (v === "" || v == null ? undefined : v), date.optional());
const str = (max: number) => z.string().trim().max(max);
const jsonStr = z
  .string()
  .refine((s) => {
    try {
      JSON.parse(s);
      return true;
    } catch {
      return false;
    }
  }, "must be valid JSON");

// ── table registry ────────────────────────────────────────────────────

interface TableDef {
  /** Physical table name recorded in the execution log. */
  physical: string;
  /** Prisma model delegate accessor. */
  delegate: () => {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: number }>;
    findFirst: (args: { where: Record<string, unknown> }) => Promise<{ id: number } | null>;
    update: (args: {
      where: { id: number };
      data: Record<string, unknown>;
    }) => Promise<{ id: number }>;
    delete: (args: { where: { id: number } }) => Promise<unknown>;
  };
  create: z.ZodTypeAny;
  update: z.ZodTypeAny;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const d = (m: any) => () => m as ReturnType<TableDef["delegate"]>;

// Update schema = create schema with every field optional AND defaults
// stripped — otherwise a partial update would silently reset omitted fields
// to their create-time defaults.
function partialNoDefaults(obj: z.ZodObject<z.ZodRawShape>): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [k, v] of Object.entries(obj.shape)) {
    let s: any = v;
    if (typeof s.removeDefault === "function") s = s.removeDefault();
    else if (s?.def?.type === "default" && typeof s.unwrap === "function") s = s.unwrap();
    shape[k] = (s as z.ZodTypeAny).optional();
  }
  return z.object(shape);
}
const upd = partialNoDefaults;
/* eslint-enable @typescript-eslint/no-explicit-any */

const actionSchema = z.object({
  jobId: optId,
  workstreamId: optId,
  title: str(300).min(1),
  detail: z.string().default(""),
  priority: z.enum(["P1", "P2", "P3"]).default("P2"),
  status: z.enum(["open", "in_progress", "done", "deferred"]).default("open"),
  owner: str(200).default(""),
  dueDate: optDate,
  sourceType: str(30).default("manual"),
  sourceId: optId,
  context: jsonStr.default("{}"),
});

const decisionSchema = z.object({
  jobId: optId,
  description: z.string().trim().min(1),
  rationale: z.string().default(""),
  alternatives: z.string().default(""),
  category: str(100).default(""),
  status: z.enum(["proposed", "confirmed", "superseded"]).default("proposed"),
  madeBy: str(200).default(""),
  sourceType: str(30).default("manual"),
  sourceId: optId,
  decidedAt: optDate,
});

const workstreamSchema = z.object({
  jobId: optId,
  name: str(200).min(1),
  description: z.string().default(""),
  milestone: str(300).default(""),
  status: str(30).default("active"),
  notes: z.string().default(""),
});

const learningRuleSchema = z.object({
  ruleCode: str(20).min(1),
  kind: z.enum(["guidance", "adjustment"]).default("guidance"),
  description: z.string().trim().min(1),
  category: str(100).default(""),
  dimension: str(100).default(""),
  triggerCondition: jsonStr.default("{}"),
  adjustment: jsonStr.default("{}"),
  priority: int.default(0),
  confidence: int.min(0).max(100).default(50),
  isActive: bool.default(true),
  autoApply: bool.default(false),
  cannotOverride: bool.default(false),
  sourceHypothesisId: optId,
  notes: z.string().default(""),
  dateActivated: optDate,
});

const jobSchema = z.object({
  code: str(50).min(1),
  name: str(300).min(1),
  engagementType: z
    .enum(["short_job", "long_project", "ongoing", "seasonal"])
    .default("long_project"),
  status: str(30).default("intake"),
  clientContactId: optId,
  address: str(400).default(""),
  suburb: str(100).default(""),
  lat: optNum,
  lng: optNum,
  startDate: optDate,
  targetEndDate: optDate,
  completionPct: int.min(0).max(100).default(0),
  healthScore: int.min(0).max(100).default(50),
  budgetTotal: num.default(0),
  summary: z.string().default(""),
  meta: jsonStr.default("{}"),
});

const contactSchema = z.object({
  name: str(200).min(1),
  type: str(30).default("client"),
  role: str(100).default(""),
  email: str(254).default(""),
  phone: str(30).default(""),
  company: str(200).default(""),
  notes: z.string().default(""),
  isActive: bool.default(true),
});

const documentSchema = z.object({
  jobId: optId,
  title: str(300).min(1),
  kind: z.enum(["file", "link", "generated"]).default("file"),
  docType: str(50).default(""),
  classification: str(50).default(""),
  storageProvider: str(20).default("local"),
  storageRef: str(800).default(""),
  mimeType: str(100).default(""),
  sizeBytes: int.default(0),
  version: int.default(1),
  parentDocumentId: optId,
  textContent: z.string().default(""),
  aiSummary: z.string().default(""),
  aiAnalysis: jsonStr.default("{}"),
  confidence: optId.pipe(z.number().min(0).max(100).optional()).optional(),
  status: str(30).default("uploaded"),
  uploadedBy: str(200).default(""),
  analyzedAt: optDate,
});

const phaseSchema = z.object({
  jobId: id,
  name: str(200).min(1),
  status: str(30).default("pending"),
  completionPct: int.min(0).max(100).default(0),
  sortOrder: int.default(0),
  startDate: optDate,
  endDate: optDate,
  isAiDraft: bool.default(false),
  approvedBy: str(200).default(""),
  evidenceSuggestion: jsonStr.default("{}"),
});

const phaseEvidenceSchema = z.object({
  jobId: id,
  phaseId: id,
  documentId: id,
  note: str(300).default(""),
  addedBy: str(200).default(""),
});

const budgetLineSchema = z.object({
  jobId: id,
  phaseId: optId,
  category: str(100).default(""),
  description: str(300).default(""),
  budgetAmount: num.default(0),
  committedAmount: num.default(0),
  actualAmount: num.default(0),
});

const cashflowSchema = z.object({
  jobId: id,
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM"),
  projected: num.default(0),
  actual: num.default(0),
  notes: z.string().default(""),
});

const riskSchema = z.object({
  jobId: id,
  description: z.string().trim().min(1),
  likelihood: int.min(1).max(5).default(3),
  impact: int.min(1).max(5).default(3),
  mitigation: z.string().default(""),
  status: z.enum(["open", "accepted", "mitigated", "closed"]).default("open"),
  owner: str(200).default(""),
  escalatedAt: optDate,
  escalationNote: z.string().default(""),
  createdByAi: bool.default(false),
});

const variationSchema = z.object({
  jobId: id,
  refNumber: str(30).default(""),
  title: str(300).min(1),
  description: z.string().default(""),
  scopeChange: z.string().default(""),
  costImpact: num.default(0),
  timeImpactDays: int.default(0),
  status: z.enum(["draft", "submitted", "approved", "rejected"]).default("draft"),
  isAiDrafted: bool.default(false),
  aiDraft: jsonStr.default("{}"),
  submittedBy: str(200).default(""),
  approvedBy: str(200).default(""),
  approvedAt: optDate,
});

const vendorSchema = z.object({
  name: str(200).min(1),
  category: str(100).default(""),
  contactName: str(200).default(""),
  contactEmail: str(254).default(""),
  contactPhone: str(30).default(""),
  rating: int.min(1).max(10).default(5),
  notes: z.string().default(""),
  isActive: bool.default(true),
});

const procurementSchema = z.object({
  jobId: id,
  item: str(300).min(1),
  category: str(100).default(""),
  vendorId: optId,
  vendorName: str(200).default(""),
  qty: num.default(1),
  unitPrice: num.default(0),
  total: num.default(0),
  status: str(30).default("pending"),
  dueDate: optDate,
});

const roomSchema = z.object({
  jobId: id,
  zone: str(100).default(""),
  name: str(200).min(1),
  areaSqm: optNum,
  ceilingHeight: str(50).default(""),
  finishes: jsonStr.default("{}"),
  notes: z.string().default(""),
});

const minutesSchema = z.object({
  jobId: id,
  meetingDate: date,
  title: str(300).default(""),
  attendees: str(500).default(""),
  rawMinutes: z.string().min(1),
  extractedActions: jsonStr.default("[]"),
  actionsCount: int.default(0),
  status: str(30).default("raw"),
  confirmedAt: optDate,
});

const weeklyReportSchema = z.object({
  jobId: id,
  weekEnding: date,
  title: str(300).default(""),
  content: z.string().default(""),
  isAiGenerated: bool.default(false),
  status: z.enum(["draft", "approved", "sent"]).default("draft"),
  approvedBy: str(200).default(""),
  approvedAt: optDate,
  sentAt: optDate,
  documentId: optId,
});

const bimModelSchema = z.object({
  jobId: id,
  name: str(200).min(1),
  provider: str(30).default("bimx"),
  embedUrl: str(800).min(1),
  clientVisible: bool.default(false),
  addedBy: str(200).default(""),
  notes: z.string().default(""),
});

const quoteSchema = z.object({
  jobId: id,
  refNumber: str(30).default(""),
  title: str(300).min(1),
  clientName: str(200).default(""),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]).default("draft"),
  gstRate: num.default(10),
  subtotal: num.default(0),
  gstAmount: num.default(0),
  total: num.default(0),
  notes: z.string().default(""),
  validUntil: optDate,
  isAiDrafted: bool.default(false),
  createdBy: str(200).default(""),
  sentAt: optDate,
  decidedAt: optDate,
});

const quoteLineSchema = z.object({
  quoteId: id,
  description: str(300).min(1),
  category: str(100).default(""),
  qty: num.default(1),
  unit: str(20).default("item"),
  unitPrice: num.default(0),
  lineTotal: num.default(0),
  sortOrder: int.default(0),
});

const portalTokenSchema = z.object({
  jobId: id,
  token: z.string().trim().min(32).max(64),
  label: str(200).default(""),
  isActive: bool.default(true),
  viewsCount: int.default(0),
  expiresAt: optDate,
});

const REGISTRY = {
  job: { physical: "plat_core_job", delegate: d(prisma.platJob), create: jobSchema, update: upd(jobSchema) },
  contact: { physical: "plat_core_contact", delegate: d(prisma.platContact), create: contactSchema, update: upd(contactSchema) },
  workstream: { physical: "plat_core_workstream", delegate: d(prisma.platWorkstream), create: workstreamSchema, update: upd(workstreamSchema) },
  action: { physical: "plat_core_actionhub", delegate: d(prisma.platActionHub), create: actionSchema, update: upd(actionSchema) },
  decision: { physical: "plat_core_decision", delegate: d(prisma.platDecision), create: decisionSchema, update: upd(decisionSchema) },
  learning_rule: { physical: "plat_core_learningrule", delegate: d(prisma.platLearningRule), create: learningRuleSchema, update: upd(learningRuleSchema) },
  document: { physical: "plat_core_document", delegate: d(prisma.platDocument), create: documentSchema, update: upd(documentSchema) },
  phase: { physical: "plat_con_phase", delegate: d(prisma.platConPhase), create: phaseSchema, update: upd(phaseSchema) },
  phase_evidence: { physical: "plat_con_phaseevidence", delegate: d(prisma.platConPhaseEvidence), create: phaseEvidenceSchema, update: upd(phaseEvidenceSchema) },
  budget_line: { physical: "plat_con_budgetline", delegate: d(prisma.platConBudgetLine), create: budgetLineSchema, update: upd(budgetLineSchema) },
  cashflow: { physical: "plat_con_cashflow", delegate: d(prisma.platConCashflow), create: cashflowSchema, update: upd(cashflowSchema) },
  risk: { physical: "plat_con_risk", delegate: d(prisma.platConRisk), create: riskSchema, update: upd(riskSchema) },
  variation_order: { physical: "plat_con_variationorder", delegate: d(prisma.platConVariationOrder), create: variationSchema, update: upd(variationSchema) },
  vendor: { physical: "plat_con_vendor", delegate: d(prisma.platConVendor), create: vendorSchema, update: upd(vendorSchema) },
  procurement: { physical: "plat_con_procurement", delegate: d(prisma.platConProcurement), create: procurementSchema, update: upd(procurementSchema) },
  room: { physical: "plat_con_roommatrix", delegate: d(prisma.platConRoomMatrix), create: roomSchema, update: upd(roomSchema) },
  meeting_minutes: { physical: "plat_con_meetingminutes", delegate: d(prisma.platConMeetingMinutes), create: minutesSchema, update: upd(minutesSchema) },
  weekly_report: { physical: "plat_con_weeklyreport", delegate: d(prisma.platConWeeklyReport), create: weeklyReportSchema, update: upd(weeklyReportSchema) },
  bim_model: { physical: "plat_con_bimmodel", delegate: d(prisma.platConBimModel), create: bimModelSchema, update: upd(bimModelSchema) },
  portal_token: { physical: "plat_con_portaltoken", delegate: d(prisma.platConPortalToken), create: portalTokenSchema, update: upd(portalTokenSchema) },
  quote: { physical: "plat_con_quote", delegate: d(prisma.platConQuote), create: quoteSchema, update: upd(quoteSchema) },
  quote_line: { physical: "plat_con_quoteline", delegate: d(prisma.platConQuoteLine), create: quoteLineSchema, update: upd(quoteLineSchema) },
} satisfies Record<string, TableDef>;

export type WritableTable = keyof typeof REGISTRY;

export const WRITABLE_TABLES = Object.keys(REGISTRY) as WritableTable[];

// ── write API ─────────────────────────────────────────────────────────

export interface WriteRequest {
  table: WritableTable;
  op: "create" | "update" | "delete";
  /** Required for update/delete. */
  recordId?: number;
  data?: unknown;
  actor: Actor;
  /** Persist a proposal instead of writing; executeProposal() completes it. */
  requireApproval?: boolean;
}

export interface WriteResult {
  status: "executed" | "proposed";
  recordId?: number;
  /** Audit row id (executed writes). */
  execLogId?: number;
  /** Approval-queue row id (proposed writes). */
  proposalId?: number;
}

/** Proposals not resolved within this window expire (stale data risk). */
const PROPOSAL_TTL_DAYS = 7;

function validated(def: TableDef, op: WriteRequest["op"], data: unknown): Record<string, unknown> {
  if (op === "delete") return {};
  const schema = op === "create" ? def.create : def.update;
  return schema.parse(data ?? {}) as Record<string, unknown>;
}

/** Validate + typecast without writing — used by forms and unit tests. */
export function validateRecord(
  table: WritableTable,
  op: "create" | "update",
  data: unknown,
): Record<string, unknown> {
  return validated(REGISTRY[table], op, data);
}

async function performWrite(
  ctx: OrgCtx,
  def: TableDef,
  op: WriteRequest["op"],
  recordId: number | undefined,
  data: Record<string, unknown>,
): Promise<number | undefined> {
  const delegate = def.delegate();
  if (op === "create") {
    // Learning-rule codes are allocated at WRITE time (deferred proposals
    // would otherwise collide on codes pre-allocated at propose time).
    if (def.physical === "plat_core_learningrule" && data.ruleCode === "AUTO") {
      const { createRuleWithCode } = await import("@/services/platform/learning");
      const { ruleCode: _auto, ...rest } = data;
      void _auto;
      const rule = await createRuleWithCode(ctx.orgId, rest as never);
      return rule.id;
    }
    const row = await delegate.create({ data: { ...data, orgId: ctx.orgId } });
    return row.id;
  }
  if (recordId == null) throw new Error(`${op} requires recordId`);
  // Tenancy guard: the target row must belong to this org.
  const existing = await delegate.findFirst({ where: { id: recordId, orgId: ctx.orgId } });
  if (!existing) throw new Error(`Record ${recordId} not found in this organisation`);
  if (op === "update") {
    const row = await delegate.update({ where: { id: recordId }, data });
    return row.id;
  }
  await delegate.delete({ where: { id: recordId } });
  return recordId;
}

export async function writeRecord(ctx: OrgCtx, req: WriteRequest): Promise<WriteResult> {
  const def: TableDef = REGISTRY[req.table];
  const data = validated(def, req.op, req.data);
  const jobId = typeof data.jobId === "number" ? data.jobId : undefined;

  if (req.requireApproval) {
    const pending = await prisma.platPendingWrite.create({
      data: {
        orgId: ctx.orgId,
        jobId,
        tableKey: req.table,
        op: req.op,
        recordId: req.recordId,
        payload: JSON.stringify(data),
        actorType: req.actor.type,
        actorName: req.actor.name,
        sourceMessageId: req.actor.sourceMessageId,
        status: "proposed",
        expiresAt: new Date(Date.now() + PROPOSAL_TTL_DAYS * 86_400_000),
      },
    });
    return { status: "proposed", proposalId: pending.id };
  }

  try {
    const recordId = await performWrite(ctx, def, req.op, req.recordId, data);
    const log = await prisma.platExecutionLog.create({
      data: {
        orgId: ctx.orgId,
        jobId,
        actorType: req.actor.type,
        actorName: req.actor.name,
        operation: req.op,
        targetTable: def.physical,
        targetId: recordId,
        payload: JSON.stringify({ table: req.table, op: req.op, data }),
        status: "executed",
        executedAt: new Date(),
        sourceMessageId: req.actor.sourceMessageId,
      },
    });
    return { status: "executed", recordId, execLogId: log.id };
  } catch (err) {
    await prisma.platExecutionLog
      .create({
        data: {
          orgId: ctx.orgId,
          jobId,
          actorType: req.actor.type,
          actorName: req.actor.name,
          operation: req.op,
          targetTable: def.physical,
          targetId: req.recordId,
          payload: JSON.stringify({ table: req.table, op: req.op, data }),
          status: "failed",
          error: String(err instanceof Error ? err.message : err).slice(0, 1000),
          sourceMessageId: req.actor.sourceMessageId,
        },
      })
      .catch(() => {});
    throw err;
  }
}

async function resolvePending(ctx: OrgCtx, proposalId: number) {
  const pending = await prisma.platPendingWrite.findFirst({
    where: { id: proposalId, orgId: ctx.orgId, status: "proposed" },
  });
  if (!pending) throw new Error("Proposal not found (already resolved?)");
  return pending;
}

/** Perform the deferred write behind a pending proposal. The execution log
 *  stays append-only: execution/rejection each ADD a row; only the pending
 *  row's workflow status mutates. */
export async function executeProposal(
  ctx: OrgCtx,
  proposalId: number,
  approvedBy: string,
): Promise<WriteResult> {
  const pending = await resolvePending(ctx, proposalId);

  if (pending.expiresAt < new Date()) {
    await prisma.platPendingWrite.update({
      where: { id: pending.id },
      data: { status: "expired", resolvedBy: approvedBy, resolvedAt: new Date() },
    });
    throw new Error(
      `Proposal #${pending.id} expired on ${pending.expiresAt.toISOString().slice(0, 10)} — the underlying data may have changed. Ask the assistant to re-propose.`,
    );
  }

  const def: TableDef | undefined = REGISTRY[pending.tableKey as WritableTable];
  if (!def) throw new Error(`Unknown table in proposal: ${pending.tableKey}`);
  const op = pending.op as WriteRequest["op"];

  try {
    // Re-validate: the schema may have tightened since the proposal was
    // stored, and stored dates revive as ISO strings.
    const data = validated(def, op, JSON.parse(pending.payload));
    const recordId = await performWrite(ctx, def, op, pending.recordId ?? undefined, data);
    const log = await prisma.platExecutionLog.create({
      data: {
        orgId: ctx.orgId,
        jobId: pending.jobId,
        actorType: pending.actorType,
        actorName: pending.actorName,
        operation: op,
        targetTable: def.physical,
        targetId: recordId,
        payload: pending.payload,
        status: "executed",
        approvedBy,
        executedAt: new Date(),
        sourceMessageId: pending.sourceMessageId,
        result: `Deferred write approved (proposal #${pending.id})`,
      },
    });
    await prisma.platPendingWrite.update({
      where: { id: pending.id },
      data: { status: "executed", resolvedBy: approvedBy, resolvedAt: new Date(), execLogId: log.id },
    });
    return { status: "executed", recordId, execLogId: log.id, proposalId: pending.id };
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err).slice(0, 1000);
    await prisma.platPendingWrite.update({
      where: { id: pending.id },
      data: { status: "failed", resolvedBy: approvedBy, resolvedAt: new Date(), error: message },
    });
    throw err;
  }
}

/** Reject a pending proposal; the write is never performed. */
export async function rejectProposal(
  ctx: OrgCtx,
  proposalId: number,
  rejectedBy: string,
  reason = "",
): Promise<void> {
  const pending = await resolvePending(ctx, proposalId);
  await prisma.platPendingWrite.update({
    where: { id: pending.id },
    data: { status: "rejected", resolvedBy: rejectedBy, resolvedAt: new Date(), error: reason },
  });
  await prisma.platExecutionLog
    .create({
      data: {
        orgId: ctx.orgId,
        jobId: pending.jobId,
        actorType: "human",
        actorName: rejectedBy,
        operation: "reject",
        targetTable: REGISTRY[pending.tableKey as WritableTable]?.physical ?? pending.tableKey,
        payload: pending.payload,
        status: "rejected",
        executedAt: new Date(),
        sourceMessageId: pending.sourceMessageId,
        result: reason || `Proposal #${pending.id} rejected`,
      },
    })
    .catch(() => {});
}
