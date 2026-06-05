"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const PATH = "/uc1/workstreams";

export async function createWorkstream(formData: FormData) {
  await prisma.uc1Workstream.create({
    data: {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      milestone: String(formData.get("milestone") ?? ""),
      status: "active",
      loadAtSessionStart: formData.get("load_at_session_start") === "on",
      notes: String(formData.get("notes") ?? ""),
    },
  });
  revalidatePath(PATH);
}

export async function toggleSessionLoad(formData: FormData) {
  const id = Number(formData.get("id"));
  const row = await prisma.uc1Workstream.findUnique({ where: { id }, select: { loadAtSessionStart: true } });
  if (row) await prisma.uc1Workstream.update({ where: { id }, data: { loadAtSessionStart: !row.loadAtSessionStart } });
  revalidatePath(PATH);
}

export async function updateStatus(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "active");
  await prisma.uc1Workstream.update({ where: { id }, data: { status } });
  revalidatePath(PATH);
}

export async function deleteWorkstream(formData: FormData) {
  await prisma.uc1Workstream.delete({ where: { id: Number(formData.get("id")) } });
  revalidatePath(PATH);
}
