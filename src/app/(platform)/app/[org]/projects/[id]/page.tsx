// Project detail — overview, phases, top risks/actions, links to models.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { MetricCard, PageHeader, StatusBadge } from "@/components/PageHeader";
import { currency, formatDate, toNum } from "@/lib/format";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const job = await prisma.platJob.findFirst({
    where: { id: Number(id), orgId: ctx.orgId },
    include: {
      conPhases: { where: { isAiDraft: false }, orderBy: { sortOrder: "asc" } },
      conRisks: { where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 5 },
      actions: { where: { status: { in: ["open", "in_progress"] } }, orderBy: { dueDate: "asc" }, take: 5 },
      conBudgets: true,
      _count: { select: { conBimModels: true, documents: true, conVariations: true } },
    },
  });
  if (!job) notFound();
  const p = (path: string) => orgPath(ctx.orgSlug, path);

  const budget = job.conBudgets.reduce((s, b) => s + toNum(b.budgetAmount), 0);
  const actual = job.conBudgets.reduce((s, b) => s + toNum(b.actualAmount), 0);

  return (
    <div className="p-6">
      <PageHeader
        title={job.name}
        subtitle={`${job.code} · ${job.engagementType.replace("_", " ")} · ${job.address || "no address"}${job.suburb ? `, ${job.suburb}` : ""}`}
        actions={[
          { href: p(`/projects/${job.id}/models`), label: `3D Model & Walkthrough${job._count.conBimModels ? ` (${job._count.conBimModels})` : ""}` },
          { href: p(`/projects/${job.id}/edit`), label: "Edit", variant: "outline" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard value={`${job.completionPct}%`} label="Complete" />
        <MetricCard value={`${job.healthScore}/100`} label="Health score" />
        <MetricCard value={currency(budget)} label="Budget (lines)" />
        <MetricCard value={currency(actual)} label="Actual to date" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="ae-card p-5">
          <h2 className="font-semibold mb-3">
            Phases{" "}
            <Link href={p("/phases")} className="text-xs font-normal text-neutral-500 hover:underline">
              manage →
            </Link>
          </h2>
          {job.conPhases.map((ph) => (
            <div key={ph.id} className="flex items-center gap-3 border-t border-neutral-100 py-2 text-sm">
              <span className="flex-1 font-medium">{ph.name}</span>
              <div className="w-32 h-2 rounded bg-neutral-100 overflow-hidden">
                <div className="h-full bg-[var(--ae-space,#1f2937)]" style={{ width: `${ph.completionPct}%` }} />
              </div>
              <StatusBadge status={ph.status} />
            </div>
          ))}
          {job.conPhases.length === 0 && <p className="text-sm text-neutral-500">No phases.</p>}
        </section>

        <section className="ae-card p-5">
          <h2 className="font-semibold mb-3">
            Open risks{" "}
            <Link href={p("/risks")} className="text-xs font-normal text-neutral-500 hover:underline">
              register →
            </Link>
          </h2>
          {job.conRisks.map((r) => (
            <div key={r.id} className="border-t border-neutral-100 py-2 text-sm">
              <span className="font-medium">{r.description}</span>
              <span className="ml-2 text-xs text-neutral-500">
                L{r.likelihood}×I{r.impact} = {r.likelihood * r.impact}
              </span>
            </div>
          ))}
          {job.conRisks.length === 0 && <p className="text-sm text-neutral-500">No open risks.</p>}

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
