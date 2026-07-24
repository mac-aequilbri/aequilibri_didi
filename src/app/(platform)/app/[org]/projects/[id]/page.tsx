// Project detail — overview, phases, top risks/actions, links to models.

import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricCard, PageHeader, StatusBadge } from "@/components/PageHeader";
import { currency, formatDate } from "@/lib/format";
import { loadJobDetail } from "@/lib/platform/jobDetailSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { currentJobScope, inScope } from "@/lib/platform/rls";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  // Postgres (numeric id) or Airtable (rec… id) depending on the flag — the page
  // renders the same JobDetailView either way.
  const job = await loadJobDetail(ctx, id);
  if (!job) notFound();
  // RLS: a scoped user can't open a project they're not assigned to by URL.
  if (!inScope(await currentJobScope(ctx), job.id)) notFound();
  const p = (path: string) => orgPath(ctx.orgSlug, path);

  const subtitleParts = [
    job.code,
    job.engagementType ? job.engagementType.replace("_", " ") : "",
    `${job.address || "no address"}${job.suburb ? `, ${job.suburb}` : ""}`,
  ].filter(Boolean);

  return (
    <div className="p-6">
      <PageHeader
        title={job.name}
        subtitle={subtitleParts.join(" · ")}
        actions={[
          { href: p(`/projects/${job.id}/models`), label: `3D Model & Walkthrough${job.counts.bimModels ? ` (${job.counts.bimModels})` : ""}` },
          { href: p(`/projects/${job.id}/edit`), label: "Edit", variant: "outline" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard value={`${job.completionPct}%`} label="Complete" />
        <MetricCard value={`${job.healthScore}/100`} label="Health score" />
        <MetricCard value={currency(job.budget)} label="Budget (lines)" />
        <MetricCard value={currency(job.actual)} label="Actual to date" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="ae-card p-5">
          <h2 className="font-semibold mb-3">
            Phases{" "}
            <Link href={p("/phases")} className="text-xs font-normal text-neutral-500 hover:underline">
              manage →
            </Link>
          </h2>
          {job.phases.map((ph) => (
            <div key={ph.id} className="flex items-center gap-3 border-t border-neutral-100 py-2 text-sm">
              <span className="flex-1 font-medium">{ph.name}</span>
              <div className="w-32 h-2 rounded bg-neutral-100 overflow-hidden">
                <div className="h-full bg-[var(--ae-space,#1f2937)]" style={{ width: `${ph.completionPct}%` }} />
              </div>
              <StatusBadge status={ph.status} />
            </div>
          ))}
          {job.phases.length === 0 && <p className="text-sm text-neutral-500">No phases.</p>}
        </section>

        <section className="ae-card p-5">
          <h2 className="font-semibold mb-3">
            Open risks{" "}
            <Link href={p("/risks")} className="text-xs font-normal text-neutral-500 hover:underline">
              register →
            </Link>
          </h2>
          {job.risks.map((r) => (
            <div key={r.id} className="border-t border-neutral-100 py-2 text-sm">
              <span className="font-medium">{r.description}</span>
              <span className="ml-2 text-xs text-neutral-500">
                L{r.likelihood}×I{r.impact} = {r.likelihood * r.impact}
              </span>
            </div>
          ))}
          {job.risks.length === 0 && <p className="text-sm text-neutral-500">No open risks.</p>}

          <h2 className="font-semibold mb-3 mt-6">
            Next actions{" "}
            <Link href={p("/actions")} className="text-xs font-normal text-neutral-500 hover:underline">
              hub →
            </Link>
          </h2>
          {job.actions.map((a) => (
            <div key={a.id} className="border-t border-neutral-100 py-2 text-sm flex justify-between gap-2">
              <span className="font-medium">{a.title}</span>
              <span className="text-xs text-neutral-500 whitespace-nowrap">
                {a.owner}
                {a.dueDate ? ` · ${formatDate(a.dueDate)}` : ""}
              </span>
            </div>
          ))}
          {job.actions.length === 0 && <p className="text-sm text-neutral-500">No open actions.</p>}
        </section>
      </div>

      {job.summary && <p className="mt-6 text-sm text-neutral-600 max-w-3xl">{job.summary}</p>}
    </div>
  );
}
