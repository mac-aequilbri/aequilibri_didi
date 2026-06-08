"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";
import { PITCH_FACTORS } from "@/services/uc1/constants";

const PO_STATUSES = new Set(["draft", "sent", "confirmed", "cancelled"]);

function two(n: number): string {
  return String(n).padStart(2, "0");
}

async function generatePoNumber(): Promise<string> {
  const d = new Date();
  const ymd = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}`;
  for (let i = 0; i < 25; i++) {
    const count = await prisma.uc1PurchaseOrder.count({ where: { poNumber: { startsWith: `PO-${ymd}-` } } });
    const po = `PO-${ymd}-${String(count + 1 + i).padStart(4, "0")}`;
    const exists = await prisma.uc1PurchaseOrder.findUnique({ where: { poNumber: po }, select: { id: true } });
    if (!exists) return po;
  }
  return `PO-${ymd}-${Date.now() % 10000}`;
}

/** Raise a purchase order for a quote, directed at the chosen vendor.
 *  Mirrors Django uc1_roofing.views.purchase_order_create: a material line
 *  (from the vendor's price for the quote material) + standard accessory lines. */
export async function createPurchaseOrder(formData: FormData) {
  const quoteId = Number(formData.get("quote_id"));
  const vendorId = Number(formData.get("vendor_id"));
  if (!quoteId || !vendorId) redirect(`/uc1/quotes/${quoteId || ""}/purchase`);

  const quote = await prisma.uc1Quote.findUnique({ where: { id: quoteId } });
  const vendor = await prisma.uc1Vendor.findFirst({ where: { id: vendorId, isActive: true } });
  if (!quote || !vendor) redirect(`/uc1/quotes/${quoteId}/purchase`);

  const deliveryDateRaw = String(formData.get("delivery_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  // Adjusted (covered) area — flat × pitch factor × (1 + waste%). Same as Quote.adjusted_area_sqm.
  const pitchFactor = PITCH_FACTORS[quote!.pitchType] ?? 1.0;
  const area = round2(
    Number(quote!.flatAreaSqm) * pitchFactor * (1 + Number(quote!.wasteFactorPct) / 100)
  );

  const poNumber = await generatePoNumber();

  const po = await prisma.uc1PurchaseOrder.create({
    data: {
      poNumber,
      quoteId: quote!.id,
      vendorId: vendor!.id,
      status: "draft",
      deliveryAddress: quote!.propertyAddress,
      requestedDeliveryDate: deliveryDateRaw ? new Date(deliveryDateRaw) : null,
      notes,
    },
  });

  let sort = 1;
  const items: {
    purchaseOrderId: number;
    description: string;
    itemCode: string;
    quantity: number;
    unit: string;
    unitPriceExGst: number;
    sortOrder: number;
  }[] = [];

  // Material line from the vendor's price for this material (if present).
  const vp = await prisma.uc1VendorMaterialPrice.findFirst({
    where: { vendorId: vendor!.id, material: quote!.material },
  });
  if (vp) {
    items.push({
      purchaseOrderId: po.id,
      description: vp.description,
      itemCode: vp.itemCode,
      quantity: area,
      unit: vp.unit,
      unitPriceExGst: Number(vp.unitPriceExGst),
      sortOrder: sort++,
    });
  }

  // Standard accessory lines (matches Django ACCESSORY_RATES).
  const accessories: [string, number, string, number][] = [
    ["Ridge capping", 1, "lot", 320.0],
    ["Fasteners & screws", area, "m²", 1.8],
    ["Flashing & sealant kit", 1, "lot", 210.0],
  ];
  for (const [description, quantity, unit, price] of accessories) {
    items.push({
      purchaseOrderId: po.id,
      description,
      itemCode: "",
      quantity,
      unit,
      unitPriceExGst: price,
      sortOrder: sort++,
    });
  }

  if (items.length) await prisma.uc1PurchaseOrderItem.createMany({ data: items });

  const total = items.reduce((s, i) => s + i.quantity * i.unitPriceExGst, 0);
  await prisma.uc1ExecutionLog.create({
    data: {
      toolName: "create_purchase_order",
      payload: JSON.stringify({ quote_ref: quote!.refNumber, vendor: vendor!.name, material: quote!.material, area_sqm: area }),
      result: JSON.stringify({ po_number: po.poNumber, total_inc_gst: round2(total * 1.1) }),
      status: "success",
      quoteId: quote!.id,
    },
  });

  redirect(`/uc1/purchase-orders/${po.id}`);
}

/** Update a PO's status from the detail page. */
export async function updatePoStatus(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!id || !PO_STATUSES.has(status)) return;

  const po = await prisma.uc1PurchaseOrder.findUnique({ where: { id }, select: { id: true, poNumber: true, quoteId: true } });
  if (!po) return;

  await prisma.uc1PurchaseOrder.update({ where: { id }, data: { status } });
  await prisma.uc1ExecutionLog.create({
    data: {
      toolName: "update_po_status",
      payload: JSON.stringify({ po_number: po.poNumber, new_status: status }),
      result: JSON.stringify({ ok: true }),
      status: "success",
      quoteId: po.quoteId ?? undefined,
    },
  });
  revalidatePath(`/uc1/purchase-orders/${id}`);
  revalidatePath("/uc1/purchase-orders");
}
