// Spec 12 Module 7 context loading strategy (lock plan §7.1). Every session
// turn loads, beyond the learning rules: the current JOBS record with linked
// PHASES status+RAG, a BUDGET summary by category (finance-visible roles
// only), open ISSUES counts by Issue_Type, the 10 most recent DECISIONS, and
// the 3 most recent EXECUTION_LOG entries for session continuity.
//
// Cached per org+job+finance-visibility with a short TTL and invalidated by
// every write through recordWriter — the spec's "refreshed only when the data
// may have changed", implemented at the write choke point rather than by
// parsing the user's message. Airtable mode only (Postgres keeps the lean
// legacy snapshot from dataContext).

import { airtableEnabled, core } from "@/lib/airtable";
import { budgetActuals, loadProcurement } from "@/lib/platform/procurementSource";
import { normalizeRag } from "@/lib/platform/phasesSource";
import { currentJobScope, inScope } from "@/lib/platform/rls";
import { financeVisible } from "@/lib/platform/roles";
import type { OrgCtx } from "@/lib/platform/types";
import type { RecordId } from "@/lib/platform/recordWriter";

const S = (v: unknown): string => (typeof v === "string" ? v : "");
const N = (v: unknown): number => (typeof v === "number" ? v : 0);
const firstLink = (v: unknown): string | null =>
  Array.isArray(v) && v.length > 0 ? String(v[0]) : null;
const linkIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).filter((s) => s.startsWith("rec")) : [];

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; val: string }>();

/** Drop every cached context for the org — called from recordWriter's
 *  post-write hook, so the next turn reloads fresh state. */
export function invalidateAssistantContext(orgSlug: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${orgSlug}:`)) cache.delete(key);
  }
}

async function listByIds(
  ctx: OrgCtx,
  table: "PHASES" | "BUDGET",
  ids: string[],
): Promise<(Record<string, unknown> & { id: string })[]> {
  if (!ids.length) return [];
  const formula = `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
  return core.list(ctx.orgSlug, table, { filterByFormula: formula });
}

/** The session context block (Spec 12 Module 7) for the system prompt.
 *  "" outside Airtable mode or when nothing is loadable. */
export async function jobContextBlock(
  ctx: OrgCtx,
  opts: { jobId?: RecordId; role?: string },
): Promise<string> {
  if (!airtableEnabled()) return "";
  const fin = financeVisible(opts.role ?? "broker");
  const key = `${ctx.orgSlug}:${opts.jobId ?? "-"}:${fin ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.val;

  try {
    const scope = await currentJobScope(ctx);

    // The active engagement: the caller's job, else the viewer's first job.
    let jobId = typeof opts.jobId === "string" && opts.jobId.startsWith("rec") ? opts.jobId : null;
    if (jobId && !inScope(scope, jobId)) jobId = null;
    if (!jobId) {
      const jobs = await core.list(ctx.orgSlug, "JOBS", { maxRecords: 200 });
      jobId = jobs.find((j) => inScope(scope, j.id))?.id ?? null;
    }

    const parts: string[] = [];

    if (jobId) {
      const job = await core.get(ctx.orgSlug, "JOBS", jobId);
      if (job) {
        const [phaseRows, budgetRows, procRows] = await Promise.all([
          listByIds(ctx, "PHASES", linkIds(job["PHASES"])),
          fin ? listByIds(ctx, "BUDGET", linkIds(job["BUDGET"])) : Promise.resolve([]),
          fin ? loadProcurement(ctx) : Promise.resolve([]),
        ]);
        const phases = phaseRows
          .filter((p) => p["Is_AI_Draft"] !== true)
          .sort((a, b) => N(a["Sequence"]) - N(b["Sequence"]) || N(a["Sort_Order"]) - N(b["Sort_Order"]))
          .map((p) => {
            const rag = normalizeRag(p["RAG"]);
            return `${S(p["Phase_Name"]) || "(phase)"} [${S(p["Status"]) || "pending"}${rag ? `, RAG ${rag}` : ""}, ${N(p["Completion_Pct"])}%]`;
          });
        parts.push(
          `Active engagement: "${S(job["Job_Name"]) || jobId}" (status ${S(job["Status"]) || "open"}).` +
            (phases.length ? `\nPhases: ${phases.join(" · ")}` : ""),
        );
        if (fin && budgetRows.length) {
          const actuals = budgetActuals(procRows);
          const lines = budgetRows.slice(0, 8).map((b) => {
            const actual = Math.round(actuals.get(b.id) ?? 0);
            return `${S(b["Budget_Category"]) || "(line)"}: est ${N(b["Estimated"])}, forecast ${N(b["Forecast"])}, actual ${actual}`;
          });
          const est = budgetRows.reduce((s, b) => s + N(b["Estimated"]), 0);
          const act = budgetRows.reduce((s, b) => s + Math.round(actuals.get(b.id) ?? 0), 0);
          parts.push(`Budget summary (totals: estimated ${est}, actual ${act}):\n- ${lines.join("\n- ")}`);
        }
      }
    }

    // Open ISSUES by Issue_Type (RLS-scoped).
    const issues = (await core.list(ctx.orgSlug, "ISSUES", { maxRecords: 1000 })).filter(
      (i) => inScope(scope, firstLink(i["Job"])) && !["Closed", "Deferred"].includes(S(i["Status"])),
    );
    if (issues.length) {
      const byType = new Map<string, number>();
      for (const i of issues) {
        const t = S(i["Issue_Type"]) || "Open Action";
        byType.set(t, (byType.get(t) ?? 0) + 1);
      }
      parts.push(
        `Open issues by type: ${[...byType.entries()].map(([t, n]) => `${t} ${n}`).join(", ")}.`,
      );
    }

    // 10 most recent DECISIONS (RLS-scoped; org-global rows always in scope).
    const decisions = (await core.list(ctx.orgSlug, "DECISIONS", { maxRecords: 1000 }))
      .filter((d) => inScope(scope, firstLink(d["Job"])))
      .sort((a, b) => S(b["Decision_Date"]).localeCompare(S(a["Decision_Date"])))
      .slice(0, 10);
    if (decisions.length) {
      parts.push(
        `Recent decisions:\n- ${decisions
          .map((d) => `${S(d["Decision_Date"]) || "undated"}: ${S(d["Decision_Name"]) || "(decision)"} [${S(d["Status"]) || "Pending"}]`)
          .join("\n- ")}`,
      );
    }

    // 3 most recent EXECUTION_LOG entries — session continuity.
    const logs = (await core.list(ctx.orgSlug, "EXECUTION_LOG", { maxRecords: 100 }))
      .sort((a, b) => S(b["Date_Time"]).localeCompare(S(a["Date_Time"])))
      .slice(0, 3);
    if (logs.length) {
      parts.push(
        `Recent activity:\n- ${logs
          .map((l) => `${S(l["Date_Time"]).slice(0, 16)} ${S(l["Action_Type"])} ${S(l["Tables_Affected"])}: ${S(l["Log_Entry"])}`)
          .join("\n- ")}`,
      );
    }

    const val = parts.length ? `SESSION CONTEXT (Spec 12 Module 7):\n${parts.join("\n\n")}` : "";
    cache.set(key, { at: Date.now(), val });
    return val;
  } catch {
    return ""; // context is an enhancement — a failed load never blocks the turn
  }
}
