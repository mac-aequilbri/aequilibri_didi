// Backend diagnostics — answers "is this org's data in Airtable or Postgres?"
// at a glance. Read-only, admin-gated. When AIRTABLE_MIGRATION is on, every
// mapped write and every *Source read uses the org's Airtable base; this page
// shows the live row counts on BOTH backends side by side so you can confirm
// where records actually land (a fresh Airtable org should fill the Airtable
// column and leave the Postgres column at its legacy/zero count).

import { PageHeader } from "@/components/PageHeader";
import { airtableEnabled, core, resolveBaseId, type CoreTableName } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import { requireAdmin, requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

// Each row: a label, the Airtable table, and how to count the Postgres side for
// this org. Covers the onboard→job→risk→decision→variation flow plus the P2
// learning tables.
const ROWS: { label: string; air: CoreTableName; pg: (orgId: number) => Promise<number> }[] = [
  { label: "Jobs", air: "JOBS", pg: (orgId) => prisma.platJob.count({ where: { orgId } }) },
  { label: "Risks", air: "RISKS", pg: (orgId) => prisma.platConRisk.count({ where: { orgId } }) },
  { label: "Decisions", air: "DECISIONS", pg: (orgId) => prisma.platDecision.count({ where: { orgId } }) },
  { label: "Variations", air: "VARIATIONS", pg: (orgId) => prisma.platConVariationOrder.count({ where: { orgId } }) },
  { label: "Quotes", air: "QUOTES", pg: (orgId) => prisma.platConQuote.count({ where: { orgId } }) },
  { label: "Budget lines", air: "BUDGET", pg: (orgId) => prisma.platConBudgetLine.count({ where: { orgId } }) },
  { label: "Meeting minutes", air: "MEETING_MINUTES", pg: (orgId) => prisma.platConMeetingMinutes.count({ where: { orgId } }) },
  { label: "Learning rules", air: "LEARNING_RULES", pg: (orgId) => prisma.platLearningRule.count({ where: { orgId } }) },
  { label: "Corrections", air: "CORRECTIONS", pg: (orgId) => prisma.platCorrection.count({ where: { orgId } }) },
  { label: "Hypotheses", air: "HYPOTHESES", pg: (orgId) => prisma.platHypothesis.count({ where: { orgId } }) },
  { label: "Config references", air: "PLAT_CFG_REFERENCE", pg: (orgId) => prisma.platCfgReference.count({ where: { orgId } }) },
];

const POSTGRES_BY_DESIGN = [
  "Organisation identity + team members (auth & tenancy)",
  "Execution-log audit trail + pending-write approval queue",
  "Assessment drafts (no ASSESSMENTS table yet — P3)",
  "Intelligence-snapshot history (local metric log)",
];

async function airtableCount(orgSlug: string, table: CoreTableName): Promise<number | string> {
  try {
    const rows = await core.list(orgSlug, table, { maxRecords: 1000 });
    return rows.length;
  } catch (err) {
    return `err: ${(err instanceof Error ? err.message : String(err)).slice(0, 40)}`;
  }
}

export default async function DiagnosticsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await requireOrgCtx(org);
  await requireAdmin(ctx);

  const on = airtableEnabled();
  let baseId = "—";
  if (on) {
    baseId = await resolveBaseId(ctx.orgSlug).catch((e) => `unresolved: ${e instanceof Error ? e.message : String(e)}`);
  }

  const counts = await Promise.all(
    ROWS.map(async (r) => ({
      label: r.label,
      air: on ? await airtableCount(ctx.orgSlug, r.air) : "—",
      pg: await r.pg(ctx.orgId).catch(() => "err"),
    })),
  );

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="Backend diagnostics"
        subtitle="Where this organisation's records actually live."
      />

      <section className="ae-card p-5 mb-6 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-600">AIRTABLE_MIGRATION</span>
          <span className={`font-mono font-semibold ${on ? "text-emerald-700" : "text-neutral-500"}`}>
            {on ? "true — reads & writes use Airtable" : "off — everything uses Postgres"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-600">Resolved base</span>
          <span className="font-mono text-xs">{baseId}</span>
        </div>
      </section>

      <section className="ae-card p-5 mb-6">
        <h2 className="font-semibold text-sm mb-3">Row counts by backend</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Entity</th>
              <th className="py-1 pr-2 text-right">Airtable (this base)</th>
              <th className="py-1 text-right">Postgres (this org)</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c) => (
              <tr key={c.label} className="border-t border-neutral-100">
                <td className="py-1.5 pr-2">{c.label}</td>
                <td className="py-1.5 pr-2 text-right font-mono">{String(c.air)}</td>
                <td className="py-1.5 text-right font-mono text-neutral-500">{String(c.pg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-neutral-400 mt-3">
          With the flag on, new records should land in the Airtable column. A non-zero Postgres
          count for a migrated org is legacy data (or writes made while the flag was off).
        </p>
      </section>

      <section className="ae-card p-5 text-sm">
        <h2 className="font-semibold text-sm mb-2">Postgres by design (not migrated)</h2>
        <ul className="list-disc pl-5 space-y-1 text-neutral-600">
          {POSTGRES_BY_DESIGN.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
