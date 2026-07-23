// Risk register with likelihood × impact scoring and batch escalation.

import { Fragment } from "react";
import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { GroupHeaderRow } from "@/components/GroupHeader";
import { EmptyState, PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";
import {
  applyListQuery,
  hasActiveFilters,
  parseListQuery,
  splitIntoGroups,
  toClientConfig,
} from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { priorityBandForRiskScore } from "@/lib/platform/projectIntelligence";
import { loadRisks } from "@/lib/platform/risksSource";
import { orgPath } from "@/lib/platform/paths";
import { setRiskStatus } from "./actions";
import { risksListConfig } from "./listConfig";

export const dynamic = "force-dynamic";

function scoreClass(score: number): string {
  if (score >= 15) return "bg-red-100 text-red-800";
  if (score >= 8) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

const RAG_CLASS: Record<string, string> = {
  Red: "bg-red-100 text-red-800",
  Amber: "bg-amber-100 text-amber-800",
  Green: "bg-emerald-100 text-emerald-800",
};

/** Cell fill for the L×I heat map — deeper as likelihood×impact rises. */
function heatCellClass(score: number): string {
  if (score >= 15) return "bg-red-200/80";
  if (score >= 8) return "bg-amber-200/80";
  return "bg-emerald-200/70";
}

interface HeatCell {
  score: number;
  count: number;
}

/** 5×5 probability × impact matrix (rows = impact 5→1, cols = likelihood 1→5). */
function buildHeatMatrix(risks: { likelihood: number; impact: number }[]): HeatCell[][] {
  const counts = new Map<string, number>();
  for (const r of risks) {
    const l = Math.min(5, Math.max(1, r.likelihood));
    const i = Math.min(5, Math.max(1, r.impact));
    const k = `${l}:${i}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const rows: HeatCell[][] = [];
  for (let impact = 5; impact >= 1; impact--) {
    const row: HeatCell[] = [];
    for (let likelihood = 1; likelihood <= 5; likelihood++) {
      row.push({ score: likelihood * impact, count: counts.get(`${likelihood}:${impact}`) ?? 0 });
    }
    rows.push(row);
  }
  return rows;
}

export default async function RisksPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const query = parseListQuery(await searchParams, risksListConfig);
  const filtered = hasActiveFilters(query);
  const { items: risks, total, matching, facets, page, pageCount } = applyListQuery(await loadRisks(ctx), query, risksListConfig);
  const heat = buildHeatMatrix(risks);

  return (
    <div className="p-6">
      <PageHeader
        title="Risk Register"
        subtitle="Likelihood × impact; high scores can be batch-escalated."
        actions={[
          { href: orgPath(ctx.orgSlug, "/risks/new"), label: "+ New risk" },
          { href: orgPath(ctx.orgSlug, "/risks/escalation"), label: "Escalation", variant: "outline" },
        ]}
      />
      <FilterBar
        basePath={orgPath(ctx.orgSlug, "/risks")}
        config={toClientConfig(risksListConfig)}
        query={query}
        shown={matching}
        total={total}
        counts={facets}
        page={page}
        pageCount={pageCount}
        searchPlaceholder="Search risks…"
      >
      {risks.length > 0 && (
        <div className="ae-card p-5 mb-4">
          <h2 className="text-sm font-semibold mb-1">Probability × Impact</h2>
          <p className="text-xs text-neutral-500 mb-3">
            Count of shown risks by likelihood (→) and impact (↑). Cell shade reflects the
            likelihood × impact score.
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs border-separate" style={{ borderSpacing: "3px" }}>
              <tbody>
                {heat.map((row, ri) => (
                  <tr key={ri}>
                    <td className="pr-1 text-right text-neutral-400 whitespace-nowrap">
                      {ri === 0 && <span className="mr-1 font-medium text-neutral-500">Impact</span>}I{5 - ri}
                    </td>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={`w-10 h-10 text-center align-middle rounded ${cell.count > 0 ? heatCellClass(cell.score) : "bg-neutral-50 text-neutral-300"}`}
                        title={`Likelihood ${ci + 1} × Impact ${5 - ri} = ${cell.score}${cell.count ? ` · ${cell.count} risk(s)` : ""}`}
                      >
                        {cell.count > 0 ? <span className="font-semibold tabular-nums">{cell.count}</span> : ""}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td></td>
                  {[1, 2, 3, 4, 5].map((l) => (
                    <td key={l} className="text-center text-neutral-400">
                      L{l}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td></td>
                  <td colSpan={5} className="text-center text-neutral-500 pt-1">
                    Likelihood →
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="ae-card p-5 overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="py-1 pr-2">Risk</th>
              <th scope="col" className="py-1 pr-2">Score</th>
              <th scope="col" className="py-1 pr-2">Owner</th>
              <th scope="col" className="py-1 pr-2">Escalated</th>
              <th scope="col" className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {splitIntoGroups(risks, query, risksListConfig).map((section) => (
              <Fragment key={section.key}>
                {query.group && (
                  <GroupHeaderRow colSpan={5} label={section.label} count={section.count} />
                )}
                {section.rows.map((r) => {
                  const score = r.likelihood * r.impact;
                  return (
                <tr key={r.id} className="relative border-t border-neutral-100 align-top hover:bg-neutral-50">
                  <td className="py-2 pr-2">
                    <Link
                      href={orgPath(ctx.orgSlug, `/risks/${r.id}`)}
                      className="font-medium hover:text-[var(--ae-space)] hover:underline before:absolute before:inset-0"
                    >
                      {r.description}
                    </Link>
                    {r.jobCode && <span className="ml-1 text-xs text-neutral-400">{r.jobCode}</span>}
                    {r.createdByAi && (
                      <span className="ml-1 text-[0.65rem] px-1 rounded bg-violet-100 text-violet-700">AI</span>
                    )}
                    {r.rag && (
                      <span className={`ml-1 text-[0.65rem] px-1 rounded font-semibold ${RAG_CLASS[r.rag] ?? ""}`}>
                        {r.rag}
                      </span>
                    )}
                    {r.category && (
                      <span className="ml-1 text-[0.65rem] px-1 rounded bg-neutral-100 text-neutral-600">
                        {r.category}
                      </span>
                    )}
                    {r.mitigation && (
                      <span className="block text-xs text-neutral-500">
                        Mitigation: {r.mitigation}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${scoreClass(score)}`}>
                      {score}
                    </span>
                    <span className="ml-1 text-xs text-neutral-400">
                      L{r.likelihood}×I{r.impact}
                    </span>
                    <span className="ml-1 text-xs text-neutral-500">{priorityBandForRiskScore(score)}</span>
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap text-xs">{r.owner || "—"}</td>
                  <td className="py-2 pr-2 text-xs">
                    {r.escalatedAt ? (
                      <span className="text-red-600" title={r.escalationNote}>
                        {formatDate(r.escalatedAt)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="relative z-10 py-2 whitespace-nowrap">
                    <form action={setRiskStatus} className="flex items-center gap-1">
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="recordId" value={r.id} />
                      <StatusBadge status={r.status} />
                      <select name="status" defaultValue={r.status} aria-label={`Status for ${r.description}`} className="text-xs border border-neutral-200 rounded px-1 py-0.5">
                        {["open", "accepted", "mitigated", "closed"].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="btn-ae-outline text-xs">
                        Set
                      </button>
                    </form>
                  </td>
                </tr>
                  );
                })}
              </Fragment>
            ))}
            {risks.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6">
                  <EmptyState
                    title={filtered ? "No risks match these filters" : "No risks recorded"}
                    hint={
                      filtered
                        ? "Try widening or clearing the filters above."
                        : "Log risks with likelihood × impact; the high scorers can be batch-escalated."
                    }
                    action={{ href: orgPath(ctx.orgSlug, "/risks/new"), label: "+ New risk" }}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </FilterBar>
    </div>
  );
}
