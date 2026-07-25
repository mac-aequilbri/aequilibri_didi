import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { loadCoordinationQueue } from "@/lib/platform/coordinationSource";
import type { PriorityBand } from "@/lib/platform/projectIntelligence";
import { reportModeFor, reportingCapabilities } from "@/lib/platform/reportingPolicy";
import type { CoordinationItemView } from "@/lib/platform/coordinationSource";
import { orgPath } from "@/lib/platform/paths";
import { dismissAdvisoryAction, quickResolveAction } from "./actions";

export const dynamic = "force-dynamic";

function tone(priority: PriorityBand): string {
  if (priority === "CRITICAL") return "bg-ae-danger-bg text-ae-danger";
  if (priority === "URGENT") return "bg-orange-100 text-orange-800";
  if (priority === "HIGH") return "bg-ae-warning-bg text-ae-warning";
  if (priority === "MED") return "bg-ae-info-bg text-ae-info";
  return "bg-neutral-100 text-neutral-700";
}

export default async function CoordinationPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ by?: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const viewer = await getCurrentViewer(ctx);
  const reportCaps = reportingCapabilities(viewer.role);
  const items = await loadCoordinationQueue(ctx);
  const byAssignee = (await searchParams).by === "assignee";

  // Spec 12 M8 Coordination Dashboard: items grouped by who they sit with.
  const sections: { label: string; rows: CoordinationItemView[] }[] = byAssignee
    ? [...items.reduce((m, it) => {
        const k = it.assignee || "Unassigned";
        (m.get(k) ?? m.set(k, []).get(k)!).push(it);
        return m;
      }, new Map<string, CoordinationItemView[]>())]
        .sort(([a], [b]) => (a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b)))
        .map(([label, rows]) => ({ label, rows }))
    : [{ label: "", rows: items }];

  return (
    <div className="p-6">
      <PageHeader
        title="Coordination Queue"
        subtitle={`Cross-module items that need attention now. ${reportModeFor("coordination_dashboard")} report · ${reportCaps.audienceLabel}.`}
      />
      <div className="mb-3 flex gap-2 text-xs">
        <Link
          href={orgPath(ctx.orgSlug, "/coordination")}
          className={`px-2 py-1 rounded border ${!byAssignee ? "border-neutral-400 font-semibold" : "border-neutral-200 text-neutral-500"}`}
        >
          By priority
        </Link>
        <Link
          href={orgPath(ctx.orgSlug, "/coordination?by=assignee")}
          className={`px-2 py-1 rounded border ${byAssignee ? "border-neutral-400 font-semibold" : "border-neutral-200 text-neutral-500"}`}
        >
          By assignee
        </Link>
      </div>
      <div className="ae-card p-5">
        {items.length === 0 && <p className="text-sm text-neutral-500">No urgent coordination items.</p>}
        {sections.map((section) => (
          <div key={section.label || "_all"}>
            {section.label && (
              <p className="mt-3 first:mt-0 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {section.label} <span className="font-normal">({section.rows.length})</span>
              </p>
            )}
        <div className="divide-y divide-neutral-100">
          {section.rows.map((item) =>
            item.cascadeId ? (
              // Cascade advisory (Spec 12 Module 5) — dismissible in place.
              // "Done" = reviewed; "Not relevant" counts as a rule override
              // (confidence decays, CORRECTIONS captured).
              <div key={item.id} className="flex items-start justify-between gap-4 -mx-2 px-2 py-3">
                <span className="min-w-0">
                  <span className="font-medium">{item.title}</span>
                  <span className="block text-xs text-neutral-500">{item.detail}</span>
                  <span className="mt-1.5 flex gap-2">
                    <form action={dismissAdvisoryAction}>
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="advisoryId" value={item.cascadeId} />
                      <input type="hidden" name="mode" value="done" />
                      <button type="submit" className="btn-ae-outline text-xs">
                        Reviewed — done
                      </button>
                    </form>
                    <form action={dismissAdvisoryAction}>
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="advisoryId" value={item.cascadeId} />
                      <input type="hidden" name="mode" value="override" />
                      <button
                        type="submit"
                        className="btn-ae-outline text-xs text-ae-danger border-ae-danger/30"
                        title="Dismiss as not relevant — the rule's confidence decays and a correction is captured"
                      >
                        Not relevant
                      </button>
                    </form>
                  </span>
                </span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold shrink-0 ${tone(item.priority)}`}>
                  Advisory
                </span>
              </div>
            ) : (
              <div
                key={item.id}
                className="group relative flex items-start justify-between gap-4 -mx-2 px-2 py-3 rounded-md hover:bg-[var(--ae-cream)] transition-colors"
              >
                <span className="min-w-0">
                  <Link
                    href={item.href}
                    className="font-medium group-hover:text-[var(--ae-space)] before:absolute before:inset-0"
                  >
                    {item.title}
                  </Link>
                  <span className="block text-xs text-neutral-500">
                    {item.detail}
                    {item.assignee ? ` · ${item.assignee}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {item.quick && (
                    // D-10 inline action: ISSUES → done, COMMS → sent. Plain
                    // role-gated server action (recordWriter enforces canWrite).
                    <form action={quickResolveAction} className="relative z-10">
                      <input type="hidden" name="org" value={ctx.orgSlug} />
                      <input type="hidden" name="kind" value={item.quick.kind} />
                      <input type="hidden" name="recordId" value={item.quick.recordId} />
                      <button type="submit" className="btn-ae-outline text-xs">
                        {item.quick.kind === "comms" ? "Mark sent" : "Mark done"}
                      </button>
                    </form>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${tone(item.priority)}`}>
                    {item.priority === "MED" ? "Medium" : item.priority}
                  </span>
                </span>
              </div>
            ),
          )}
        </div>
          </div>
        ))}
      </div>
    </div>
  );
}
