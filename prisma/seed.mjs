// Idempotent, fail-safe demo seed. Runs in the Render build AFTER `prisma db
// push`, so the freshly-provisioned Postgres has enough data to demo every UC.
//
//  - Idempotent: each block only seeds when its table is empty, so re-running
//    on every deploy is a no-op once data exists (and never duplicates rows).
//  - Fail-safe: any error is logged and swallowed; the script always exits 0 so
//    a seed problem can never break a deploy.
//
// Run locally with the dev client:  node prisma/seed.mjs

import { PrismaClient } from "@prisma/client";
import { seedPlatform } from "./seed-platform.mjs";

const prisma = new PrismaClient();

async function seedIfEmpty(label, model, rows) {
  try {
    const count = await model.count();
    if (count > 0) {
      console.log(`  · ${label}: ${count} rows already present — skipped`);
      return;
    }
    await model.createMany({ data: rows });
    console.log(`  ✓ ${label}: seeded ${rows.length}`);
  } catch (err) {
    console.log(`  ! ${label}: skipped (${err?.message ?? err})`);
  }
}

async function main() {
  console.log("Seeding demo data (idempotent)…");

  // ── UC1 — config tables ────────────────────────────────────────────────────
  await seedIfEmpty("uc1 rate cards", prisma.uc1RateCard, [
    { material: "colorbond", pitchType: "standard", description: "Colorbond Steel — standard pitch", unit: "m²", rateExGst: 120 },
    { material: "colorbond", pitchType: "steep", description: "Colorbond Steel — steep pitch", unit: "m²", rateExGst: 138 },
    { material: "terracotta", pitchType: "standard", description: "Terracotta Tiles — standard pitch", unit: "m²", rateExGst: 150 },
    { material: "concrete", pitchType: "standard", description: "Concrete Tiles — standard pitch", unit: "m²", rateExGst: 135 },
  ]);

  await seedIfEmpty("uc1 guttering rates", prisma.uc1GutteringRate, [
    { itemType: "gutter", description: "Colorbond 150mm quad gutter", unit: "lm", rateExGst: 100 },
    { itemType: "downpipe", description: "90mm PVC downpipe", unit: "each", rateExGst: 250 },
    { itemType: "valley", description: "Valley iron", unit: "lm", rateExGst: 45 },
    { itemType: "ridge_cap", description: "Ridge capping", unit: "lm", rateExGst: 35 },
  ]);

  await seedIfEmpty("uc1 finance providers", prisma.uc1FinanceProvider, [
    { name: "Brighte", slug: "brighte", interestRatePct: 0, minTermMonths: 12, maxTermMonths: 24, minAmount: 1000, tagline: "0% interest-free for 24 months" },
    { name: "Humm", slug: "humm", interestRatePct: 9.95, minTermMonths: 12, maxTermMonths: 60, minAmount: 2000, tagline: "Flexible terms up to 5 years" },
  ]);

  await seedIfEmpty("uc1 solar partners", prisma.uc1SolarPartner, [
    { name: "Sunshine Coast Solar", contactName: "Dana Reyes", contactEmail: "leads@scsolar.example", referralFeePct: 10, avgInstallValue: 12000 },
  ]);

  // Vendors + their material prices (vendor material price needs vendorId).
  try {
    if ((await prisma.uc1Vendor.count()) === 0) {
      const v1 = await prisma.uc1Vendor.create({ data: { name: "Townsville Steel Supplies", suburb: "Garbutt", state: "QLD", isPreferred: true } });
      const v2 = await prisma.uc1Vendor.create({ data: { name: "Reef Roofing Supplies", suburb: "Aitkenvale", state: "QLD" } });
      await prisma.uc1VendorMaterialPrice.createMany({
        data: [
          { vendorId: v1.id, material: "colorbond", description: ".48 BMT Colorbond sheet", unit: "m²", unitPriceExGst: 38, leadDays: 3 },
          { vendorId: v1.id, material: "zincalume", description: ".48 BMT Zincalume sheet", unit: "m²", unitPriceExGst: 33, leadDays: 3 },
          { vendorId: v2.id, material: "colorbond", description: "Colorbond Ultra sheet", unit: "m²", unitPriceExGst: 41, leadDays: 5 },
          { vendorId: v2.id, material: "terracotta", description: "Terracotta tile (each)", unit: "each", unitPriceExGst: 2.4, leadDays: 7 },
        ],
      });
      console.log("  ✓ uc1 vendors + prices: seeded 2 vendors / 4 prices");
    } else {
      console.log("  · uc1 vendors already present — skipped");
    }
  } catch (err) {
    console.log(`  ! uc1 vendors: skipped (${err?.message ?? err})`);
  }

  // ── UC2 — Dulong Downs minimal context ─────────────────────────────────────
  await seedIfEmpty("uc2 metadata", prisma.uc2Metadata, [
    { key: "project_name", value: "Dulong Downs Residence" },
    { key: "client", value: "Client / Owner Organisation" },
    { key: "site_address", value: "199 Dulong Road, QLD" },
    { key: "target_completion", value: "2027-02-28" },
  ]);

  await seedIfEmpty("uc2 learning rules", prisma.uc2LearningRule, [
    { ruleCode: "LRN-0001", description: "Always load CHANGE_LOG on session start to detect off-system changes.", category: "Session" },
    { ruleCode: "LRN-0006", description: "Never process more than one bulk payment batch per session without re-verifying CASHFLOWS.", category: "Finance", cannotOverride: true },
    { ruleCode: "LRN-0030", description: "Always cross-check CASHFLOWS before any Lighthouse Noosa invoice write.", category: "Finance" },
  ]);

  await seedIfEmpty("uc2 project phases", prisma.uc2ProjectPhase, [
    { name: "Site Preparation", status: "complete", completionPct: 100, order: 1, budgetEstimate: 45000 },
    { name: "Foundation", status: "complete", completionPct: 100, order: 2, budgetEstimate: 120000 },
    { name: "Framing & Structure", status: "in_progress", completionPct: 60, order: 3, budgetEstimate: 180000 },
    { name: "Roofing", status: "not_started", completionPct: 0, order: 4, budgetEstimate: 90000 },
  ]);

  // ── UC3 — a demo tenant with a project so the app is usable end-to-end ──────
  try {
    const tenant = await prisma.uc3Tenant.upsert({
      where: { orgId: "org_demo" },
      update: {},
      create: { name: "Demo Constructions Pty Ltd", orgId: "org_demo", isActive: true },
    });

    if ((await prisma.uc3Project.count({ where: { tenantId: tenant.id } })) === 0) {
      const project = await prisma.uc3Project.create({
        data: {
          tenantId: tenant.id,
          name: "Riverside Townhouses — Stage 1",
          client: "Riverside Developments",
          status: "active",
          healthScore: 72,
          startDate: new Date("2026-02-01"),
          endDate: new Date("2026-11-30"),
          description: "8-unit townhouse development, two storeys.",
        },
      });

      await prisma.uc3Phase.createMany({
        data: [
          { projectId: project.id, tenantId: tenant.id, name: "Earthworks & Slab", status: "complete", completionPct: 100, order: 1 },
          { projectId: project.id, tenantId: tenant.id, name: "Frame & Lock-up", status: "in_progress", completionPct: 45, order: 2 },
          // An AI-drafted phase so the Phase Approvals workflow has something to review.
          { projectId: project.id, tenantId: tenant.id, name: "Fit-out (AI-proposed)", status: "not_started", completionPct: 0, order: 3, isAiDraft: true },
        ],
      });

      await prisma.uc3ActionItem.createMany({
        data: [
          { projectId: project.id, tenantId: tenant.id, title: "Confirm truss delivery date", owner: "Site Supervisor", priority: "high", status: "open" },
          { projectId: project.id, tenantId: tenant.id, title: "Submit progress claim #3", owner: "Finance Officer", priority: "medium", status: "open" },
        ],
      });

      await prisma.uc3Risk.create({
        data: {
          projectId: project.id, tenantId: tenant.id,
          description: "Wet-season delays to external works",
          likelihood: 4, impact: 4, status: "open",
          mitigation: "Sequence external works early; have covered-works plan ready.",
        },
      });

      await prisma.uc3Decision.create({
        data: {
          projectId: project.id, tenantId: tenant.id,
          description: "Switch slab supplier to Lighthouse Concrete for Stage 1.",
          rationale: "Better lead time and price on the 32MPa mix.",
          status: "draft", isAiDraft: true, draftedBy: "AI",
        },
      });

      console.log("  ✓ uc3 demo tenant + project (phases, actions, risk, decision)");
    } else {
      console.log("  · uc3 demo project already present — skipped");
    }
  } catch (err) {
    console.log(`  ! uc3 demo data: skipped (${err?.message ?? err})`);
  }

  // ── Platform (Plat*) — three demo organisations on the shared core ─────────
  await seedPlatform(prisma);

  console.log("Seed complete.");
}

main()
  .catch((err) => console.log(`Seed error (ignored): ${err?.message ?? err}`))
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0); // never fail the build on seed problems
  });
