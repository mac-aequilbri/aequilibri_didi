"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const PATH = "/uc1/solar-partners";

export async function createSolarPartner(formData: FormData) {
  await prisma.uc1SolarPartner.create({
    data: {
      name: String(formData.get("name") ?? "Partner"),
      contactName: String(formData.get("contact_name") ?? ""),
      contactEmail: String(formData.get("contact_email") ?? ""),
      referralFeePct: Number(formData.get("referral_fee_pct") ?? 10),
      avgInstallValue: Number(formData.get("avg_install_value") ?? 10000),
      isActive: true,
    },
  });
  revalidatePath(PATH);
}

export async function toggleSolarPartner(formData: FormData) {
  const id = Number(formData.get("id"));
  const row = await prisma.uc1SolarPartner.findUnique({ where: { id }, select: { isActive: true } });
  if (row) await prisma.uc1SolarPartner.update({ where: { id }, data: { isActive: !row.isActive } });
  revalidatePath(PATH);
}
