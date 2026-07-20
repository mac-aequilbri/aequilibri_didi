// Schema-drift dashboard (Module 1 operations infrastructure). Customer bases
// are clones of the template and drift as the schema evolves; this surfaces, per
// org, which tables/fields each base is missing versus the template's
// provisionable schema. Read-only, admin-gated. Cross-org: it enumerates every
// org from the control registry (or Postgres), not just the current one.

import { PageHeader } from "@/components/PageHeader";
import { ConfirmSubmitButton } from "@/components/form/ConfirmSubmitButton";
import { requireAdmin, requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";
import { loadSchemaDrift, type OrgDrift } from "@/lib/platform/schemaDriftSource";
import { migrateBaseAction } from "./actions";

export const dynamic = "force-dynamic";

function MigrateResultBanner({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const status = typeof sp.status === "string" ? sp.status : undefined;
  if (!status) return null;
  const migrated = typeof sp.migrated === "string" ? sp.migrated : "";
  const applied = typeof sp.applied === "string" ? sp.applied : "0";
  const map: Record<string, { cls: string; text: string }> = {
    ok: { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", text: `Migrated ${migrated} — applied ${applied} schema change(s).` },
    partial: { cls: "bg-amber-50 text-amber-800 border-amber-200", text: `Migrated ${migrated} with errors — applied ${applied} change(s). See the row for remaining drift.` },
    noop: { cls: "bg-neutral-50 text-neutral-700 border-neutral-200", text: `${migrated} was already in sync — nothing to apply.` },
    unavailable: { cls: "bg-neutral-50 text-neutral-700 border-neutral-200", text: "Migration unavailable (Airtable mode off or no base id)." },
    unknown_base: { cls: "bg-rose-50 text-rose-800 border-rose-200", text: "Refused: that base id is not managed by this platform." },
  };
  const m = map[status];
  if (!m) return null;
  return <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${m.cls}`}>{m.text}</div>;
}

function StatusBadge({ org }: { org: OrgDrift }) {
  if (!org.reachable) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        unreachable
      </span>
    );
  }
  if (org.inSync) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        in sync
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
      drift
    </span>
  );
}

export default async function SchemaDriftPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { org } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgCtx(org);
  await requireAdmin(ctx);

  const report = await loadSchemaDrift();
  const driftCount = report.orgs.filter((o) => o.reachable && !o.inSync).length;
  const unreachable = report.orgs.filter((o) => !o.reachable).length;

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader
        title="Schema drift"
        subtitle="Which customer bases have fallen behind the template schema."
      />

      <MigrateResultBanner sp={sp} />

      <section className="ae-card p-5 mb-6 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-600">Airtable mode</span>
          <span className={`font-mono font-semibold ${report.enabled ? "text-emerald-700" : "text-neutral-500"}`}>
            {report.enabled ? "on" : "off — nothing to compare"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-600">Template base</span>
          <span className="font-mono text-xs">{report.templateBaseId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-600">Expected core version</span>
          <span className="font-mono text-xs">{report.expectedCoreVersion}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-600">Org source</span>
          <span className="font-mono text-xs">{report.source}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-600">Tables compared</span>
          <span className="font-mono text-xs">{report.comparedTables.length}</span>
        </div>
        {report.enabled && (
          <div className="flex justify-between">
            <span className="text-neutral-600">Summary</span>
            <span className="font-mono text-xs">
              {report.orgs.length} orgs · {driftCount} drifting · {unreachable} unreachable
            </span>
          </div>
        )}
      </section>

      {!report.enabled ? (
        <section className="ae-card p-5 text-sm text-neutral-600">
          Airtable mode is off, so there are no cloned bases to compare. Set
          <span className="font-mono"> AIRTABLE_MIGRATION=true</span> to enable.
        </section>
      ) : report.orgs.length === 0 ? (
        <section className="ae-card p-5 text-sm text-neutral-600">No organisations found.</section>
      ) : (
        <section className="ae-card p-5 mb-6">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 pr-2">Organisation</th>
                <th className="py-1 pr-2">Base</th>
                <th className="py-1 pr-2 text-center">Status</th>
                <th className="py-1 pr-2 text-right">Missing tables</th>
                <th className="py-1 pr-2 text-right">Missing fields</th>
                <th className="py-1 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {report.orgs.map((o) => (
                <tr key={o.slug} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-2">
                    <div className="font-medium">{o.name || o.slug}</div>
                    <div className="text-xs text-neutral-400">{o.slug}</div>
                    {o.missingTables.length > 0 && (
                      <div className="mt-1 text-xs text-rose-700">
                        {o.missingTables.join(", ")}
                      </div>
                    )}
                    {o.missingFieldsByTable.length > 0 && (
                      <ul className="mt-1 text-xs text-neutral-500 space-y-0.5">
                        {o.missingFieldsByTable.map((m) => (
                          <li key={m.table}>
                            <span className="font-mono">{m.table}</span>: {m.fields.join(", ")}
                          </li>
                        ))}
                      </ul>
                    )}
                    {o.error && <div className="mt-1 text-xs text-amber-700">{o.error}</div>}
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs">{o.baseId ?? "—"}</td>
                  <td className="py-2 pr-2 text-center">
                    <StatusBadge org={o} />
                  </td>
                  <td className="py-2 pr-2 text-right font-mono">
                    {o.reachable ? o.missingTables.length : "—"}
                  </td>
                  <td className="py-2 pr-2 text-right font-mono">
                    {o.reachable ? o.missingFieldCount : "—"}
                  </td>
                  <td className="py-2 text-right">
                    {o.reachable && !o.inSync && o.baseId ? (
                      <form action={migrateBaseAction}>
                        <input type="hidden" name="org" value={ctx.orgSlug} />
                        <input type="hidden" name="baseId" value={o.baseId} />
                        <ConfirmSubmitButton
                          label="Migrate ↑"
                          confirmLabel="Confirm migrate"
                          pendingLabel="Migrating…"
                          title="Additive-only: adds missing tables/fields, never removes data"
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                        />
                      </form>
                    ) : (
                      <span className="text-xs text-neutral-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-neutral-400 mt-3">
            Drift is measured against the template&apos;s <em>provisionable</em> schema — the tables and
            fields a fresh clone receives. Computed fields and TEAM/PRICING links (never cloned) are
            excluded, so a correctly-provisioned base reads as in sync. Extra customer-added fields are
            not flagged. To clear drift, re-run the relevant schema script against the drifting base.
          </p>
        </section>
      )}

      <p className="text-xs text-neutral-400">
        <a className="underline" href={orgPath(ctx.orgSlug, "/diagnostics")}>
          ← Backend diagnostics
        </a>
      </p>
    </div>
  );
}
