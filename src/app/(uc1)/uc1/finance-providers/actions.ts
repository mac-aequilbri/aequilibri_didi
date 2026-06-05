"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

const PATH = "/uc1/finance-providers";

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || `p-${Date.now() % 100000}`;
}

export async function createFinanceProvider(formData: FormData) {
  const name = String(formData.get("name") ?? "Provider");
  await prisma.uc1FinanceProvider.create({
    data: {
      name,
      slug: slugify(name),
      interestRatePct: Number(formData.get("interest_rate_pct") ?? 0),
      minTermMonths: Number(formData.get("min_term_months") ?? 12),
      maxTermMonths: Number(formData.get("max_term_months") ?? 60),
      tagline: String(formData.get("tagline") ?? ""),
      isActive: true,
    },
  });
  revalidatePath(PATH);
}

export async function toggleFinanceProvider(formData: FormData) {
  const id = Number(formData.get("id"));
  const row = await prisma.uc1FinanceProvider.findUnique({ where: { id }, select: { isActive: true } });
  if (row) await prisma.uc1FinanceProvider.update({ where: { id }, data: { isActive: !row.isActive } });
  revalidatePath(PATH);
}
