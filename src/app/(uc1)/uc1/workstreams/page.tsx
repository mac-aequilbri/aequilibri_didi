import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { loadUc1Workstreams, type Uc1WorkstreamView } from "@/lib/platform/uc1Source";
import { createWorkstream, toggleSessionLoad, updateStatus, deleteWorkstream } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  complete: "bg-neutral-100 text-neutral-500",
};

export default async function WorkstreamsPage() {
  let rows: Uc1WorkstreamView[] = [];
  try {
    rows = await loadUc1Workstreams();
  } catch { rows = []; }

  const sessionLoaded = rows.filter((r) => r.loadAtSessionStart && r.status === "active");

  return (
    <div>
      <PageHeader
        title="Workstreams"
        subtitle="Procedural memory — active initiatives loaded at every session init"
      />
      <div className="px-8 space-y-4">
        {sessionLoaded.length > 0 && (
          <div className="ae-card p-4 bg-amber-50 border border-amber-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">Loaded at session init ({sessionLoaded.length})</div>
            <div className="text-sm text-amber-800">{sessionLoaded.map((w) => w.name).join(" · ")}</div>
          </div>
        )}

        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead>
              <tr>
                <th>Name</th><th>Milestone</th><th>Status</th><th>Session Init</th><th>Updated</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No workstreams. Add the first one below.</td></tr>
              ) : (
                rows.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <div className="font-medium">{w.name}</div>
                      {w.description && <div className="text-xs text-neutral-400">{w.description}</div>}
                    </td>
                    <td className="text-sm">{w.milestone || "—"}</td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[w.status] ?? "bg-neutral-100"}`}>
                        {w.status}
                      </span>
                    </td>
                    <td>
                      <form action={toggleSessionLoad}>
                        <input type="hidden" name="id" value={w.id} />
                        <button className={`text-xs px-2 py-0.5 rounded border ${w.loadAtSessionStart ? "bg-[var(--ae-khaki)] border-[var(--ae-earth)] text-[var(--ae-charcoal)]" : "border-neutral-200 text-neutral-400"}`}>
                          {w.loadAtSessionStart ? "✓ Load" : "Skip"}
                        </button>
                      </form>
                    </td>
                    <td className="text-xs text-neutral-400">{formatDate(w.lastUpdated)}</td>
                    <td className="text-right whitespace-nowrap">
                      <form action={updateStatus} className="inline mr-1">
                        <input type="hidden" name="id" value={w.id} />
                        <select name="status" defaultValue={w.status} className="text-xs border border-[var(--ae-earth)] rounded px-1 py-0.5 mr-1">
                          <option value="active">active</option>
                          <option value="paused">paused</option>
                          <option value="complete">complete</option>
                        </select>
                        <button className="btn-ae-outline text-xs">Save</button>
                      </form>
                      <form action={deleteWorkstream} className="inline">
                        <input type="hidden" name="id" value={w.id} />
                        <button className="text-xs text-red-700">Delete</button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <form action={createWorkstream} className="ae-card p-5 space-y-3">
          <h2 className="font-semibold">Add Workstream</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="name" placeholder="Name" required className="border border-[var(--ae-earth)] rounded px-3 py-2" />
            <input name="milestone" placeholder="Current milestone" className="border border-[var(--ae-earth)] rounded px-3 py-2" />
            <input name="description" placeholder="Description" className="border border-[var(--ae-earth)] rounded px-3 py-2 sm:col-span-2" />
            <textarea name="notes" placeholder="Notes" rows={2} className="border border-[var(--ae-earth)] rounded px-3 py-2 sm:col-span-2" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="load_at_session_start" />
            Load at session init
          </label>
          <button className="btn-ae">Add Workstream</button>
        </form>
      </div>
    </div>
  );
}
