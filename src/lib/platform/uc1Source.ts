// UC1 (Roofing) data sources — Postgres (default) or Airtable when the flag is
// on. UC1 is single-tenant (no org), so a fixed slug resolves to the roofing
// base. First UC1 page on Airtable; the rest of the ~40 Uc1* models follow the
// same pattern. createdAt isn't carried from Airtable (no field) -> null.

import { airtableEnabled, core } from "@/lib/airtable";
import { prisma } from "@/lib/db";

/** Single-tenant roofing base key (dev resolves to the demo base). */
const UC1_SLUG = "uc1-roofing";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export interface Uc1ContactView {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  createdAt: Date | string | null;
  quotes: number;
}

export async function loadUc1Contacts(): Promise<Uc1ContactView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.uc1Contact.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { quotes: true } } },
    });
    return rows.map((c) => ({
      id: String(c.id),
      name: c.name,
      email: c.email,
      phone: c.phone,
      company: c.company,
      createdAt: c.createdAt,
      quotes: c._count.quotes,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_CONTACTS", { maxRecords: 500 });
  return rows.map((r) => ({
    id: r.id,
    name: str(r["Contact_Name"]) || "(unnamed)",
    email: str(r["Email"]),
    phone: str(r["Phone"]),
    company: str(r["Company"]),
    createdAt: null, // no created field carried from Airtable
    quotes: 0, // quote linkage not migrated yet
  }));
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

export interface Uc1RateCardView {
  id: string;
  material: string;
  pitchType: string;
  description: string;
  unit: string;
  rateExGst: number;
  isActive: boolean;
}

export async function loadUc1RateCards(): Promise<Uc1RateCardView[]> {
  if (!airtableEnabled()) {
    const rows = await prisma.uc1RateCard.findMany({
      orderBy: [{ material: "asc" }, { pitchType: "asc" }],
    });
    return rows.map((c) => ({
      id: String(c.id),
      material: c.material,
      pitchType: c.pitchType,
      description: c.description,
      unit: c.unit,
      rateExGst: Number(c.rateExGst),
      isActive: c.isActive,
    }));
  }
  const rows = await core.list(UC1_SLUG, "ROOFING_RATE_CARDS", { maxRecords: 500 });
  return rows.map((r) => ({
    id: r.id,
    material: str(r["Material"]),
    pitchType: str(r["Pitch_Type"]),
    description: str(r["Description"]),
    unit: str(r["Unit"]) || "m²",
    rateExGst: num(r["Rate_Ex_GST"]),
    isActive: r["Is_Active"] === true,
  }));
}
