import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader, StatusBadge } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

type AiAuthority = "full_write" | "approval_required" | "blocked";

function AuthorityBadge({ authority }: { authority: string }) {
  const map: Record<AiAuthority, string> = {
    full_write: "bg-emerald-100 text-emerald-800",
    approval_required: "bg-amber-100 text-amber-800",
    blocked: "bg-red-100 text-red-800",
  };
  const cls = map[authority as AiAuthority] ?? "bg-neutral-100 text-neutral-700";
  const label =
    authority === "full_write"
      ? "Full Write"
      : authority === "approval_required"
      ? "Approval Required"
      : authority === "blocked"
      ? "Blocked"
      : authority || "—";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function JsonDetails({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700 select-none">
        {label}
      </summary>
      <pre className="mt-1 p-2 text-xs bg-neutral-50 rounded overflow-x-auto max-h-40 whitespace-pre-wrap break-all border border-neutral-200">
        {text || "—"}
      </pre>
    </details>
  );
}

export default async function Uc3ExecLogPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string; status?: string; authority?: string }>;
}) {
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get("uc3_tenant_id")?.value;
  const sp = await searchParams;
  const filterTool = sp.tool?.trim() ?? "";
  const filterStatus = sp.status?.trim() ?? "";
  const filterAuthority = sp.authority?.trim() ?? "";

  type LogRow = {
    id: number;
    toolName: string;
    status: string;
    aiAuthority: string;
    payload: string;
    result: string;
    createdAt: Date;
    project: { name: string } | null;
  };

  let rows: LogRow[] = [];
  try {
    let tenantId: number | null = cookieVal ? Number(cookieVal) : null;
    if (!tenantId) {
      const fallback = await prisma.uc3Tenant.findFirst({
        where: { isActive: true },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      tenantId = fallback?.id ?? null;
    }
    if (tenantId) {
      rows = (await prisma.uc3ExecutionLog.findMany({
        where: {
          tenantId,
          ...(filterTool ? { toolName: { contains: filterTool } } : {}),
          ...(filterStatus ? { status: filterStatus } : {}),
          ...(filterAuthority ? { aiAuthority: filterAuthority } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          toolName: true,
          status: true,
          aiAuthority: true,
          payload: true,
          result: true,
          createdAt: true,
          project: { select: { name: true } },
        },
      })) as LogRow[];
    }
  } catch {
    rows = [];
  }

  const authorityOptions: AiAuthority[] = ["full_write", "approval_required", "blocked"];
  const statusOptions = ["success", "error", "pending", "rejected"];
  const hasFilter = !!(filterTool || filterStatus || filterAuthority);

  return (
    <div className="pb-16">
      <PageHeader
        title="Execution Log"
        subtitle="Last 100 AI tool executions for this tenant"
      />

      <div className="px-8 space-y-4">
        {/* Filters */}
        <form method="GET" className="ae-card p-4 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500 font-medium">Tool name</label>
            <input
              name="tool"
              defaultValue={filterTool}
              placeholder="e.g. create_risk"
              className="border border-neutral-300 rounded px-3 py-1.5 text-sm bg-white w-44 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500 font-medium">Status</label>
            <select
              name="status"
              defaultValue={filterStatus}
              className="border border-neutral-300 rounded px-3 py-1.5 text-sm bg-white w-36 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">All</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500 font-medium">AI Authority</label>
            <select
              name="authority"
              defaultValue={filterAuthority}
              className="border border-neutral-300 rounded px-3 py-1.5 text-sm bg-white w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">All</option>
              {authorityOptions.map((a) => (
                <option key={a} value={a}>
                  {a === "full_write"
                    ? "Full Write"
                    : a === "approval_required"
                    ? "Approval Required"
                    : "Blocked"}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-ae self-end">
            Apply
          </button>
          {hasFilter && (
            <a href="/uc3/exec-log" className="btn-ae-outline self-end">
              Clear
            </a>
          )}
        </form>

        {/* Table */}
        <div className="ae-card overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-6 text-neutral-500 text-sm">
              {hasFilter
                ? "No log entries match the current filters."
                : "No execution log entries recorded yet."}
            </div>
          ) : (
            <table className="ae-table w-full">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Project</th>
                  <th>AI Authority</th>
                  <th>Status</th>
                  <th>When</th>
                  <th>Payload / Result</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                        {r.toolName}
                      </code>
                    </td>
                    <td className="text-sm text-neutral-600">
                      {r.project ? r.project.name : <span className="text-neutral-400">—</span>}
                    </td>
                    <td>
                      <AuthorityBadge authority={r.aiAuthority} />
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="text-xs text-neutral-500 whitespace-nowrap">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="max-w-xs">
                      <JsonDetails label="Payload" value={r.payload} />
                      <JsonDetails label="Result" value={r.result} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {rows.length > 0 && (
          <p className="text-xs text-neutral-400 pb-4">
            Showing up to 100 most recent entries. {rows.length} shown.
          </p>
        )}
      </div>
    </div>
  );
}
