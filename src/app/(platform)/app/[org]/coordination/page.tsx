import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentViewer, requireOrgCtx } from "@/lib/platform/org-context";
import { loadCoordinationQueue } from "@/lib/platform/coordinationSource";
import type { PriorityBand } from "@/lib/platform/projectIntelligence";
import { reportModeFor, reportingCapabilities } from "@/lib/platform/reportingPolicy";

export const dynamic = "force-dynamic";

function tone(priority: PriorityBand): string {
  if (priority === "CRITICAL") return "bg-red-100 text-red-800";
  if (priority === "URGENT") return "bg-orange-100 text-orange-800";
  if (priority === "HIGH") return "bg-amber-100 text-amber-800";
  if (priority === "MED") return "bg-blue-100 text-blue-800";
  return "bg-neutral-100 text-neutral-700";
}

export default async function CoordinationPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const ctx = await requireOrgCtx((await params).org);
  const viewer = await getCurrentViewer(ctx);
  const reportCaps = reportingCapabilities(viewer.role);
  const items = await loadCoordinationQueue(ctx);

  return (
    <div className="p-6">
      <PageHeader
        title="Coordination Queue"
        subtitle={`Cross-module items that need attention now. ${reportModeFor("coordination_dashboard")} report · ${reportCaps.audienceLabel}.`}
      />
      <div className="ae-card p-5">
        {items.length === 0 && <p className="text-sm text-neutral-500">No urgent coordination items.</p>}
        <div className="divide-y divide-neutral-100">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="group flex items-start justify-between gap-4 -mx-2 px-2 py-3 rounded-md hover:bg-[var(--ae-cream)] transition-colors"
            >
              <span className="min-w-0">
                <span className="font-medium group-hover:text-[var(--ae-space)]">{item.title}</span>
                <span className="block text-xs text-neutral-500">{item.detail}</span>
              </span>
              <span className={`px-1.5 py-0.5 rounded text-xs font-semibold shrink-0 ${tone(item.priority)}`}>
                {item.priority === "MED" ? "Medium" : item.priority}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
