// Quotation — client-facing priced offers for a job. A quote holds priced
// line items; the service keeps the money totals (subtotal, GST, total)
// correct whenever lines change, so the UI never has to. Quotes can be
// generated from the job's assessment budget breakdown (the common path) or
// built line by line. Status lifecycle: draft → sent → accepted/rejected
// (or expired). Every write goes through the audited recordWriter.

import { prisma } from "@/lib/db";
import { toNum } from "@/lib/format";
import { mulMoney, sumMoney } from "@/lib/platform/money";
import { writeRecord } from "@/lib/platform/recordWriter";
import { OrgCtx } from "@/lib/platform/types";

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

/** Next QUO-### code for this org (max existing suffix + 1). */
async function nextQuoteRef(orgId: number): Promise<string> {
  const quotes = await prisma.platConQuote.findMany({
    where: { orgId },
    select: { refNumber: true },
  });
  const max = quotes.reduce((m, q) => {
    const match = /^QUO-(\d+)$/.exec(q.refNumber);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `QUO-${String(max + 1).padStart(3, "0")}`;
}

/** Recompute subtotal / GST / total from the quote's lines and persist them. */
export async function recalcQuoteTotals(ctx: OrgCtx, quoteId: number): Promise<void> {
  const quote = await prisma.platConQuote.findFirst({
    where: { id: quoteId, orgId: ctx.orgId },
    include: { lines: true },
  });
  if (!quote) return;
  const subtotal = sumMoney(quote.lines.map((l) => l.lineTotal));
  const gstAmount = mulMoney(subtotal, toNum(quote.gstRate) / 100);
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
  jobId: number;
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
): Promise<number> {
  const refNumber = await nextQuoteRef(ctx.orgId);
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
  jobId: number,
): Promise<number> {
  const job = await prisma.platJob.findFirst({
    where: { id: jobId, orgId: ctx.orgId },
    include: { conBudgets: { orderBy: { category: "asc" } }, clientContact: true },
  });
  if (!job) throw new Error("Job not found");

  const quoteId = await createQuote(ctx, userName, {
    jobId,
    title: `${job.name} — quotation`,
    clientName: job.clientContact?.name ?? "",
  });

  let sortOrder = 0;
  for (const line of job.conBudgets) {
    sortOrder += 1;
    const unitPrice = toNum(line.budgetAmount);
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

export async function addQuoteLine(
  ctx: OrgCtx,
  userName: string,
  quoteId: number,
  input: QuoteLineInput,
): Promise<void> {
  const quote = await prisma.platConQuote.findFirst({
    where: { id: quoteId, orgId: ctx.orgId },
    include: { lines: { orderBy: { sortOrder: "desc" }, take: 1 } },
  });
  if (!quote) throw new Error("Quote not found");
  const sortOrder = (quote.lines[0]?.sortOrder ?? 0) + 1;
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
  quoteId: number,
  lineId: number,
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
  quoteId: number,
  lineId: number,
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
  quoteId: number,
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
  quoteId: number,
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
