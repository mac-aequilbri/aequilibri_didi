import { formatDate } from "@/lib/format";
import { PageHeader, MetricCard } from "@/components/PageHeader";
import { loadUc1Intelligence, type Uc1IntelligenceData } from "@/lib/platform/uc1Source";
import { runEngine, approveHypothesis, rejectHypothesis, promoteRule, toggleRule, takeSnapshot, seedDemo, clearDemo } from "./actions";

export const dynamic = "force-dynamic";

function parseGaps(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export default async function Intelligence() {
  let data: Uc1IntelligenceData = { snapshot: null, corrections: [], hypotheses: [], rules: [] };
  try {
    data = await loadUc1Intelligence();
  } catch { /* tables empty */ }
  const { snapshot, corrections, hypotheses, rules } = data;

  const gaps: string[] = snapshot ? parseGaps(snapshot.gapsJson) : [];

  return (
    <div>
      <PageHeader
        title="Contextual Intelligence"
        subtitle="The correction → hypothesis → rule learning loop"
      />
      <div className="px-8 space-y-6">
        {/* Loop controls */}
        <div className="ae-card p-4 flex flex-wrap gap-2 items-center">
          <span className="text-sm text-neutral-500 mr-2">Learning loop:</span>
          <form action={runEngine}><button className="btn-ae-outline text-sm">⚙️ Run hypothesis engine</button></form>
          <form action={takeSnapshot}><button className="btn-ae-outline text-sm">📸 Take intelligence snapshot</button></form>
          <form action={seedDemo}><button className="btn-ae text-sm">🌱 Seed demo data</button></form>
          <form action={clearDemo} className="ml-auto"><button className="text-sm text-red-700">Clear all</button></form>
        </div>

        {/* Snapshot */}
        <div className="grid gap-4 sm:grid-cols-5">
          <MetricCard value={snapshot ? `${snapshot.accuracyRatePct}%` : "—"} label="Accuracy rate" />
          <MetricCard value={snapshot?.completedJobs ?? 0} label="Completed jobs" />
          <MetricCard value={rules.filter((r) => r.isActive).length} label="Active rules" />
          <MetricCard value={rules.filter((r) => r.autoApply).length} label="Auto-apply" />
          <MetricCard value={snapshot ? `${snapshot.avgConfidence} (${snapshot.confidenceTrajectory === "improving" ? "↑" : snapshot.confidenceTrajectory === "degrading" ? "↓" : "→"})` : "—"} label="Avg confidence" />
        </div>
        {gaps.length > 0 && (
          <div className="ae-card p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Known gaps</div>
            <ul className="text-sm list-disc pl-5 text-neutral-600">{gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
          </div>
        )}

        {/* Learning rules (Semantic / Contextual Intelligence) */}
        <div className="ae-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--ae-earth)]"><h2 className="font-semibold">Learning Rules <span className="text-neutral-400 text-sm">(applied automatically)</span></h2></div>
          {rules.length === 0 ? <p className="px-5 py-8 text-center text-neutral-500">No rules yet — promote a validated hypothesis below.</p> : (
            <table className="ae-table">
              <thead><tr><th>Code</th><th>Category</th><th>Rule</th><th>Trigger</th><th className="text-right">P</th><th className="text-right">Conf.</th><th className="text-right">Fired</th><th>Auto</th><th></th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className={r.isActive ? "" : "opacity-50"}>
                    <td className="font-mono text-xs">{r.ruleCode}</td>
                    <td><span className="text-xs bg-[var(--ae-khaki)] px-1.5 py-0.5 rounded-full">{r.category}</span></td>
                    <td className="max-w-md">{r.description}</td>
                    <td className="text-xs">{r.triggerCondition || "all"}</td>
                    <td className="text-right text-xs">{r.priority}</td>
                    <td className="text-right">{r.confidence}</td>
                    <td className="text-right">{r.timesTriggered}</td>
                    <td>{r.autoApply ? "✅" : "—"}</td>
                    <td className="text-right"><form action={toggleRule}><input type="hidden" name="id" value={r.id} /><button className="btn-ae-outline text-xs">{r.isActive ? "Disable" : "Enable"}</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Hypotheses (awaiting human gates) */}
        <div className="ae-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--ae-earth)]"><h2 className="font-semibold">Hypotheses <span className="text-neutral-400 text-sm">(human review gates)</span></h2></div>
          {hypotheses.length === 0 ? <p className="px-5 py-8 text-center text-neutral-500">No hypotheses — run the engine after corrections accumulate.</p> : (
            <table className="ae-table">
              <thead><tr><th>Pattern</th><th className="text-right">Samples</th><th className="text-right">Avg var.</th><th className="text-right">Conf.</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {hypotheses.map((h) => (
                  <tr key={h.id}>
                    <td className="max-w-md">{h.description}</td>
                    <td className="text-right">{h.sampleCount}</td>
                    <td className="text-right">{h.avgVariancePct}%</td>
                    <td className="text-right">{h.confidence}</td>
                    <td><span className="status-badge status-pending">{h.status}</span></td>
                    <td className="text-right whitespace-nowrap">
                      {h.status === "pending" && <>
                        <form action={approveHypothesis} className="inline"><input type="hidden" name="id" value={h.id} /><button className="btn-ae-outline text-xs mr-1">Approve</button></form>
                        <form action={rejectHypothesis} className="inline"><input type="hidden" name="id" value={h.id} /><button className="text-xs text-red-700">Reject</button></form>
                      </>}
                      {h.status === "active" && <form action={promoteRule} className="inline"><input type="hidden" name="id" value={h.id} /><button className="btn-ae text-xs">Promote to rule →</button></form>}
                      {h.status === "promoted" && <span className="text-xs text-[#1b5e20]">✓ promoted</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Corrections (Episodic raw material) */}
        <div className="ae-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--ae-earth)]"><h2 className="font-semibold">Recent Corrections <span className="text-neutral-400 text-sm">(episodic)</span></h2></div>
          {corrections.length === 0 ? <p className="px-5 py-8 text-center text-neutral-500">No corrections recorded.</p> : (
            <table className="ae-table">
              <thead><tr><th>Dimension</th><th>Suburb</th><th className="text-right">AI</th><th className="text-right">Human</th><th className="text-right">Var.</th><th>Root cause</th><th>When</th></tr></thead>
              <tbody>
                {corrections.map((c) => (
                  <tr key={c.id}>
                    <td>{c.dimension}</td><td>{c.suburb || "—"}</td>
                    <td className="text-right">{c.aiValue}</td><td className="text-right">{c.humanValue}</td>
                    <td className="text-right">{c.variancePct}%</td>
                    <td className="max-w-xs truncate text-neutral-500">{c.rootCause}</td>
                    <td>{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
