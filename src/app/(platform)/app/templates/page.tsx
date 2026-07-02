// Template registry admin (platform-admin only) — manage the industry →
// sub-industry → template-base mappings that drive the /app/new dropdown and
// onboarding. Adding a row here makes a new industry onboardable with no deploy.

import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { listTemplateRegistry } from "@/lib/airtable/control";
import { isPlatformAdmin } from "@/lib/platform/org-context";
import { deleteTemplateMapping, toggleTemplateMapping } from "./actions";

export const dynamic = "force-dynamic";

export default async function TemplateRegistryPage() {
  if (!(await isPlatformAdmin())) redirect("/app?denied=admin");
  const rows = await listTemplateRegistry({ includeInactive: true });

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <PageHeader
        title="Industry templates"
        subtitle="Industry → sub-industry → Airtable template base. Add a mapping (after building its template base) to make a new industry onboardable — no deploy."
        actions={[
          { href: "/app/templates/new", label: "+ New mapping" },
          { href: "/app", label: "Back to organisations", variant: "outline" },
        ]}
      />

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-600">
          No mappings yet. Add one, or run <code>scripts/airtable-add-template-registry.mjs</code> to seed the defaults.
        </p>
      ) : (
        <table className="w-full text-sm ae-card">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="p-3">Industry</th>
              <th className="p-3">Sub-industry</th>
              <th className="p-3">Vertical key</th>
              <th className="p-3">Template base</th>
              <th className="p-3">Active</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.recordId} className="border-t border-neutral-100">
                <td className="p-3 font-medium">{r.industry}</td>
                <td className="p-3">{r.subIndustry || "—"}</td>
                <td className="p-3 font-mono text-xs">{r.verticalKey}</td>
                <td className="p-3 font-mono text-xs">{r.templateBaseId}</td>
                <td className="p-3">
                  <form action={toggleTemplateMapping} className="inline">
                    <input type="hidden" name="recordId" value={r.recordId} />
                    <input type="hidden" name="isActive" value={String(r.isActive)} />
                    <button type="submit" className={`text-xs font-semibold ${r.isActive ? "text-emerald-700" : "text-neutral-400"}`}>
                      {r.isActive ? "Active" : "Inactive"}
                    </button>
                  </form>
                </td>
                <td className="p-3 text-right">
                  <form action={deleteTemplateMapping} className="inline">
                    <input type="hidden" name="recordId" value={r.recordId} />
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-6 text-xs text-neutral-500">
        Note: adding a mapping only wires up routing. A new industry still needs its template base built
        (Core clone + Domain Extension), plus DOMAIN_LABELS records and an assessment module for full support.
      </p>
    </main>
  );
}
