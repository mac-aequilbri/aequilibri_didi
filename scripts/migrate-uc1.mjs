// One-off local-dev migration: copy the core UC1 operational tables from the
// Django db.sqlite3 into the fresh Prisma dev.db, converting types so Prisma
// writes native formats (Date objects, numbers, booleans). Skips the 1.4 GB
// building-footprint table. Idempotent-ish: clears the target tables first.

import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const DJANGO_DB = "C:/Users/antonim3/Documents/aequilibri_poc/db.sqlite3";
const src = new DatabaseSync(DJANGO_DB, { readOnly: true });
const prisma = new PrismaClient();

const rows = (table) => src.prepare(`SELECT * FROM ${table}`).all();
const D = (v) => (v == null || v === "" ? null : new Date(String(v).replace(" ", "T")));
const N = (v) => (v == null ? 0 : Number(v));
const NN = (v) => (v == null ? null : Number(v));
const B = (v) => Boolean(v);
const S = (v) => (v == null ? "" : String(v));
const SN = (v) => (v == null ? null : String(v));

async function main() {
  // Clear in FK-safe order.
  await prisma.uc1QuoteItem.deleteMany();
  await prisma.uc1Quote.deleteMany();
  await prisma.uc1VendorMaterialPrice.deleteMany();
  await prisma.uc1Vendor.deleteMany();
  await prisma.uc1RateCard.deleteMany();
  await prisma.uc1Contact.deleteMany();

  await prisma.uc1Contact.createMany({
    data: rows("uc1_roofing_contact").map((r) => ({
      id: r.id, name: S(r.name), email: S(r.email), phone: S(r.phone),
      company: S(r.company), address: S(r.address), createdAt: D(r.created_at) ?? new Date(),
    })),
  });

  await prisma.uc1RateCard.createMany({
    data: rows("uc1_roofing_ratecard").map((r) => ({
      id: r.id, material: S(r.material), pitchType: S(r.pitch_type), description: S(r.description),
      unit: S(r.unit) || "m²", rateExGst: N(r.rate_ex_gst), isActive: B(r.is_active),
      updatedAt: D(r.updated_at) ?? new Date(),
    })),
  });

  await prisma.uc1Vendor.createMany({
    data: rows("uc1_roofing_vendor").map((r) => ({
      id: r.id, name: S(r.name), contactName: S(r.contact_name), contactEmail: S(r.contact_email),
      contactPhone: S(r.contact_phone), website: S(r.website), suburb: S(r.suburb),
      state: S(r.state) || "QLD", notes: S(r.notes), isPreferred: B(r.is_preferred),
      isActive: B(r.is_active), createdAt: D(r.created_at) ?? new Date(),
    })),
  });

  await prisma.uc1VendorMaterialPrice.createMany({
    data: rows("uc1_roofing_vendormaterialprice").map((r) => ({
      id: r.id, vendorId: r.vendor_id, material: S(r.material), itemCode: S(r.item_code),
      description: S(r.description), unit: S(r.unit) || "m²", unitPriceExGst: N(r.unit_price_ex_gst),
      leadDays: N(r.lead_days), priceSourceUrl: S(r.price_source_url), previousPrice: NN(r.previous_price),
      lastVerified: D(r.last_verified), isAvailable: B(r.is_available), updatedAt: D(r.updated_at) ?? new Date(),
    })),
  });

  await prisma.uc1Quote.createMany({
    data: rows("uc1_roofing_quote").map((r) => ({
      id: r.id, refNumber: S(r.ref_number), contactId: r.contact_id ?? null,
      propertyAddress: S(r.property_address), flatAreaSqm: N(r.flat_area_sqm), pitchType: S(r.pitch_type) || "standard",
      wasteFactorPct: N(r.waste_factor_pct), material: S(r.material) || "colorbond", notes: S(r.notes),
      status: S(r.status) || "draft", roofPolygonJson: SN(r.roof_polygon_json), roofSectionsJson: SN(r.roof_sections_json),
      detectedEquipmentJson: SN(r.detected_equipment_json), eaveLm: N(r.eave_lm), hipLm: N(r.hip_lm),
      perimeterM: N(r.perimeter_m), pitchDegActual: N(r.pitch_deg_actual), rakeLm: N(r.rake_lm), ridgeLm: N(r.ridge_lm),
      roofColour: S(r.roof_colour), storeys: N(r.storeys) || 1, valleyLm: N(r.valley_lm), markupPct: N(r.markup_pct),
      packageTier: S(r.package_tier), pricingMechanism: S(r.pricing_mechanism) || "cost_plus", pricingMode: S(r.pricing_mode),
      createdAt: D(r.created_at) ?? new Date(), updatedAt: D(r.updated_at) ?? new Date(),
    })),
  });

  await prisma.uc1QuoteItem.createMany({
    data: rows("uc1_roofing_quoteitem").map((r) => ({
      id: r.id, quoteId: r.quote_id, description: S(r.description), quantity: N(r.quantity),
      unit: S(r.unit) || "m²", unitPriceExGst: N(r.unit_price_ex_gst), sortOrder: N(r.sort_order),
    })),
  });

  const counts = {
    contacts: await prisma.uc1Contact.count(),
    rateCards: await prisma.uc1RateCard.count(),
    vendors: await prisma.uc1Vendor.count(),
    vendorPrices: await prisma.uc1VendorMaterialPrice.count(),
    quotes: await prisma.uc1Quote.count(),
    quoteItems: await prisma.uc1QuoteItem.count(),
  };
  console.log("Migrated:", JSON.stringify(counts));
}

main()
  .catch((e) => { console.error("MIGRATE ERROR:", e.message); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); src.close(); });
