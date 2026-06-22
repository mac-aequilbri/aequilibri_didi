// Document Management (module 4): ingestion (classify → parse → store →
// record) and AI analysis. Storage refs only in the DB — file bytes live in
// the DriveStorer (local FS in dev, Drive adapter later).

import { callClaude } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { classifyDocument, parseDocumentText } from "@/lib/platform/docs";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { writeRecord, type RecordId } from "@/lib/platform/recordWriter";
import { getStorer } from "@/lib/platform/storage";
import { OrgCtx } from "@/lib/platform/types";

export async function ingestDocumentFile(
  ctx: OrgCtx,
  userName: string,
  input: { jobId?: number; jobCode?: string; title: string; name: string; mimeType: string; buf: Buffer },
): Promise<{ id?: RecordId; classification: string }> {
  const text = parseDocumentText(input.name, input.mimeType, input.buf);
  const cls = await classifyDocument(input.name, text);
  const stored = await getStorer().put(
    { orgSlug: ctx.orgSlug, jobCode: input.jobCode, docType: cls.classification, name: input.name },
    input.buf,
  );

  const result = await writeRecord(ctx, {
    table: "document",
    op: "create",
    data: {
      jobId: input.jobId,
      title: input.title || input.name,
      kind: "file",
      docType: cls.classification,
      classification: cls.classification,
      storageProvider: stored.provider,
      storageRef: stored.ref,
      mimeType: input.mimeType,
      sizeBytes: input.buf.length,
      textContent: text,
      aiSummary: cls.summary,
      confidence: cls.confidence,
      status: text ? "classified" : "uploaded",
      uploadedBy: userName,
    },
    actor: { type: "human", name: userName },
  });
  return { id: result.recordId, classification: cls.classification };
}

export async function ingestDocumentLink(
  ctx: OrgCtx,
  userName: string,
  input: { jobId?: number; title: string; url: string; docType?: string },
): Promise<RecordId | undefined> {
  const result = await writeRecord(ctx, {
    table: "document",
    op: "create",
    data: {
      jobId: input.jobId,
      title: input.title,
      kind: "link",
      docType: input.docType ?? "",
      storageProvider: "external",
      storageRef: input.url,
      status: "approved",
      uploadedBy: userName,
    },
    actor: { type: "human", name: userName },
  });
  return result.recordId;
}

/** AI document intelligence — read-only analysis, never mutates the source. */
export async function analyzeDocument(
  ctx: OrgCtx,
  userName: string,
  id: number,
): Promise<{ ok: boolean; demoMode: boolean; error?: string }> {
  const doc = await prisma.platDocument.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!doc) return { ok: false, demoMode: false, error: "Document not found" };
  if (!doc.textContent.trim()) {
    return { ok: false, demoMode: false, error: "No extractable text to analyse" };
  }

  const { system, version } = getPrompt("documents.analyze");
  const res = await callClaude(system, doc.textContent.slice(0, 30_000), {
    model: modelFor("extraction"),
    maxTokens: 1500,
  });

  let summary = "";
  let analysis = "{}";
  if (res.demo_mode) {
    summary = "Demo mode — no API key; analysis simulated.";
    analysis = JSON.stringify({ risks: [], obligations: [], demo: true });
  } else {
    try {
      const parsed = JSON.parse(res.content.replace(/^```(json)?|```$/g, "").trim());
      summary = String(parsed.summary ?? "").slice(0, 2000);
      analysis = JSON.stringify(parsed);
    } catch {
      summary = res.content.slice(0, 2000);
      analysis = JSON.stringify({ raw: res.content.slice(0, 4000) });
    }
  }

  await writeRecord(ctx, {
    table: "document",
    op: "update",
    recordId: doc.id,
    data: { aiSummary: summary, aiAnalysis: analysis, status: "analyzed", analyzedAt: new Date().toISOString() },
    actor: { type: "ai", name: "Document Intelligence" },
    requireApproval: false, // analysis annotates the doc; it never changes source content
  });

  await prisma.platExecutionLog.updateMany({
    where: { orgId: ctx.orgId, targetTable: "plat_core_document", targetId: doc.id, promptVersion: "" },
    data: { promptVersion: version },
  });
  return { ok: true, demoMode: res.demo_mode };
}
