// Plan register export (Spec 12 Module 8, lock plan §8.5) — the current
// filtered task schedule as an Excel-compatible CSV, RLS-scoped.

import { csvResponse, toCsv } from "@/lib/platform/csv";
import { applyListQuery, parseListQuery } from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { loadPlanTasks } from "@/lib/platform/planSource";
import { planListConfig } from "../listConfig";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string }> },
): Promise<Response> {
  const ctx = await requireOrgCtx((await params).org);
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const query = parseListQuery(sp, planListConfig);
  const { items } = applyListQuery(
    await loadPlanTasks(ctx),
    { ...query, page: 1 },
    { ...planListConfig, pageSize: 100_000 },
  );
  const csv = toCsv(
    ["Task", "Project", "Phase", "Assigned", "Start", "End", "Duration (days)", "RAG", "Status", "Notes"],
    items.map((t) => [
      t.name,
      t.jobName ?? "",
      t.phaseName ?? "",
      t.assignedTo,
      t.startDate,
      t.endDate,
      t.durationDays || "",
      t.rag,
      t.status,
      t.notes,
    ]),
  );
  return csvResponse(`plan-${ctx.orgSlug}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
