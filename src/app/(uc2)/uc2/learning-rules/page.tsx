import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader, MetricCard } from "@/components/PageHeader";
import { promoteHypothesis } from "./actions";

export const dynamic = "force-dynamic";

export default async function LearningRulesPage() {
  let rules: Awaited<ReturnType<typeof prisma.uc2LearningRule.findMany>> = [];
  let hypotheses: Awaited<ReturnType<typeof prisma.uc2Hypothesis.findMany>> = [];

  try {
    [rules, hypotheses] = await Promise.all([
      prisma.uc2LearningRule.findMany({
        orderBy: [{ cannotOverride: "desc" }, { isActive: "desc" }, { createdAt: "desc" }],
      }),
      prisma.uc2Hypothesis.findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
      }),
    ]);
  } catch { /* tables empty or not migrated */ }

  const activeCount = rules.filter((r) => r.isActive).length;
  const lockedCount = rules.filter((r) => r.cannotOverride).length;
  const pendingCount = hypotheses.length;

  return (
    <div>
      <PageHeader
        title="Learning Rules"
        subtitle="Active rules governing Didi's behaviour + pending hypotheses awaiting promotion"
      />
      <div className="px-8 space-y-6">

        {/* Metrics */}
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard value={activeCount} label="Active rules" />
          <MetricCard value={lockedCount} label="Cannot-override (locked)" />
          <MetricCard value={pendingCount} label="Pending hypotheses" />
        </div>

        {/* Learning Rules table */}
        <div className="ae-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--ae-earth)]">
            <h2 className="font-semibold">
              Rules{" "}
              <span className="text-neutral-400 text-sm">
                ({rules.length} total)
              </span>
            </h2>
          </div>
          {rules.length === 0 ? (
            <p className="px-5 py-8 text-center text-neutral-500">
              No learning rules yet — promote a hypothesis below to create the first rule.
            </p>
          ) : (
            <table className="ae-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Override</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className={r.isActive ? "" : "opacity-50"}>
                    <td>
                      <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded">
                        {r.ruleCode}
                      </code>
                    </td>
                    <td>
                      <span className="text-xs bg-[var(--ae-khaki)] px-1.5 py-0.5 rounded-full">
                        {r.category}
                      </span>
                    </td>
                    <td className="max-w-md">{r.description}</td>
                    <td>
                      <span
                        className={`status-badge ${
                          r.isActive ? "status-active" : "status-inactive"
                        }`}
                      >
                        {r.isActive ? "active" : "inactive"}
                      </span>
                    </td>
                    <td>
                      {r.cannotOverride ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          LOCKED
                        </span>
                      ) : (
                        <span className="text-neutral-400 text-xs">allowed</span>
                      )}
                    </td>
                    <td className="text-sm text-neutral-500">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pending Hypotheses table */}
        <div className="ae-card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--ae-earth)]">
            <h2 className="font-semibold">
              Pending Hypotheses{" "}
              <span className="text-neutral-400 text-sm">
                (human review — promote to create a rule)
              </span>
            </h2>
          </div>
          {hypotheses.length === 0 ? (
            <p className="px-5 py-8 text-center text-neutral-500">
              No pending hypotheses. Didi will surface new ones as patterns emerge in sessions.
            </p>
          ) : (
            <table className="ae-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Source session</th>
                  <th>Evidence</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {hypotheses.map((h) => (
                  <tr key={h.id}>
                    <td className="max-w-md">{h.description}</td>
                    <td className="text-xs text-neutral-500 font-mono">{h.sourceSession || "—"}</td>
                    <td className="max-w-xs truncate text-neutral-500 text-sm">
                      {h.evidence || "—"}
                    </td>
                    <td className="text-sm text-neutral-500">{formatDate(h.createdAt)}</td>
                    <td className="text-right">
                      <form action={promoteHypothesis} className="inline">
                        <input type="hidden" name="id" value={h.id} />
                        <button className="btn-ae text-xs">Promote to rule →</button>
                      </form>
                    </td>
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
