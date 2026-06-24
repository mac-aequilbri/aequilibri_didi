export type Module2SourceChannel = "upload" | "link" | "email" | "conversation";

export interface CanonicalNameInput {
  rawName: string;
  title?: string;
  topicHint?: string;
  referenceHint?: string;
  docType?: string;
  dateHint?: string;
  version?: number;
}

export interface CanonicalNameResult {
  title: string;
  storedName: string;
  lineageKey: string;
  version: number;
  docDate: string;
}

export interface RouteSuggestion {
  table: "cashflow" | "procurement" | "decision" | "action";
  summary: string;
  payload: Record<string, unknown>;
}

const NOISE_WORDS = new Set([
  "the",
  "and",
  "for",
  "from",
  "with",
  "this",
  "that",
  "rev",
  "revised",
  "final",
  "copy",
  "attachment",
  "document",
]);

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function base(name: string): string {
  const e = ext(name);
  return e ? name.slice(0, -e.length) : name;
}

function token(v: string, fallback = "document"): string {
  const out = v
    .trim()
    .replace(/['"`]+/g, "")
    .replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return out || fallback;
}

function words(v: string): string[] {
  return v
    .split(/[^A-Za-z0-9]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function inferTopic(raw: string, hint?: string): string {
  if (hint?.trim()) return token(hint, "document");
  const kept = words(raw).filter((w) => !NOISE_WORDS.has(w.toLowerCase()));
  return token(kept.slice(0, 2).join("-") || raw, "document");
}

function extractRef(raw: string, docType?: string, hint?: string): string {
  if (hint?.trim()) return token(hint, "item");
  const patterns: RegExp[] = [
    /\b(quote)[-_ ]?([A-Za-z0-9-]{2,})\b/i,
    /\b(invoice)[-_ ]?([A-Za-z0-9-]{2,})\b/i,
    /\b(contract)[-_ ]?([A-Za-z0-9-]{2,})\b/i,
    /\b(spec(?:ification)?)[-_ ]?([A-Za-z0-9-]{2,})\b/i,
    /\b(report)[-_ ]?([A-Za-z0-9-]{2,})\b/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) return token(`${m[1]}-${m[2]}`, `${docType || "item"}-ref`);
  }
  const kept = words(raw).filter((w) => !NOISE_WORDS.has(w.toLowerCase()));
  return token(kept.slice(2, 7).join("-") || docType || "item", "item");
}

function parseDate(raw?: string): string {
  const s = (raw || "").trim();
  const m = s.match(/\b(20\d{2})[-_/](\d{2})[-_/](\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return new Date().toISOString().slice(0, 10);
}

function parseVersion(raw: string): number {
  const m = raw.match(/(?:^|[_-])v(\d{1,3})$/i);
  return m ? Math.max(1, Number(m[1]) || 1) : 1;
}

export function lineageKeyForTitle(title: string): string {
  const stem = base(title)
    .replace(/_20\d{2}-\d{2}-\d{2}_/g, "_")
    .replace(/[_-]v\d{1,3}$/i, "");
  return token(stem, "document").toLowerCase();
}

export function buildCanonicalDocumentName(input: CanonicalNameInput): CanonicalNameResult {
  const raw = base(input.title?.trim() || input.rawName.trim());
  const topic = inferTopic(raw, input.topicHint);
  const ref = extractRef(raw, input.docType, input.referenceHint);
  const version = Math.max(1, input.version || parseVersion(raw));
  const docDate = parseDate(input.dateHint || raw);
  const stem = `${topic}_${docDate}_${ref}${version > 1 ? `_v${version}` : ""}`;
  const extension = ext(input.rawName);
  return {
    title: stem,
    storedName: `${stem}${extension}`,
    lineageKey: lineageKeyForTitle(stem),
    version,
    docDate,
  };
}

export function driveFolderSegments(docType: string, channel: Module2SourceChannel): string[] {
  const t = docType.trim().toLowerCase();
  if (channel === "conversation") return ["10_Claude_CoWork", "Conversation_Notes"];
  if (channel === "email") return ["10_Claude_CoWork", "Email_Inbox"];
  if (t === "invoice") return ["02_Budgets_and_Costs", "Invoices"];
  if (t === "quote") return ["03_Vendors_and_Quotes", "Quotes"];
  if (t === "drawing") return ["04_Drawings_and_Designs", "Drawings"];
  if (t === "specification") return ["04_Drawings_and_Designs", "Specifications"];
  if (t === "report") return ["06_Project_Management", "Reports"];
  if (t === "contract" || t === "correspondence") return ["01_Contracts_and_Documents", "Correspondence"];
  return ["01_Contracts_and_Documents", "General"];
}

export function moneyCandidates(text: string): number[] {
  return [...text.matchAll(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/g)]
    .map((m) => Number(String(m[1]).replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function bestMoneyCandidate(text: string): number | null {
  const nums = moneyCandidates(text);
  return nums.length ? Math.max(...nums) : null;
}

export function firstSentence(text: string, max = 220): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  return sentence.slice(0, max);
}

export function inferRouteSuggestions(args: {
  classification: string;
  text: string;
  title: string;
  sender?: string;
  docDate: string;
  jobId?: number | string;
  sourceDocumentId?: number | string;
}): RouteSuggestion[] {
  const classification = args.classification.toLowerCase();
  const text = args.text.trim();
  const amount = bestMoneyCandidate(text);
  const summary = firstSentence(text) || args.title;
  const sender = (args.sender || "").trim();
  const out: RouteSuggestion[] = [];
  const period = args.docDate.slice(0, 7);

  if (args.jobId != null && classification === "invoice" && amount != null) {
    out.push({
      table: "cashflow",
      summary: `Route invoice amount ${amount.toFixed(2)} into cashflow actuals for ${period}.`,
      payload: {
        jobId: args.jobId,
        period,
        actual: amount,
        projected: 0,
        notes: `Suggested from document "${args.title}". ${summary}`.slice(0, 800),
      },
    });
  }

  if (args.jobId != null && classification === "quote") {
    out.push({
      table: "procurement",
      summary: `Route quote into procurement for follow-up${amount != null ? ` (${amount.toFixed(2)})` : ""}.`,
      payload: {
        jobId: args.jobId,
        item: summary || args.title,
        category: "quoted_scope",
        vendorName: sender,
        qty: 1,
        unitPrice: amount ?? 0,
        total: amount ?? 0,
        status: "pending",
      },
    });
  }

  if (
    /(approved|approve|confirmed|selected|decision|proceed|variation|delay)/i.test(text || args.title) &&
    args.jobId != null
  ) {
    out.push({
      table: "decision",
      summary: "Capture the implied operational decision for approval.",
      payload: {
        jobId: args.jobId,
        description: summary || `Decision implied by document "${args.title}"`,
        rationale: `Suggested from ingestion of "${args.title}".`,
        category: "ingested_document",
        status: "proposed",
        madeBy: sender,
        sourceType: "document",
        sourceId: args.sourceDocumentId,
      },
    });
  }

  if (/(due|lead time|urgent|follow up|follow-up|send|issue)/i.test(text) && args.jobId != null) {
    out.push({
      table: "action",
      summary: "Capture a follow-up action implied by the ingested source.",
      payload: {
        jobId: args.jobId,
        title: summary || `Follow up on "${args.title}"`,
        detail: `Suggested from document ingestion: "${args.title}".`,
        priority: "P2",
        owner: "",
        status: "open",
        sourceType: "document",
        sourceId: args.sourceDocumentId,
      },
    });
  }

  return out;
}
