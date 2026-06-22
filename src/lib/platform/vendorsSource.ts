// Vendors data source — Postgres (default) or the Airtable VENDORS table
// (Domain Extension) when AIRTABLE_MIGRATION is enabled. Org-level list, no job
// scoping. Same per-page loader pattern as the other migrated pages.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";
import type { OrgCtx } from "./types";

export interface VendorView {
  id: string;
  name: string;
  category: string;
  contactName: string;
  contactEmail: string;
  rating: number;
  isActive: boolean;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function fromPostgres(ctx: OrgCtx): Promise<VendorView[]> {
  const vendors = await prisma.platConVendor.findMany({
    where: { orgId: ctx.orgId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return vendors.map((v) => ({
    id: String(v.id),
    name: v.name,
    category: v.category,
    contactName: v.contactName,
    contactEmail: v.contactEmail,
    rating: v.rating,
    isActive: v.isActive,
  }));
}

async function fromAirtable(ctx: OrgCtx): Promise<VendorView[]> {
  const rows = await core.list(ctx.orgSlug, "VENDORS", { maxRecords: 200 });
  return rows.map((r) => ({
    id: r.id,
    name: str(r["Vendor_Name"]) || "(unnamed vendor)",
    category: str(r["Category"]),
    contactName: str(r["Contact_Name"]),
    contactEmail: str(r["Contact_Email"]),
    rating: typeof r["Rating"] === "number" ? (r["Rating"] as number) : 0,
    isActive: r["Is_Active"] === true,
  }));
}

/** Load the vendor registry from whichever backend is active. */
export function loadVendors(ctx: OrgCtx): Promise<VendorView[]> {
  return airtableEnabled() ? fromAirtable(ctx) : fromPostgres(ctx);
}
