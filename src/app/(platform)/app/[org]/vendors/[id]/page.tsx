// Single-vendor edit page. Reachable by clicking a row on the Vendors list.

import RecordEditPage from "../../_record-edit/RecordEditPage";
import { loadVendorDetail } from "@/lib/platform/vendorsSource";
import { requireOrgCtx } from "@/lib/platform/org-context";
import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const dynamic = "force-dynamic";

const config: RecordEditorConfig = {
  table: "vendor",
  noun: "vendor",
  listPath: "/vendors",
  aiRole:
    "You are an operations assistant helping a construction / field-service manager keep a clean vendor registry — sensible category labels and useful notes.",
  fields: [
    { name: "name", label: "Vendor name", type: "text", required: true },
    { name: "category", label: "Category", type: "text", aiFillable: true },
    { name: "contactName", label: "Contact name", type: "text" },
    { name: "contactEmail", label: "Contact email", type: "email" },
    { name: "contactPhone", label: "Contact phone", type: "tel" },
    { name: "rating", label: "Rating (1–10)", type: "number", min: 1, max: 10 },
    { name: "notes", label: "Notes", type: "textarea", full: true, aiFillable: true },
    { name: "isActive", label: "Active", type: "checkbox" },
  ],
};

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await requireOrgCtx(org);
  const values = await loadVendorDetail(ctx, id);
  return (
    <RecordEditPage
      orgSlug={ctx.orgSlug}
      config={config}
      values={values}
      recordId={id}
      subtitle={values ? String(values.name) : undefined}
    />
  );
}
