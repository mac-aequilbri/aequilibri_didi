"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const PATH = "/uc1/guttering-rates";

export async function createGutteringRate(formData: FormData) {
  await prisma.uc1GutteringRate.create({
    data: {
      itemType: String(formData.get("item_type") ?? "gutter"),
      description: String(formData.get("description") ?? ""),
      unit: String(formData.get("unit") ?? "lm"),
      rateExGst: Number(formData.get("rate_ex_gst") ?? 0),
      isActive: true,
    },
  });
  revalidatePath(PATH);
}

export async function toggleGutteringRate(formData: FormData) {
  const id = Number(formData.get("id"));
  const row = await prisma.uc1GutteringRate.findUnique({ where: { id }, select: { isActive: true } });
  if (row) await prisma.uc1GutteringRate.update({ where: { id }, data: { isActive: !row.isActive } });
  revalidatePath(PATH);
}

export async function deleteGutteringRate(formData: FormData) {
  await prisma.uc1GutteringRate.delete({ where: { id: Number(formData.get("id")) } });
  revalidatePath(PATH);
}
