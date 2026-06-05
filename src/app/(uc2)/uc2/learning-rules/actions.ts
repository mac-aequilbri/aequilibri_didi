"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const PATH = "/uc2/learning-rules";

export async function promoteHypothesis(formData: FormData) {
  const id = Number(formData.get("id"));
  const hyp = await prisma.uc2Hypothesis.findUnique({ where: { id } });
  if (!hyp) return;

  await prisma.$transaction([
    prisma.uc2Hypothesis.update({
      where: { id },
      data: { status: "promoted", reviewedAt: new Date(), reviewedBy: "system" },
    }),
    prisma.uc2LearningRule.create({
      data: {
        ruleCode: `HYP-${id}-${Date.now()}`,
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
