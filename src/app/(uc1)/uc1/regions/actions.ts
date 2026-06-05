"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const PATH = "/uc1/regions";

export async function createRegion(formData: FormData) {
  await prisma.uc1Region.create({
    data: {
      name: String(formData.get("name") ?? ""),
      postcodes: String(formData.get("postcodes") ?? ""),
      travelDays: Number(formData.get("travel_days") ?? 0),
      travelRate: Number(formData.get("travel_rate") ?? 0),
      premiumPct: Number(formData.get("premium_pct") ?? 0),
      isActive: true,
    },
  });
  revalidatePath(PATH);
}

export async function updateRegion(formData: FormData) {
  const id = Number(formData.get("id"));
  await prisma.uc1Region.update({
    where: { id },
    data: {
      postcodes: String(formData.get("postcodes") ?? ""),
      travelDays: Number(formData.get("travel_days") ?? 0),
      travelRate: Number(formData.get("travel_rate") ?? 0),
      premiumPct: Number(formData.get("premium_pct") ?? 0),
    },
  });
  revalidatePath(PATH);
}

export async function toggleRegion(formData: FormData) {
  const id = Number(formData.get("id"));
  const row = await prisma.uc1Region.findUnique({ where: { id }, select: { isActive: true } });
  if (row) await prisma.uc1Region.update({ where: { id }, data: { isActive: !row.isActive } });
  revalidatePath(PATH);
}

export async function seedDefaultRegions() {
  const defaults = [
    { name: "Townsville Metro", postcodes: "4810,4811,4812,4813,4814,4815,4816,4817,4818,4819", travelDays: 0, travelRate: 0, premiumPct: 0 },
    { name: "Cairns", postcodes: "4870,4871,4872,4873,4878", travelDays: 1, travelRate: 450, premiumPct: 8 },
    { name: "Mackay", postcodes: "4740,4741,4742,4743", travelDays: 1, travelRate: 400, premiumPct: 5 },
  ];
  for (const r of defaults) {
    await prisma.uc1Region.upsert({
      where: { name: r.name },
      update: {},
      create: { ...r, isActive: true },
    });
  }
  revalidatePath(PATH);
}
