import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  let documents: Awaited<ReturnType<typeof fetchDocuments>> = [];

  async function fetchDocuments() {
    return prisma.uc2Document.findMany({
      orderBy: { uploadDate: "desc" },
      include: { zone: true },
    });
  }

  try {
    documents = await fetchDocuments();
  } catch {
    // empty state
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Dulong Downs — project document library"
      />
      <div className="px-8 pb-10">
        <p className="text-sm text-neutral-500 mb-4">
          Read-only view. Documents are managed externally and linked here for reference.
        </p>
        {documents.length === 0 ? (
          <div className="ae-card p-6 text-neutral-500 text-sm">
            No documents on record yet.
          </div>
        ) : (
          <div className="ae-card overflow-x-auto">
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Zone</th>
                  <th>Upload Date</th>
                  <th>Link</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="font-medium">{doc.name}</td>
                    <td>{doc.docType ?? <span className="text-neutral-400">—</span>}</td>
                    <td>{doc.version ?? <span className="text-neutral-400">—</span>}</td>
                    <td>
                      {doc.zone ? (
                        doc.zone.name
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {doc.uploadDate ? (
                        formatDate(doc.uploadDate)
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td>
                      {doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ae-primary underline text-sm"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="text-sm text-neutral-600 max-w-xs truncate">
                      {doc.notes ? (
                        <span title={doc.notes}>
                          {doc.notes.length > 60
                            ? doc.notes.slice(0, 60) + "…"
                            : doc.notes}
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
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
