import { loadTradeOptions } from "@/lib/platform/configSource";
import { emitCorrection } from "@/lib/platform/corrections";
import { type RecordId } from "@/lib/platform/recordWriter";
import type { OrgCtx } from "@/lib/platform/types";
import { generateManagedDocument } from "@/services/platform/documents";
import type { Module3RunResult } from "./engine";
import { loadCapabilityDocuments } from "./shared";

export interface BuilderTenderComparisonInput {
  jobId: RecordId;
  documentIds: RecordId[];
  title?: string;
}

interface TradeMatch {
  item: string;
  amount: number;
  provisional: boolean;
}

function moneyFrom(text: string): number {
  const m = text.match(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
  return m ? Number(m[1].replace(/,/g, "")) : 0;
}

function normaliseBuilderName(name: string): string {
  return name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLines(text: string, tradeNames: string[]): TradeMatch[] {
  const lines = text.split(/\r?\n/);
  const out: TradeMatch[] = [];
  for (const line of lines) {
    const amount = moneyFrom(line);
    if (amount <= 0) continue;
    const lower = line.toLowerCase();
    const trade = tradeNames.find((t) => lower.includes(t.toLowerCase()));
    out.push({
      item: trade ?? line.trim().slice(0, 80) || "unspecified",
      amount,
      provisional: /\b(pc|ps|provisional)\b/i.test(line),
    });
  }
  return out;
}

export async function runBuilderTenderComparison(
  ctx: OrgCtx,
  userName: string,
  input: BuilderTenderComparisonInput,
): Promise<Module3RunResult> {
  if (!input.jobId) throw new Error("Job is required.");
  const docs = await loadCapabilityDocuments(ctx, input.documentIds, input.jobId);
  if (docs.length === 0) throw new Error("No tender documents found.");

  const tradeOptions = await loadTradeOptions(ctx);
  const tradeNames = tradeOptions.map((t) => t.name).filter(Boolean);

  const perBuilder = docs.map((doc) => {
    const rows = parseLines(doc.text, tradeNames);
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    const provisionalTotal = rows.filter((r) => r.provisional).reduce((sum, r) => sum + r.amount, 0);
    return {
      builder: normaliseBuilderName(doc.title),
      sourceDocumentId: doc.id,
      rows,
      total,
      provisionalTotal,
      provisionalPct: total > 0 ? Math.round((provisionalTotal / total) * 1000) / 10 : 0,
    };
  });

  const canonicalItems = Array.from(
    new Set(perBuilder.flatMap((b) => b.rows.map((r) => r.item)).filter((x) => x && x !== "unspecified")),
  );

  const gaps = perBuilder.map((b) => {
    const have = new Set(b.rows.map((r) => r.item));
    return {
      builder: b.builder,
      missingItems: canonicalItems.filter((i) => !have.has(i)),
    };
  });

  const ranked = [...perBuilder].sort((a, b) => a.total - b.total);
  const preferred = ranked[0];
  const riskBuilders = perBuilder
    .filter((b) => b.provisionalPct >= 20)
    .map((b) => `${b.builder} (${b.provisionalPct}% provisional)`);

  const payload = {
    capability: "builder_tender_comparison",
    generatedAt: new Date().toISOString(),
    canonicalItems,
    builders: perBuilder,
    gaps,
    recommendation: preferred
      ? {
          builder: preferred.builder,
          reason: `Lowest parsed total at ${preferred.total.toFixed(2)} with ${preferred.provisionalPct}% provisional exposure.`,
        }
      : null,
    risks: riskBuilders,
  };

  const generated = await generateManagedDocument(ctx, userName, {
    jobId: input.jobId,
    title: input.title?.trim() || `Tender comparison (${new Date().toISOString().slice(0, 10)})`,
    docType: "tender_comparison",
    outputType: "tender_comparison_report",
    format: "pdf",
    body: JSON.stringify(payload, null, 2),
    traceability: {
      sourceModule: "module3.builder_tender_comparison",
      sourceRecordId: input.jobId,
    },
  });

  if (preferred && perBuilder.length > 1) {
    const median = ranked[Math.floor(ranked.length / 2)]?.total ?? preferred.total;
    if (median > 0 && Math.abs(preferred.total - median) / median > 0.2) {
      await emitCorrection(
        ctx,
        { type: "system", name: "Builder Tender Capability" },
        {
          entityType: "module3_capability",
          dimension: "tender.recommendation",
          aiValueText: `preferred=${preferred.builder};total=${preferred.total}`,
          humanValueText: `median=${median}`,
          rootCause: "tender spread exceeds 20%; comparison flagged for manual review",
          context: { capability: "builder_tender_comparison", jobId: String(input.jobId) },
        },
      );
    }
  }

  if (!generated.id) throw new Error("Failed to persist tender comparison output.");
  return {
    capability: "builder_tender_comparison",
    resultId: generated.id,
    overallConfidence: Math.max(30, Math.min(95, 45 + perBuilder.length * 10 - riskBuilders.length * 5)),
    outputVersion: "module3.builder-tender@1.0",
    notes: `Compared ${perBuilder.length} tender documents.`,
  };
}
