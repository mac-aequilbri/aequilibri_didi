import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  let decisions: Awaited<ReturnType<typeof fetchDecisions>> = [];

  async function fetchDecisions() {
    return prisma.uc2Decision.findMany({
      orderBy: { createdAt: "desc" },
      include: { category: true },
    });
  }

  try {
    decisions = await fetchDecisions();
  } catch {
    // empty state
  }

  return (
    <div>
      <PageHeader
        title="Decisions"
        subtitle="Dulong Downs — key project decisions"
        actions={[{ href: "/uc2/decisions/new", label: "+ New Decision" }]}
      />
      <div className="px-8 pb-10">
        {decisions.length === 0 ? (
          <div className="ae-card p-6 text-neutral-500 text-sm">
            No decisions recorded yet.{" "}
            <a href="/uc2/decisions/new" className="underline text-ae-primary">
              Add the first one.
            </a>
          </div>
        ) : (
          <div className="ae-card overflow-x-auto">
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Made By</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Rationale</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium max-w-xs">{d.description}</td>
                    <td>{d.category?.name ?? <span className="text-neutral-400">—</span>}</td>
                    <td>{d.madeBy ?? <span className="text-neutral-400">—</span>}</td>
                    <td className="whitespace-nowrap">
                      {d.date ? formatDate(d.date) : <span className="text-neutral-400">—</span>}
                    </td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="text-sm text-neutral-600 max-w-xs">
                      {d.rationale ?? <span className="text-neutral-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
