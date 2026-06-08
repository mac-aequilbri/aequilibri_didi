"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const LEAD_STATUSES = new Set(["new", "contacted", "quoted", "won", "lost"]);

async function refreshLeadCount(stormEventId: number) {
  const count = await prisma.uc1StormLead.count({ where: { stormEventId } });
  await prisma.uc1StormEvent.update({ where: { id: stormEventId }, data: { leadsGenerated: count } });
}

export async function addStormLead(formData: FormData) {
  const stormEventId = Number(formData.get("storm_event_id"));
  const address = String(formData.get("address") ?? "").trim();
  if (!stormEventId || !address) return;

  const event = await prisma.uc1StormEvent.findUnique({ where: { id: stormEventId }, select: { state: true, affectedSuburbs: true } });
  if (!event) return;

  await prisma.uc1StormLead.create({
    data: {
      stormEventId,
      address,
      suburb: String(formData.get("suburb") ?? "").trim(),
      state: event.state,
      roofAreaSqm: Number(formData.get("roof_area_sqm")) || 0,
      estimatedValue: Number(formData.get("estimated_value")) || 0,
      contactName: String(formData.get("contact_name") ?? "").trim(),
      contactPhone: String(formData.get("contact_phone") ?? "").trim(),
      contactEmail: String(formData.get("contact_email") ?? "").trim(),
      status: "new",
    },
  });
  await refreshLeadCount(stormEventId);
  revalidatePath(`/uc1/storm/${stormEventId}`);
}

/** Bulk-import leads from pasted CSV: address, suburb, area, value, name, phone (per line). */
export async function importStormLeadsCsv(formData: FormData) {
  const stormEventId = Number(formData.get("storm_event_id"));
  const csv = String(formData.get("csv_text") ?? "");
  if (!stormEventId || !csv.trim()) return;

  const event = await prisma.uc1StormEvent.findUnique({ where: { id: stormEventId }, select: { state: true, affectedSuburbs: true } });
  if (!event) return;
  const defaultSuburb = event.affectedSuburbs.split(",")[0]?.trim() ?? "";

  const rows: {
    stormEventId: number; address: string; suburb: string; state: string;
    roofAreaSqm: number; estimatedValue: number; contactName: string; contactPhone: string; status: string;
  }[] = [];
  for (const line of csv.trim().split(/\r?\n/)) {
    const parts = line.split(",").map((p) => p.trim());
    if (!parts[0]) continue;
    rows.push({
      stormEventId,
      address: parts[0],
      suburb: parts[1] || defaultSuburb,
      state: event.state,
      roofAreaSqm: parts[2] ? Number(parts[2]) || 0 : 0,
      estimatedValue: parts[3] ? Number(parts[3]) || 0 : 0,
      contactName: parts[4] || "",
      contactPhone: parts[5] || "",
      status: "new",
    });
  }
  if (rows.length) await prisma.uc1StormLead.createMany({ data: rows });
  await refreshLeadCount(stormEventId);
  revalidatePath(`/uc1/storm/${stormEventId}`);
}

export async function updateStormLead(formData: FormData) {
  const id = Number(formData.get("lead_id"));
  const stormEventId = Number(formData.get("storm_event_id"));
  const status = String(formData.get("status") ?? "");
  if (!id || !LEAD_STATUSES.has(status)) return;
  await prisma.uc1StormLead.update({
    where: { id },
    data: {
      status,
      contactName: String(formData.get("contact_name") ?? "").trim() || undefined,
      contactPhone: String(formData.get("contact_phone") ?? "").trim() || undefined,
    },
  });
  revalidatePath(`/uc1/storm/${stormEventId}`);
}
