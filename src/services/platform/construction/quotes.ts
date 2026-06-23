// Quotation — client-facing priced offers for a job. A quote holds priced
// line items; the service keeps the money totals (subtotal, GST, total)
// correct whenever lines change, so the UI never has to. Quotes can be
// generated from the job's assessment budget breakdown (the common path) or
// built line by line. Status lifecycle: draft → sent → accepted/rejected
// (or expired). Every write goes through the audited recordWriter, which
// routes to Airtable or Postgres behind AIRTABLE_MIGRATION.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
import { loadJobContext } from "@/lib/platform/jobContextSource";
import { mulMoney, sumMoney } from "@/lib/platform/money";
import { writeRecord, type RecordId } from "@/lib/platform/recordWriter";
import { OrgCtx } from "@/lib/platform/types";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The lines belonging to a quote, in Airtable mode (linked by the Quote field).
 *  Airtable can't filter by linked-record id in a formula, so we read and match
 *  in app — fine at quote-line volumes. */
async function airtableQuoteLines(
  ctx: OrgCtx,
  quoteId: RecordId,
): Promise<Array<Record<string, unknown>>> {
  const rows = await core.list(ctx.orgSlug, "QUOTE_LINES", { maxRecords: 500 });
  const qid = String(quoteId);
  return rows.filter((r) => Array.isArray(r["Quote"]) && (r["Quote"] as string[]).includes(qid));
}

/** Next QUO-### code for this org (max existing suffix + 1). */
async function nextQuoteRef(ctx: OrgCtx): Promise<string> {
  let max = 0;
  if (airtableEnabled()) {
    const rows = await core.list(ctx.orgSlug, "QUOTES", { maxRecords: 500 });
    for (const r of rows) {
      const m = /^QUO-(\d+)$/.exec(String(r["Ref_Number"] ?? ""));
      if (m) max = Math.max(max, Number(m[1]));
    }
  } else {
    const quotes = await prisma.platConQuote.findMany({
      where: { orgId: ctx.orgId },
      select: { refNumber: true },
    });
    max = quotes.reduce((m, q) => {
      const match = /^QUO-(\d+)$/.exec(q.refNumber);
      return match ? Math.max(m, Number(match[1])) : m;
    }, 0);
  }
  return `QUO-${String(max + 1).padStart(3, "0")}`;
}

/** Recompute subtotal / GST / total from the quote's lines and persist them. */
export async function recalcQuoteTotals(ctx: OrgCtx, quoteId: RecordId): Promise<void> {
  let subtotal: number;
  let gstRate: number;
  if (airtableEnabled()) {
    const lines = await airtableQuoteLines(ctx, quoteId);
    subtotal = sumMoney(lines.map((l) => num(l["Line_Total"])));
    const quote = await core.get(ctx.orgSlug, "QUOTES", String(quoteId)).catch(() => null);
    if (!quote) return;
    gstRate = num(quote["GST_Rate"]) || 10;
  } else {
    const quote = await prisma.platConQuote.findFirst({
      where: { id: Number(quoteId), orgId: ctx.orgId },
      include: { lines: true },
    });
    if (!quote) return;
    subtotal = sumMoney(quote.lines.map((l) => l.lineTotal));
    gstRate = toNum(quote.gstRate);
  }
  const gstAmount = mulMoney(subtotal, gstRate / 100);
  const total = sumMoney([subtotal, gstAmount]);
  await writeRecord(ctx, {
    table: "quote",
    op: "update",
    recordId: quoteId,
    data: { subtotal, gstAmount, total },
    actor: { type: "system", name: "Quote totals" },
  });
}

export interface CreateQuoteInput {
  jobId: RecordId;
  title: string;
  clientName?: string;
  notes?: string;
  validUntil?: string;
  gstRate?: number;
}

export async function createQuote(
  ctx: OrgCtx,
  userName: string,
  input: CreateQuoteInput,
): Promise<RecordId> {
  const refNumber = await nextQuoteRef(ctx);
  const result = await writeRecord(ctx, {
    table: "quote",
    op: "create",
    data: {
      jobId: input.jobId,
      refNumber,
      title: input.title,
      clientName: input.clientName ?? "",
      notes: input.notes ?? "",
      validUntil: input.validUntil || undefined,
      gstRate: input.gstRate ?? 10,
      createdBy: userName,
    },
    actor: { type: "human", name: userName },
  });
  return result.recordId!;
}

/** Generate a quote for a job, pre-filled from its budget breakdown — one
 *  quote line per budget line (category/description, qty 1, price = budget). */
export async function generateQuoteFromBudget(
  ctx: OrgCtx,
  userName: string,
  jobId: RecordId,
): Promise<RecordId> {
  const job = await loadJobContext(ctx, jobId);
  if (!job) throw new Error("Job not found");

  const quoteId = await createQuote(ctx, userName, {
    jobId,
    title: `${job.name} — quotation`,
    clientName: job.clientName,
  });

  let sortOrder = 0;
  for (const line of job.budget) {
    sortOrder += 1;
    const unitPrice = line.budgetAmount;
    await writeRecord(ctx, {
      table: "quote_line",
      op: "create",
      data: {
        quoteId,
        // The budget category is the meaningful client-facing label; the
        // budget description is often boilerplate ("From intake assessment").
        description: line.category || line.description || "Item",
        category: "",
        qty: 1,
        unit: "item",
        unitPrice,
        lineTotal: unitPrice,
        sortOrder,
      },
      actor: { type: "human", name: userName },
    });
  }
  await recalcQuoteTotals(ctx, quoteId);
  return quoteId;
}

export interface QuoteLineInput {
  description: string;
  category?: string;
  qty: number;
  unit?: string;
  unitPrice: number;
}

/** Highest existing line sort-order for a quote, in either backend. */
async function nextLineSortOrder(ctx: OrgCtx, quoteId: RecordId): Promise<number> {
  if (airtableEnabled()) {
    const lines = await airtableQuoteLines(ctx, quoteId);
    return lines.reduce((m, l) => Math.max(m, num(l["Sort_Order"])), 0) + 1;
  }
  const last = await prisma.platConQuoteLine.findFirst({
    where: { quoteId: Number(quoteId) },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? 0) + 1;
}

export async function addQuoteLine(
  ctx: OrgCtx,
  userName: string,
  quoteId: RecordId,
  input: QuoteLineInput,
): Promise<void> {
  const sortOrder = await nextLineSortOrder(ctx, quoteId);
  await writeRecord(ctx, {
    table: "quote_line",
    op: "create",
    data: {
      quoteId,
      description: input.description,
      category: input.category ?? "",
      qty: input.qty,
      unit: input.unit ?? "item",
      unitPrice: input.unitPrice,
      lineTotal: mulMoney(input.qty, input.unitPrice),
      sortOrder,
    },
    actor: { type: "human", name: userName },
  });
  await recalcQuoteTotals(ctx, quoteId);
}

export async function updateQuoteLine(
  ctx: OrgCtx,
  userName: string,
  quoteId: RecordId,
  lineId: RecordId,
  input: QuoteLineInput,
): Promise<void> {
  await writeRecord(ctx, {
    table: "quote_line",
    op: "update",
    recordId: lineId,
    data: {
      description: input.description,
      category: input.category ?? "",
      qty: input.qty,
      unit: input.unit ?? "item",
      unitPrice: input.unitPrice,
      lineTotal: mulMoney(input.qty, input.unitPrice),
    },
    actor: { type: "human", name: userName },
  });
  await recalcQuoteTotals(ctx, quoteId);
}

export async function removeQuoteLine(
  ctx: OrgCtx,
  userName: string,
  quoteId: RecordId,
  lineId: RecordId,
): Promise<void> {
  await writeRecord(ctx, {
    table: "quote_line",
    op: "delete",
    recordId: lineId,
    actor: { type: "human", name: userName },
  });
  await recalcQuoteTotals(ctx, quoteId);
}

/** Move a quote through its lifecycle, stamping sent/decided timestamps. */
export async function setQuoteStatus(
  ctx: OrgCtx,
  userName: string,
  quoteId: RecordId,
  status: QuoteStatus,
): Promise<void> {
  const data: Record<string, unknown> = { status };
  if (status === "sent") data.sentAt = new Date().toISOString();
  if (status === "accepted" || status === "rejected") data.decidedAt = new Date().toISOString();
  await writeRecord(ctx, {
    table: "quote",
    op: "update",
    recordId: quoteId,
    data,
    actor: { type: "human", name: userName },
  });
}

export async function updateQuoteMeta(
  ctx: OrgCtx,
  userName: string,
  quoteId: RecordId,
  input: { title?: string; clientName?: string; notes?: string; validUntil?: string; gstRate?: number },
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.clientName !== undefined) data.clientName = input.clientName;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.validUntil !== undefined) data.validUntil = input.validUntil || null;
  const gstChanged = input.gstRate !== undefined;
  if (gstChanged) data.gstRate = input.gstRate;
  await writeRecord(ctx, {
    table: "quote",
    op: "update",
    recordId: quoteId,
    data,
    actor: { type: "human", name: userName },
  });
  if (gstChanged) await recalcQuoteTotals(ctx, quoteId);
}
