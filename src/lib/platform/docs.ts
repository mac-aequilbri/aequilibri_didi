// Document classifier + parser (Platform Architecture doc utility layer).
// Classification: Claude Haiku tier with an extension-based fallback so demo
// mode (no API key) still produces sensible results. Parsing: text formats
// natively; binary formats store unparsed (vision/pdf parsing can slot in).

import { callClaude } from "@/lib/claude";
import { modelFor } from "./modelRouter";
import { getPrompt } from "./prompts";

export const DOC_CLASSES = [
  "quote",
  "invoice",
  "specification",
  "drawing",
  "contract",
  "correspondence",
  "report",
  "other",
] as const;
export type DocClass = (typeof DOC_CLASSES)[number];

export interface Classification {
  classification: DocClass;
  confidence: number;
  summary: string;
}

const EXT_HINTS: Record<string, DocClass> = {
  dwg: "drawing",
  dxf: "drawing",
  png: "drawing",
  jpg: "drawing",
  jpeg: "drawing",
  eml: "correspondence",
  msg: "correspondence",
};

const NAME_HINTS: [RegExp, DocClass][] = [
  [/quote|estimate|proposal/i, "quote"],
  [/invoice|bill\b/i, "invoice"],
  [/spec/i, "specification"],
  [/contract|agreement|as\s?\d{4}/i, "contract"],
  [/report/i, "report"],
  [/drawing|plan|elevation/i, "drawing"],
];

function fallbackClassify(name: string): Classification {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  for (const [re, cls] of NAME_HINTS) {
    if (re.test(name)) return { classification: cls, confidence: 40, summary: `Classified by filename pattern (“${name}”).` };
  }
  if (EXT_HINTS[ext]) {
    return { classification: EXT_HINTS[ext], confidence: 30, summary: `Classified by file extension .${ext}.` };
  }
  return { classification: "other", confidence: 10, summary: "No classifier signal — defaulted to other." };
}

export async function classifyDocument(name: string, textSample: string): Promise<Classification> {
  if (!textSample.trim()) return fallbackClassify(name);
  const { system } = getPrompt("documents.classify");
  const res = await callClaude(system, `Filename: ${name}\n\nContent sample:\n${textSample.slice(0, 4000)}`, {
    model: modelFor("classification"),
    maxTokens: 300,
  });
  if (res.demo_mode) return fallbackClassify(name);
  try {
    const parsed = JSON.parse(res.content.replace(/^```(json)?|```$/g, "").trim());
    const cls = DOC_CLASSES.includes(parsed.classification) ? parsed.classification : "other";
    return {
      classification: cls,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      summary: String(parsed.summary ?? "").slice(0, 500),
    };
  } catch {
    return fallbackClassify(name);
  }
}

const TEXT_MIME = /^(text\/|application\/(json|xml|csv))/;
const TEXT_EXT = /\.(txt|md|csv|json|xml|html?)$/i;

/** Extract text where we can do it natively; binary formats return "". */
export function parseDocumentText(name: string, mimeType: string, buf: Buffer): string {
  if (TEXT_MIME.test(mimeType) || TEXT_EXT.test(name)) {
    return buf.toString("utf8").slice(0, 200_000);
  }
  return "";
}
