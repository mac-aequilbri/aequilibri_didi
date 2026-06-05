import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function Contacts() {
  let rows: { id: number; name: string; email: string; phone: string; company: string; createdAt: Date; quotes: number }[] = [];
  try {
    const contacts = await prisma.uc1Contact.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { quotes: true } } },
    });
    rows = contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, company: c.company, createdAt: c.createdAt, quotes: c._count.quotes }));
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
