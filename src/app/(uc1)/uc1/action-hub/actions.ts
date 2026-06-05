"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const PATH = "/uc1/action-hub";

export async function createAction(formData: FormData) {
  const dueDateStr = String(formData.get("due_date") ?? "");
  await prisma.uc1ActionHub.create({
    data: {
      action: String(formData.get("action") ?? ""),
      priority: String(formData.get("priority") ?? "P2") as "P1" | "P2" | "P3",
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      triggerCondition: String(formData.get("trigger_condition") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      status: "open",
    },
  });
  revalidatePath(PATH);
}

export async function updateActionStatus(formData: FormData) {
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "open");
  await prisma.uc1ActionHub.update({ where: { id }, data: { status } });
  revalidatePath(PATH);
}

export async function deleteAction(formData: FormData) {
  await prisma.uc1ActionHub.delete({ where: { id: Number(formData.get("id")) } });
  revalidatePath(PATH);
}
