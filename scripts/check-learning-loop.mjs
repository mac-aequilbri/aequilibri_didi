// Dev smoke check: corrections → hypothesis engine → promotion → rule
// application, against the seeded coastal-fitouts org (then cleans up).
// Run: npx tsx scripts/check-learning-loop.mjs   (tsx needed for TS imports)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const { getOrgCtx } = await import("../src/lib/platform/org-context.ts");
const { runHypothesisEngine, promoteHypothesisToRule, applyRules } = await import(
  "../src/services/platform/learning.ts"
);

const ctx = await getOrgCtx("coastal-fitouts");
if (!ctx) throw new Error("coastal-fitouts not seeded");

// 1. Three same-cause corrections.
const ids = [];
for (const [ai, human] of [[10000, 11500], [8000, 9100], [20000, 22600]]) {
  const c = await prisma.platCorrection.create({
    data: {
      orgId: ctx.orgId,
      dimension: "budget.joinery",
      aiValue: ai,
      humanValue: human,
      variancePct: Math.round(((human - ai) / ai) * 1000) / 10,
      rootCause: "custom joinery hardware underestimated",
      context: JSON.stringify({ suburb: "Maroochydore" }),
      correctedBy: "smoke-test",
    },
  });
  ids.push(c.id);
}

// 2. Cluster.
const engine = await runHypothesisEngine(ctx);
console.log("engine:", engine);
const hyp = await prisma.platHypothesis.findFirst({
  where: { orgId: ctx.orgId, dimension: "budget.joinery", status: "pending" },
});
console.log("hypothesis:", hyp?.description, "| samples:", hyp?.sampleCount, "| trigger:", hyp?.triggerCondition);

// 3. Promote and apply.
const ruleId = await promoteHypothesisToRule(ctx, hyp.id, "adjustment");
const applied = await applyRules(ctx, { suburb: "Maroochydore" });
console.log("applied rules:", applied.map((r) => `${r.ruleCode} ${JSON.stringify(r.adjustment)}`));
const appliedWrongSuburb = await applyRules(ctx, { suburb: "Brisbane" });
console.log("applied for non-matching suburb:", appliedWrongSuburb.length);

// 4. Clean up the smoke-test artefacts.
await prisma.platCorrection.deleteMany({ where: { id: { in: ids } } });
if (hyp) await prisma.platHypothesis.delete({ where: { id: hyp.id } }).catch(() => {});
if (ruleId) await prisma.platLearningRule.delete({ where: { id: ruleId } }).catch(() => {});
console.log("cleaned up.");
await prisma.$disconnect();
