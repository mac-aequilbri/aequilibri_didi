// Delay cascade analysis — results are logged to the execution log; this
// page shows the latest analyses alongside the trigger form.

import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { requireOrgCtx } from "@/lib/platform/org-context";
import type { CascadeResult } from "@/services/platform/construction/delay";
import { runDelayCascade } from "./actions";

export const dynamic = "force-dynamic";

export default async function DelayCascadePage({ params }: { params: Promise<{ org: string }> }) {
  const ctx = await requireOrgCtx((await params).org);
  const [jobs, analyses] = await Promise.all([
    prisma.platJob.findMany({
      where: { orgId: ctx.orgId },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.platExecutionLog.findMany({
      where: { orgId: ctx.orgId, targetTable: "delay_cascade" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const parse = <T,>(raw: string): T | null => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <PageHeader
        title="Schedule impact"
        subtitle="Model how a delay event ripples through the remaining phases."
      />
      <form action={runDelayCascade} className="ae-card p-5 space-y-4 mb-8">
        <input type="hidden" name="org" value={ctx.orgSlug} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-neutral-600">Job *</span>
            <select name="jobId" required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2">
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.code} — {j.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-neutral-600">Initial delay (days) *</span>
            <input type="number" name="delayDays" min={1} defaultValue={5} required className="mt-1 w-full rounded border border-neutral-300 px-3 py-2" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Trigger event *</span>
          <input
            name="trigger"
            required
            placeholder="e.g. Precast panel delivery slips two weeks"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <button type="submit" className="btn-ae">
          Analyse cascade
        </button>
      </form>

      {analyses.map((log) => {
        const input = parse<{ trigger: string; delayDays: number }>(log.payload);
        const result = parse<CascadeResult>(log.result);
        if (!result) return null;
        return (
          <section key={log.id} className="ae-card p-5 mb-4">
            <h2 className="font-semibold text-sm mb-1">
              “{input?.trigger}” — {input?.delayDays}d initial
              <span className="ml-2 font-normal text-xs text-neutral-500">
                total impact {result.totalDelayDays}d
                {result.demoMode ? " · demo" : ""}
              </span>
            </h2>
            <table className="w-full text-sm mb-2">
              <tbody>
                {result.impacts.map((i, idx) => (
                  <tr key={idx} className="border-t border-neutral-100">
                    <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{i.phase}</td>
                    <td className="py-1.5 pr-2 text-xs whitespace-nowrap">+{i.delayDays}d</td>
                    <td className="py-1.5 text-xs text-neutral-500">{i.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.mitigations.length > 0 && (
              <p className="text-xs text-neutral-600">
                <span className="font-semibold">Mitigations:</span> {result.mitigations.join(" · ")}
              </p>
            )}
          </section>
        );
      })}
      {analyses.length === 0 && (
        <p className="text-sm text-neutral-500">No analyses yet — run one above.</p>
      )}
    </div>
  );
}
