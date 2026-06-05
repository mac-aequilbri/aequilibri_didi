"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function createRateCard(formData: FormData) {
  await prisma.uc1RateCard.create({
    data: {
      material: String(formData.get("material") ?? "colorbond"),
      pitchType: String(formData.get("pitch_type") ?? "standard"),
      description: String(formData.get("description") ?? ""),
      unit: String(formData.get("unit") ?? "m²"),
      rateExGst: Number(formData.get("rate_ex_gst") ?? 0),
      isActive: true,
    },
  });
  revalidatePath("/uc1/rate-cards");
}

export async function toggleRateCard(formData: FormData) {
  const id = Number(formData.get("id"));
  const card = await prisma.uc1RateCard.findUnique({ where: { id }, select: { isActive: true } });
  if (card) await prisma.uc1RateCard.update({ where: { id }, data: { isActive: !card.isActive } });
  revalidatePath("/uc1/rate-cards");
}

export async function deleteRateCard(formData: FormData) {
  await prisma.uc1RateCard.delete({ where: { id: Number(formData.get("id")) } });
  revalidatePath("/uc1/rate-cards");
}
