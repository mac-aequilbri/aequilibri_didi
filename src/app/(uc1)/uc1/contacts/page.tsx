import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { loadUc1Contacts, type Uc1ContactView } from "@/lib/platform/uc1Source";

export const dynamic = "force-dynamic";

export default async function Contacts() {
  let rows: Uc1ContactView[] = [];
  try {
    rows = await loadUc1Contacts();
  } catch {
    rows = [];
  }

  return (
    <div>
      <PageHeader title="Contacts" subtitle={`${rows.length} contacts`} />
      <div className="px-8">
        <div className="ae-card overflow-hidden">
          <table className="ae-table">
            <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th className="text-right">Quotes</th><th>Added</th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No contacts.</td></tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td>{c.company || "—"}</td>
                    <td>{c.email || "—"}</td>
                    <td>{c.phone || "—"}</td>
                    <td className="text-right">{c.quotes}</td>
                    <td>{formatDate(c.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
