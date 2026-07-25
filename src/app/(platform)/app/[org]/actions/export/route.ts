// Issues Register export (Spec 12 Module 8, lock plan §8.5) — the current
// filtered view as an Excel-compatible CSV. Honours the same listQuery params
// as the page, the viewer's RLS scope (loadActions), and exports ALL matching
// rows, not just the visible page.

import { actionsListConfig, loadActions } from "@/lib/platform/actionsSource";
import { csvResponse, toCsv } from "@/lib/platform/csv";
import { parseListQuery } from "@/lib/platform/listQuery";
import { requireOrgCtx } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ org: string }> },
): Promise<Response> {
  const ctx = await requireOrgCtx((await params).org);
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const query = parseListQuery(sp, actionsListConfig);
  // Same source call as the page: loadActions applies the filters itself and
  // returns ALL matching rows (pagination is a page concern, not an export one).
  const { items } = await loadActions(ctx, query);
  const csv = toCsv(
    ["Title", "Project", "Issue type", "Priority", "Status", "Owner", "Due date", "Source"],
    items.map((a) => [a.title, a.jobCode ?? "", a.issueType, a.priority, a.rawStatus || a.status, a.owner, a.dueDate, a.sourceType]),
  );
  return csvResponse(`issues-register-${ctx.orgSlug}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
