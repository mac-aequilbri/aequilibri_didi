import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ChangeLogPage() {
  let entries: {
    id: number;
    timestamp: Date;
    tableName: string;
    recordId: string;
    field: string;
    oldValue: string;
    newValue: string;
    changedBy: string;
    confirmedBy: string;
  }[] = [];

  let dbError = false;

  try {
    entries = await prisma.uc2ChangeLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 100,
    });
  } catch {
    dbError = true;
  }

  const isEmpty = entries.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Change Log"
        subtitle="Last 100 field-level changes across all UC2 tables"
      />

      {isEmpty ? (
        <div className="ae-card text-center py-12">
          <p className="text-neutral-500 font-medium">
            {dbError ? "Could not load change log." : "No change log entries found."}
          </p>
          {dbError && (
            <p className="text-neutral-400 text-sm mt-1">
              Check the database connection and try again.
            </p>
          )}
        </div>
      ) : (
        <div className="ae-card overflow-x-auto">
          <table className="ae-table w-full">
            <thead>
              <tr>
                <th className="whitespace-nowrap">Timestamp</th>
                <th>Table</th>
                <th className="text-center">Record ID</th>
                <th>Field</th>
                <th>Change</th>
                <th className="whitespace-nowrap">Changed By</th>
                <th className="whitespace-nowrap">Confirmed By</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  {/* Timestamp — date stacked above time */}
                  <td className="whitespace-nowrap align-top">
                    <span className="block text-sm text-neutral-700">
                      {formatDate(entry.timestamp)}
                    </span>
                    <span className="block text-xs text-neutral-400">
                      {entry.timestamp.toLocaleTimeString("en-AU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </td>

                  {/* Table name — monospace chip */}
                  <td className="align-top">
                    <span className="font-mono text-xs bg-neutral-100 text-neutral-700 px-1.5 py-0.5 rounded border border-neutral-200">
                      {entry.tableName}
                    </span>
                  </td>

                  {/* Record ID */}
                  <td className="text-center text-sm align-top tabular-nums">
                    {entry.recordId || <span className="text-neutral-400">—</span>}
                  </td>

                  {/* Field */}
                  <td className="text-sm font-medium align-top">{entry.field}</td>

                  {/* Old → New value */}
                  <td className="max-w-xs align-top">
                    <div className="flex items-start gap-1 text-sm flex-wrap">
                      {entry.oldValue !== "" ? (
                        <span className="line-through text-red-500 break-all">
                          {entry.oldValue}
                        </span>
                      ) : (
                        <span className="text-neutral-400 italic text-xs">empty</span>
                      )}
                      <span className="text-neutral-400 shrink-0">→</span>
                      {entry.newValue !== "" ? (
                        <span className="text-green-700 break-all">
                          {entry.newValue}
                        </span>
                      ) : (
                        <span className="text-neutral-400 italic text-xs">empty</span>
                      )}
                    </div>
                  </td>

                  {/* Changed By */}
                  <td className="text-sm align-top">
                    {entry.changedBy !== "" ? (
                      entry.changedBy
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>

                  {/* Confirmed By */}
                  <td className="text-sm align-top">
                    {entry.confirmedBy !== "" ? (
                      entry.confirmedBy
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
  );
}
