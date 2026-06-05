"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { round2 } from "@/lib/money";

const STATUSES = new Set(["draft", "sent", "accepted", "declined"]);

export async function updateQuoteStatus(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  if (!id || !STATUSES.has(status)) return;
  await prisma.uc1Quote.update({ where: { id }, data: { status } });
  revalidatePath(`/uc1/quotes/${id}`);
  revalidatePath("/uc1/quotes");
}

export async function addLineItem(formData: FormData) {
  const id = Number(formData.get("id"));
  const description = String(formData.get("description") ?? "").trim();
  if (!id || !description) return;
  const last = await prisma.uc1QuoteItem.findFirst({ where: { quoteId: id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await prisma.uc1QuoteItem.create({
    data: {
      quoteId: id,
      description,
      quantity: Number(formData.get("quantity")) || 0,
      unit: String(formData.get("unit") ?? "m²"),
      unitPriceExGst: Number(formData.get("unit_price_ex_gst")) || 0,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });
  revalidatePath(`/uc1/quotes/${id}`);
}

export async function deleteLineItem(formData: FormData) {
  const id = Number(formData.get("id"));
  const itemId = Number(formData.get("item_id"));
  if (!itemId) return;
  await prisma.uc1QuoteItem.delete({ where: { id: itemId } });
  revalidatePath(`/uc1/quotes/${id}`);
}

export async function deleteQuote(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await prisma.uc1QuoteItem.deleteMany({ where: { quoteId: id } });
  await prisma.uc1Quote.delete({ where: { id } });
  redirect("/uc1/quotes");
}

const MODE_MARKUP: Record<string, number> = { match: 0.1, optimal: 0.18, premium: 0.25 };
const TIER_MARKUP: Record<string, number> = { essential: 0.1, shield: 0.18, summit: 0.3 };

// Re-price: change the markup mechanism/mode/tier and re-scale the non-gutter
// line items from the old markup to the new one (gutter items are unaffected).
export async function repriceQuote(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  const quote = await prisma.uc1Quote.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!quote) return;

  const mechanism = String(formData.get("new_mechanism") ?? "cost_plus");
  const mode = String(formData.get("new_mode") ?? "match");
  const tier = String(formData.get("new_tier") ?? "essential");
  const newMarkup = mechanism === "packages" ? TIER_MARKUP[tier] ?? 0.1 : mechanism === "tapered" ? 0 : MODE_MARKUP[mode] ?? 0.1;
  const oldMarkup = Number(quote.markupPct);
  const factor = (1 + newMarkup) / (1 + (mechanism === "tapered" ? 0 : oldMarkup) || 1);

  // Re-scale non-gutter items (gutter lines contain "Gutter"/"Downpipe").
  for (const it of quote.items) {
    const isGutter = /gutter|downpipe/i.test(it.description);
    if (isGutter) continue;
    await prisma.uc1QuoteItem.update({ where: { id: it.id }, data: { unitPriceExGst: round2(Number(it.unitPriceExGst) * factor) } });
  }
  await prisma.uc1Quote.update({
    where: { id },
    data: { pricingMechanism: mechanism, pricingMode: mechanism === "cost_plus" ? mode : "", packageTier: mechanism === "packages" ? tier : "", markupPct: newMarkup },
  });
  revalidatePath(`/uc1/quotes/${id}`);
}
