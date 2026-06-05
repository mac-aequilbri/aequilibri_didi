"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  recordCorrection, runHypothesisEngine, setHypothesisStatus,
  promoteHypothesisToRule, snapshotIntelligence,
} from "@/services/uc1/learning";

const PATH = "/uc1/intelligence";

export async function runEngine() {
  await runHypothesisEngine();
  revalidatePath(PATH);
}

export async function approveHypothesis(formData: FormData) {
  await setHypothesisStatus(Number(formData.get("id")), "active");
  revalidatePath(PATH);
}

export async function rejectHypothesis(formData: FormData) {
  await setHypothesisStatus(Number(formData.get("id")), "rejected");
  revalidatePath(PATH);
}

export async function promoteRule(formData: FormData) {
  await promoteHypothesisToRule(Number(formData.get("id")));
  revalidatePath(PATH);
}

export async function toggleRule(formData: FormData) {
  const id = Number(formData.get("id"));
  const r = await prisma.uc1LearningRule.findUnique({ where: { id }, select: { isActive: true } });
  if (r) await prisma.uc1LearningRule.update({ where: { id }, data: { isActive: !r.isActive } });
  revalidatePath(PATH);
}

export async function takeSnapshot() {
  await snapshotIntelligence();
  revalidatePath(PATH);
}

// Demo seeding — populates a realistic batch of corrections + jobs so the
// loop is visible without waiting for live quoting volume.
export async function seedDemo() {
  const valleyCause = "pre-1975 cross-gable, shallow valley angle missed in top-down imagery";
  const areaCause = "multi-wing roof, AI under-traced complex outline";
  const demoCorrections = [
    ...Array.from({ length: 6 }, (_, i) => ({ dimension: "valley_lm", suburb: "Townsville", address: `${10 + i} Example St, Townsville QLD`, aiValue: 8.2, humanValue: 11.4, rootCause: valleyCause })),
    ...Array.from({ length: 4 }, (_, i) => ({ dimension: "roof_area", suburb: "Ayr", address: `${20 + i} Sample Rd, Ayr QLD`, aiValue: 240, humanValue: 265, rootCause: areaCause })),
    ...Array.from({ length: 3 }, (_, i) => ({ dimension: "ridge_lm", suburb: "Townsville", address: `${30 + i} Test Ave, Townsville QLD`, aiValue: 14, humanValue: 15.5, rootCause: "hip ridges partially shadowed" })),
  ];
  for (const c of demoCorrections) await recordCorrection(c);

  // A few completed jobs (estimated vs actual) for the accuracy metric.
  for (let i = 0; i < 5; i++) {
    const est = 200 + i * 20;
    const act = est * (1 + (i % 2 === 0 ? 0.04 : -0.03));
    await prisma.uc1Job.create({
      data: {
        address: `${40 + i} Demo St, Townsville QLD`, estimatedAreaM2: est, actualAreaM2: Math.round(act * 10) / 10,
        estimatedTotal: est * 130, actualTotal: Math.round(act * 130),
        variancePctArea: Math.round(((act - est) / est) * 1000) / 10,
        status: "completed", completedAt: new Date(),
      },
    });
  }
  await runHypothesisEngine();
  await snapshotIntelligence();
  revalidatePath(PATH);
}

export async function clearDemo() {
  await prisma.uc1Correction.deleteMany();
  await prisma.uc1Hypothesis.deleteMany();
  await prisma.uc1LearningRule.deleteMany();
  await prisma.uc1Job.deleteMany();
  await prisma.uc1IntelligenceSnapshot.deleteMany();
  revalidatePath(PATH);
}
