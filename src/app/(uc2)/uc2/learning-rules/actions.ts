"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const PATH = "/uc2/learning-rules";

// Allocate the next sequential LRN-#### code, retrying on the unlikely race
// where two promotions pick the same number. Mirrors the Django convention
// (LRN-0001, LRN-0002, …) that the chat system prompt itself references.
async function nextRuleCode(): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const count = await prisma.uc2LearningRule.count({ where: { ruleCode: { startsWith: "LRN-" } } });
    const code = `LRN-${String(count + 1 + i).padStart(4, "0")}`;
    const exists = await prisma.uc2LearningRule.findFirst({ where: { ruleCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  return `LRN-${Date.now() % 10000}`;
}

export async function promoteHypothesis(formData: FormData) {
  const id = Number(formData.get("id"));
  const reviewedBy = (formData.get("reviewedBy") as string)?.trim() || "Project Manager";
  const hyp = await prisma.uc2Hypothesis.findUnique({ where: { id } });
  if (!hyp) return;

  const ruleCode = await nextRuleCode();

  await prisma.$transaction([
    prisma.uc2Hypothesis.update({
      where: { id },
      data: { status: "promoted", reviewedAt: new Date(), reviewedBy },
    }),
    prisma.uc2LearningRule.create({
      data: {
        ruleCode,
        description: hyp.description,
        category: "hypothesis",
        isActive: true,
        cannotOverride: false,
        sourceId: id,
      },
    }),
  ]);
  revalidatePath(PATH);
}
