"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const PATH = "/uc1/team";

export async function createTeamMember(formData: FormData) {
  await prisma.uc1TeamMember.create({
    data: {
      name: String(formData.get("name") ?? ""),
      role: String(formData.get("role") ?? "estimator"),
      accuracyProfile: String(formData.get("accuracy_profile") ?? ""),
      isActive: true,
    },
  });
  revalidatePath(PATH);
}

export async function updateAccuracyProfile(formData: FormData) {
  const id = Number(formData.get("id"));
  await prisma.uc1TeamMember.update({
    where: { id },
    data: { accuracyProfile: String(formData.get("accuracy_profile") ?? "") },
  });
  revalidatePath(PATH);
}

export async function toggleMember(formData: FormData) {
  const id = Number(formData.get("id"));
  const row = await prisma.uc1TeamMember.findUnique({ where: { id }, select: { isActive: true } });
  if (row) await prisma.uc1TeamMember.update({ where: { id }, data: { isActive: !row.isActive } });
  revalidatePath(PATH);
}
