// Document Management (module 4) + Module 2 ingestion plumbing: canonical
// naming, storage taxonomy, version tracking, email intake, and routing into
// operational tables via approval-gated proposals.

import { airtableEnabled, core } from "@/lib/airtable";
import { callClaude } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { classifyDocument, parseDocumentText } from "@/lib/platform/docs";
import { getEmailReader } from "@/lib/platform/email";
import {
  buildCanonicalDocumentName,
  driveFolderSegments,
  firstSentence,
  inferRouteSuggestions,
  type Module2SourceChannel,
  type RouteSuggestion,
} from "@/lib/platform/ingestion";
import {
  renderManagedDocument,
  type ManagedDocFormat,
} from "@/lib/platform/documentRenderer";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { writeRecord, type RecordId } from "@/lib/platform/recordWriter";
import { getStorer, getStorerFor } from "@/lib/platform/storage";
import { type OrgCtx } from "@/lib/platform/types";
import { createHash } from "node:crypto";

/** SHA-256 hex digest — the immutable-snapshot fingerprint for generated docs. */
export function sha256Hex(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

interface Module2Metadata {
  canonicalName: string;
  lineageKey: string;
  version: number;
  sourceChannel: Module2SourceChannel;
  docDate: string;
  sourceRef?: string;
  routeSuggestions?: Array<{
    table: string;
    summary: string;
    proposalId?: RecordId;
    status?: string;
  }>;
}

interface Module4Traceability {
  sourceModule?: string;
  sourceRecordId?: RecordId;
  decisionId?: RecordId;
  contactId?: RecordId;
  workstreamId?: RecordId;
}

interface Module4Metadata {
  immutableSnapshot: boolean;
  generatedAt: string;
  outputType?: string;
  brandLabel?: string;
  traceability?: Module4Traceability;
  /** Fingerprint of the rendered file at registration (immutable snapshot). */
  contentHash?: string;
  hashAlgo?: string;
}

interface ExistingDocumentLite {
  id: RecordId;
  title: string;
  status: string;
  docType: string;
  version: number;
  aiAnalysis: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function module2MetaFrom(row: { title: string; aiAnalysis: string; version?: number }): Module2Metadata {
  const parsed = parseJson<Record<string, unknown>>(row.aiAnalysis, {});
  const meta = (parsed.module2 ?? {}) as Partial<Module2Metadata>;
  return {
    canonicalName: meta.canonicalName || row.title,
    lineageKey: meta.lineageKey || row.title.toLowerCase(),
    version: meta.version || row.version || 1,
    sourceChannel: (meta.sourceChannel as Module2SourceChannel) || "upload",
    docDate: meta.docDate || new Date().toISOString().slice(0, 10),
    sourceRef: meta.sourceRef,
    routeSuggestions: Array.isArray(meta.routeSuggestions) ? meta.routeSuggestions : [],
  };
}

function metadataAnalysis(meta: Module2Metadata, module4?: Module4Metadata): string {
  return JSON.stringify(module4 ? { module2: meta, module4 } : { module2: meta });
}

function parseModule4(raw: string): Module4Metadata | null {
  const parsed = parseJson<Record<string, unknown>>(raw, {});
  const m4 = parsed.module4 as Record<string, unknown> | undefined;
  if (!m4 || m4.immutableSnapshot !== true) return null;
  return {
    immutableSnapshot: true,
    generatedAt: String(m4.generatedAt ?? ""),
    outputType: typeof m4.outputType === "string" ? m4.outputType : undefined,
    brandLabel: typeof m4.brandLabel === "string" ? m4.brandLabel : undefined,
    traceability: typeof m4.traceability === "object" && m4.traceability
      ? (m4.traceability as Module4Traceability)
      : undefined,
    contentHash: typeof m4.contentHash === "string" ? m4.contentHash : undefined,
    hashAlgo: typeof m4.hashAlgo === "string" ? m4.hashAlgo : undefined,
  };
}

async function resolveJobContext(
  ctx: OrgCtx,
  jobId?: RecordId,
  fallbackTitle?: string,
): Promise<{ jobId?: RecordId; jobCode?: string }> {
  if (airtableEnabled()) {
    if (jobId != null) return { jobId, jobCode: undefined };
    const jobs = await core.list(ctx.orgSlug, "JOBS", { maxRecords: 2 });
    return jobs.length === 1 ? { jobId: jobs[0].id, jobCode: undefined } : {};
  }
  if (typeof jobId === "number") {
    const job = await prisma.platJob.findFirst({
      where: { id: jobId, orgId: ctx.orgId },
      select: { code: true },
    });
    return { jobId, jobCode: job?.code || fallbackTitle };
  }
  if (jobId == null) {
    const jobs = await prisma.platJob.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { id: "asc" },
      take: 2,
      select: { id: true, code: true },
    });
    if (jobs.length === 1) return { jobId: jobs[0].id, jobCode: jobs[0].code };
  }
  return {};
}

async function loadBrandLabel(ctx: OrgCtx): Promise<string> {
  return ctx.orgName;
}

function brandedSnapshotText(input: {
  brandLabel: string;
  title: string;
  outputType: string;
  body: string;
  traceability?: Module4Traceability;
}): string {
  const trace = input.traceability;
  const traceLines = [
    trace?.sourceModule ? `- Source module: ${trace.sourceModule}` : "",
    trace?.sourceRecordId != null ? `- Source record: ${String(trace.sourceRecordId)}` : "",
    trace?.decisionId != null ? `- Related decision: ${String(trace.decisionId)}` : "",
    trace?.contactId != null ? `- Related contact: ${String(trace.contactId)}` : "",
    trace?.workstreamId != null ? `- Related workstream: ${String(trace.workstreamId)}` : "",
  ].filter(Boolean);

  return [
    `# ${input.brandLabel}`,
    "",
    `## ${input.title}`,
    "",
    `Document type: ${input.outputType}`,
    `Generated at: ${new Date().toISOString()}`,
    "Snapshot policy: immutable",
    ...(traceLines.length ? ["", "Traceability", ...traceLines] : []),
    "",
    "---",
    "",
    input.body.trim(),
    "",
  ].join("\n");
}

async function existingDocuments(ctx: OrgCtx, jobId?: RecordId): Promise<ExistingDocumentLite[]> {
  if (airtableEnabled()) {
    const rows = await core.list(ctx.orgSlug, "DOCUMENTS", { maxRecords: 500 });
    return rows
      .filter((r) => {
        if (jobId == null) return true;
        const link = r["Job"];
        return Array.isArray(link) && link.map(String).includes(String(jobId));
      })
      .map((r) => ({
        id: r.id,
        title: str(r["Document_Name"]),
        status: str(r["Doc_Status"]) || "uploaded",
        docType: str(r["Document_Type"]),
        version: Number((parseJson<Record<string, unknown>>(str(r["AI_Analysis"]), {}).module2 as { version?: number })?.version ?? 1) || 1,
        aiAnalysis: str(r["AI_Analysis"]) || "{}",
      }));
  }
  const rows = await prisma.platDocument.findMany({
    where: { orgId: ctx.orgId, ...(typeof jobId === "number" ? { jobId } : {}) },
    select: { id: true, title: true, status: true, docType: true, version: true, aiAnalysis: true },
    take: 500,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    docType: r.docType,
    version: r.version,
    aiAnalysis: r.aiAnalysis,
  }));
}

async function findPriorVersion(
  ctx: OrgCtx,
  jobId: RecordId | undefined,
  lineageKey: string,
): Promise<ExistingDocumentLite | null> {
  const rows = await existingDocuments(ctx, jobId);
  const matched = rows
    .filter((r) => module2MetaFrom({ title: r.title, aiAnalysis: r.aiAnalysis, version: r.version }).lineageKey === lineageKey)
    .sort((a, b) => b.version - a.version);
  return matched[0] ?? null;
}

async function supersedePriorDocument(
  ctx: OrgCtx,
  prior: ExistingDocumentLite | null,
  actorName: string,
): Promise<void> {
  if (!prior) return;
  await writeRecord(ctx, {
    table: "document",
    op: "update",
    recordId: prior.id,
    data: { status: "superseded" },
    actor: { type: "system", name: actorName },
    requireApproval: false,
  });
}

async function routeOperationalWrites(
  ctx: OrgCtx,
  actorName: string,
  suggestions: RouteSuggestion[],
  sourceDocumentId?: RecordId,
): Promise<NonNullable<Module2Metadata["routeSuggestions"]>> {
  const out: NonNullable<Module2Metadata["routeSuggestions"]> = [];
  for (const suggestion of suggestions) {
    const payload =
      sourceDocumentId != null && (suggestion.table === "decision" || suggestion.table === "action")
        ? {
            sourceType: "document",
            sourceId: sourceDocumentId,
            ...suggestion.payload,
          }
        : suggestion.payload;
    const result = await writeRecord(ctx, {
      table: suggestion.table,
      op: "create",
      data: payload,
      actor: { type: "system", name: actorName },
      requireApproval: true,
    });
    out.push({
      table: suggestion.table,
      summary: suggestion.summary,
      proposalId: result.proposalId,
      status: result.status,
    });
  }
  return out;
}

async function createDocumentRecord(
  ctx: OrgCtx,
  actorName: string,
  input: {
    jobId?: RecordId;
    jobCode?: string;
    rawName: string;
    title?: string;
    textContent: string;
    docType: string;
    classification: string;
    mimeType?: string;
    sizeBytes?: number;
    channel: Module2SourceChannel;
    storageProvider: string;
    storageRef: string;
    sourceRef?: string;
    topicHint?: string;
    referenceHint?: string;
    dateHint?: string;
    sender?: string;
    kind: "file" | "link" | "generated";
    disableRouting?: boolean;
    module4?: Module4Metadata;
    actorType?: "human" | "system" | "ai";
  },
): Promise<{ id?: RecordId; classification: string; title: string; proposals: number }> {
  const prior = await findPriorVersion(
    ctx,
    input.jobId,
    buildCanonicalDocumentName({
      rawName: input.rawName,
      title: input.title,
      topicHint: input.topicHint,
      referenceHint: input.referenceHint,
      docType: input.docType,
      dateHint: input.dateHint,
    }).lineageKey,
  );
  const canonical = buildCanonicalDocumentName({
    rawName: input.rawName,
    title: input.title,
    topicHint: input.topicHint,
    referenceHint: input.referenceHint,
    docType: input.docType,
    dateHint: input.dateHint,
    version: prior ? prior.version + 1 : 1,
  });
  const routeSuggestions = input.disableRouting
    ? []
    : inferRouteSuggestions({
        classification: input.classification,
        text: input.textContent,
        title: canonical.title,
        sender: input.sender,
        docDate: canonical.docDate,
        jobId: input.jobId,
      });
  const routeResults: Module2Metadata["routeSuggestions"] = [];
  const meta: Module2Metadata = {
    canonicalName: canonical.storedName,
    lineageKey: canonical.lineageKey,
    version: canonical.version,
    sourceChannel: input.channel,
    docDate: canonical.docDate,
    sourceRef: input.sourceRef,
    routeSuggestions: routeResults,
  };
  const result = await writeRecord(ctx, {
    table: "document",
    op: "create",
    data: {
      jobId: input.jobId,
      title: canonical.title,
      kind: input.kind,
      docType: input.docType,
      classification: input.classification,
      storageProvider: input.storageProvider,
      storageRef: input.storageRef,
      mimeType: input.mimeType || "",
      sizeBytes: input.sizeBytes || 0,
      version: canonical.version,
      parentDocumentId: !airtableEnabled() && typeof prior?.id === "number" ? prior.id : undefined,
      textContent: input.textContent,
      aiSummary:
        routeSuggestions.length > 0
          ? `Module 2 captured ${routeResults.length} routing suggestion${routeResults.length === 1 ? "" : "s"}.`
          : input.textContent
              ? firstSentence(input.textContent, 180)
              : "",
      aiAnalysis: metadataAnalysis(meta, input.module4),
      confidence: undefined,
      status: routeSuggestions.length > 0 ? "pending_routing" : input.textContent ? "classified" : "uploaded",
      uploadedBy: actorName,
      analyzedAt: undefined,
    },
    actor: { type: input.actorType ?? (input.channel === "email" ? "system" : "human"), name: actorName },
    requireApproval: false,
  });
  if (routeSuggestions.length > 0 && result.recordId != null) {
    const resolved = await routeOperationalWrites(ctx, actorName, routeSuggestions, result.recordId);
    routeResults.push(...resolved);
    const mergedMeta: Module2Metadata = { ...meta, routeSuggestions: resolved };
    await writeRecord(ctx, {
      table: "document",
      op: "update",
      recordId: result.recordId,
      data: {
        aiAnalysis: metadataAnalysis(mergedMeta, input.module4),
        aiSummary: `Module 2 captured ${resolved.length} routing suggestion${resolved.length === 1 ? "" : "s"}.`,
        status: "pending_routing",
      },
      actor: { type: "system", name: actorName },
      requireApproval: false,
    });
  }
  await supersedePriorDocument(ctx, prior, actorName);
  return {
    id: result.recordId,
    classification: input.classification,
    title: canonical.title,
    proposals: routeResults.length,
  };
}

export async function ingestDocumentFile(
  ctx: OrgCtx,
  userName: string,
  input: {
    jobId?: RecordId;
    jobCode?: string;
    title: string;
    name: string;
    mimeType: string;
    buf: Buffer;
    channel?: Module2SourceChannel;
    topicHint?: string;
    referenceHint?: string;
    dateHint?: string;
    docTypeOverride?: string;
    sender?: string;
    sourceRef?: string;
  },
): Promise<{ id?: RecordId; classification: string; title: string; proposals: number }> {
  const job = await resolveJobContext(ctx, input.jobId, input.title || input.name);
  const text = parseDocumentText(input.name, input.mimeType, input.buf);
  const detected = await classifyDocument(input.name, text);
  const cls = input.docTypeOverride
    ? { ...detected, classification: input.docTypeOverride }
    : detected;
  const canonical = buildCanonicalDocumentName({
    rawName: input.name,
    title: input.title,
    topicHint: input.topicHint,
    referenceHint: input.referenceHint,
    docType: cls.classification,
    dateHint: input.dateHint,
  });
  const stored = await getStorer().put(
    {
      orgSlug: ctx.orgSlug,
      jobCode: input.jobCode || job.jobCode,
      docType: cls.classification,
      folderSegments: driveFolderSegments(cls.classification, input.channel ?? "upload"),
      name: canonical.storedName,
    },
    input.buf,
  );
  return createDocumentRecord(ctx, userName, {
    jobId: job.jobId,
    jobCode: input.jobCode || job.jobCode,
    rawName: input.name,
    title: input.title,
    textContent: text,
    docType: cls.classification,
    classification: cls.classification,
    mimeType: input.mimeType,
    sizeBytes: input.buf.length,
    channel: input.channel ?? "upload",
    storageProvider: stored.provider,
    storageRef: stored.ref,
    sourceRef: input.sourceRef,
    topicHint: input.topicHint,
    referenceHint: input.referenceHint,
    dateHint: input.dateHint,
    sender: input.sender,
    kind: "file",
  });
}

export async function ingestDocumentLink(
  ctx: OrgCtx,
  userName: string,
  input: {
    jobId?: RecordId;
    title: string;
    url: string;
    docType?: string;
    channel?: Module2SourceChannel;
    topicHint?: string;
    referenceHint?: string;
    dateHint?: string;
  },
): Promise<RecordId | undefined> {
  const job = await resolveJobContext(ctx, input.jobId, input.title || input.url);
  const result = await createDocumentRecord(ctx, userName, {
    jobId: job.jobId,
    rawName: input.title || input.url,
    title: input.title || input.url,
    textContent: "",
    docType: input.docType || "other",
    classification: input.docType || "other",
    channel: input.channel ?? "link",
    storageProvider: "external",
    storageRef: input.url,
    sourceRef: input.url,
    topicHint: input.topicHint,
    referenceHint: input.referenceHint,
    dateHint: input.dateHint,
    kind: "link",
  });
  return result.id;
}

export async function captureConversationNote(
  ctx: OrgCtx,
  actorName: string,
  input: { jobId?: RecordId; title?: string; note: string; sessionId?: RecordId },
): Promise<RecordId | undefined> {
  const job = await resolveJobContext(ctx, input.jobId, input.title);
  const result = await createDocumentRecord(ctx, actorName, {
    jobId: job.jobId,
    rawName: input.title || "conversation-note",
    title: input.title || firstSentence(input.note, 80) || "conversation-note",
    textContent: input.note,
    docType: "correspondence",
    classification: "correspondence",
    channel: "conversation",
    storageProvider: "conversation",
    storageRef: `chat:${input.sessionId ?? "session"}`,
    sourceRef: `chat:${input.sessionId ?? "session"}`,
    kind: "generated",
  });
  return result.id;
}

export async function generateManagedDocument(
  ctx: OrgCtx,
  actorName: string,
  input: {
    jobId?: RecordId;
    title: string;
    body: string;
    docType: string;
    outputType: string;
    format?: ManagedDocFormat;
    traceability?: Module4Traceability;
  },
): Promise<{ id?: RecordId; title: string; version: number }> {
  const job = await resolveJobContext(ctx, input.jobId, input.title);
  const brandLabel = await loadBrandLabel(ctx);
  const traceLines = [
    input.traceability?.sourceModule ? `- Source module: ${input.traceability.sourceModule}` : "",
    input.traceability?.sourceRecordId != null ? `- Source record: ${String(input.traceability.sourceRecordId)}` : "",
    input.traceability?.decisionId != null ? `- Related decision: ${String(input.traceability.decisionId)}` : "",
    input.traceability?.contactId != null ? `- Related contact: ${String(input.traceability.contactId)}` : "",
    input.traceability?.workstreamId != null ? `- Related workstream: ${String(input.traceability.workstreamId)}` : "",
  ].filter(Boolean);
  const generatedAt = new Date().toISOString();
  const rendered = renderManagedDocument({
    brandLabel,
    title: input.title,
    outputType: input.outputType,
    body: input.body,
    generatedAtIso: generatedAt,
    traceLines,
    format: input.format ?? "pdf",
  });
  const ext = rendered.extension;
  const rawName = `${input.title}.${ext}`;
  const canonical = buildCanonicalDocumentName({
    rawName,
    title: input.title,
    docType: input.docType || "report",
    dateHint: new Date().toISOString().slice(0, 10),
  });
  const stored = await getStorer().put(
    {
      orgSlug: ctx.orgSlug,
      jobCode: job.jobCode,
      docType: input.docType || "report",
      folderSegments: driveFolderSegments(input.docType || "report", "conversation"),
      name: canonical.storedName,
    },
    rendered.buf,
  );
  const module4: Module4Metadata = {
    immutableSnapshot: true,
    generatedAt,
    outputType: input.outputType,
    brandLabel,
    traceability: input.traceability,
    contentHash: sha256Hex(rendered.buf),
    hashAlgo: "sha256",
  };
  const created = await createDocumentRecord(ctx, actorName, {
    jobId: job.jobId,
    jobCode: job.jobCode,
    rawName,
    title: input.title,
    textContent: brandedSnapshotText({
      brandLabel,
      title: input.title,
      outputType: input.outputType,
      body: input.body,
      traceability: input.traceability,
    }),
    docType: input.docType || "report",
    classification: "report",
    mimeType: rendered.mimeType,
    sizeBytes: rendered.buf.length,
    channel: "conversation",
    storageProvider: stored.provider,
    storageRef: stored.ref,
    kind: "generated",
    disableRouting: true,
    module4,
    actorType: "system",
  });
  const v = created.title.match(/_v(\d+)$/i);
  return { id: created.id, title: created.title, version: v ? Number(v[1]) : 1 };
}

export interface IntegrityResult {
  verified: boolean;
  expectedHash: string;
  actualHash: string | null;
  error?: string;
}

/** Re-hash a generated document's stored file and compare to the fingerprint
 *  recorded at registration — proves an immutable snapshot has not silently
 *  changed since a decision was made on it (the Module 4 snapshot guarantee). */
export async function verifyStoredSnapshot(
  provider: string,
  ref: string,
  expectedHash: string,
): Promise<IntegrityResult> {
  if (!expectedHash) {
    return { verified: false, expectedHash, actualHash: null, error: "no fingerprint recorded" };
  }
  if (!ref) {
    return { verified: false, expectedHash, actualHash: null, error: "no stored file to verify" };
  }
  try {
    const buf = await getStorerFor(provider).get(ref);
    const actualHash = sha256Hex(buf);
    return { verified: actualHash === expectedHash, expectedHash, actualHash };
  } catch (err) {
    return {
      verified: false,
      expectedHash,
      actualHash: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function ingestUnreadEmails(
  ctx: OrgCtx,
  actorName: string,
  opts: { jobId?: RecordId } = {},
): Promise<{ processed: number; documents: number; proposals: number }> {
  const reader = getEmailReader();
  let processed = 0;
  let documents = 0;
  let proposals = 0;

  try {
    const emails = await reader.fetchUnread();
    const job = await resolveJobContext(ctx, opts.jobId);

    for (const email of emails) {
      const bodyId = await createDocumentRecord(ctx, actorName, {
        jobId: job.jobId,
        jobCode: job.jobCode,
        rawName: `${email.subject}.txt`,
        title: email.subject,
        textContent: [email.subject, email.body].filter(Boolean).join("\n\n"),
        docType: "correspondence",
        classification: "correspondence",
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength(email.body || "", "utf8"),
        channel: "email",
        storageProvider: "email",
        storageRef: `email:${email.id}`,
        sourceRef: email.id,
        topicHint: email.from.split("@")[0],
        dateHint: email.receivedAt,
        sender: email.from,
        kind: "generated",
      });
      documents += bodyId.id ? 1 : 0;
      proposals += bodyId.proposals;

      for (const attachment of email.attachments) {
        const created = await ingestDocumentFile(ctx, actorName, {
          jobId: job.jobId,
          jobCode: job.jobCode,
          title: attachment.name,
          name: attachment.name,
          mimeType: attachment.mimeType,
          buf: attachment.buf,
          channel: "email",
          topicHint: email.from.split("@")[0],
          dateHint: email.receivedAt,
          sender: email.from,
          sourceRef: email.id,
        });
        documents += created.id ? 1 : 0;
        proposals += created.proposals;
      }

      await reader.markProcessed(email.id);
      processed += 1;
    }

    return { processed, documents, proposals };
  } finally {
    await reader.close?.();
  }
}

/** AI document intelligence — read-only analysis, never mutates the source. */
export async function analyzeDocument(
  ctx: OrgCtx,
  userName: string,
  id: RecordId,
): Promise<{ ok: boolean; demoMode: boolean; error?: string }> {
  const doc = airtableEnabled()
    ? await core.get(ctx.orgSlug, "DOCUMENTS", String(id)).catch(() => null)
    : await prisma.platDocument.findFirst({ where: { id: Number(id), orgId: ctx.orgId } });
  if (!doc) return { ok: false, demoMode: false, error: "Document not found" };
  const row = doc as Record<string, unknown>;
  const textContent = String(row.textContent ?? row["Text_Content"] ?? "");
  if (!textContent.trim()) {
    return { ok: false, demoMode: false, error: "No extractable text to analyse" };
  }

  const { system, version } = getPrompt("documents.analyze");
  const res = await callClaude(system, textContent.slice(0, 30_000), {
    model: modelFor("extraction"),
    maxTokens: 1500,
  });

  let summary = "";
  let analysisPayload: Record<string, unknown> = {};
  if (res.demo_mode) {
    summary = "Demo mode — no API key; analysis simulated.";
    analysisPayload = { risks: [], obligations: [], demo: true };
  } else {
    try {
      const parsed = JSON.parse(res.content.replace(/^```(json)?|```$/g, "").trim());
      summary = String(parsed.summary ?? "").slice(0, 2000);
      analysisPayload = parsed as Record<string, unknown>;
    } catch {
      summary = res.content.slice(0, 2000);
      analysisPayload = { raw: res.content.slice(0, 4000) };
    }
  }

  const existingAnalysis = parseJson<Record<string, unknown>>(
    String(row.aiAnalysis ?? row["AI_Analysis"] ?? "{}"),
    {},
  );
  if (parseModule4(String(row.aiAnalysis ?? row["AI_Analysis"] ?? ""))?.immutableSnapshot) {
    return { ok: false, demoMode: false, error: "Snapshot documents are immutable" };
  }
  const mergedAnalysis = JSON.stringify({
    ...existingAnalysis,
    document_intelligence: analysisPayload,
  });

  await writeRecord(ctx, {
    table: "document",
    op: "update",
    recordId: typeof row.id === "number" ? row.id : String(row.id ?? id),
    data: {
      aiSummary: summary,
      aiAnalysis: mergedAnalysis,
      status: "analyzed",
      analyzedAt: new Date().toISOString(),
    },
    actor: { type: "ai", name: userName || "Document Intelligence" },
    requireApproval: false,
  });

  if (!airtableEnabled()) {
    await prisma.platExecutionLog.updateMany({
      where: { orgId: ctx.orgId, targetTable: "plat_core_document", targetId: Number(row.id), promptVersion: "" },
      data: { promptVersion: version },
    });
  }
  return { ok: true, demoMode: res.demo_mode };
}
