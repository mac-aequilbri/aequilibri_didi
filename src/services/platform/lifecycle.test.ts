// Integration tests against the dev/CI SQLite database for the platform's
// security- and correctness-critical lifecycles:
//   - org-isolation guard (unscoped queries throw before reaching the DB)
//   - recordWriter: executed writes + append-only audit, proposal → approval
//     → deferred write, rejection, expiry
//   - learning loop: corrections → hypothesis → promoted rule → context-
//     scoped application
// A throwaway org is created and cascade-deleted around the suite.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, prismaUnscoped } from "@/lib/db";
import { executeProposal, rejectProposal, writeRecord } from "@/lib/platform/recordWriter";
import { OrgCtx } from "@/lib/platform/types";
import {
  applyRules,
  promoteHypothesisToRule,
  runHypothesisEngine,
} from "./learning";

let ctx: OrgCtx;
const actor = { type: "human" as const, name: "test-suite" };

// The "refuses writes against another org's records" test spins up a second
// "test-lifecycle-foreign" org and deletes it inline on success; clean both
// slugs around the suite so a mid-test failure can't leave an orphan that
// trips the unique-slug constraint on the next run.
const SLUGS = ["test-lifecycle", "test-lifecycle-foreign"];

beforeAll(async () => {
  await prismaUnscoped.platOrganisation.deleteMany({ where: { slug: { in: SLUGS } } });
  const org = await prisma.platOrganisation.create({
    data: { slug: "test-lifecycle", name: "Lifecycle Test Org" },
  });
  ctx = {
    orgId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    vertical: "construction",
    defaultEngagementType: "long_project",
    allowedEngagementTypes: ["long_project"],
    aiAuthority: "approve_required",
    config: { assistant: { name: "T", persona: "t" }, features: {} },
  };
});

afterAll(async () => {
  await prismaUnscoped.platOrganisation.deleteMany({ where: { slug: { in: SLUGS } } });
});

describe("org isolation guard", () => {
  it("throws on unscoped fan-out queries before hitting the DB", async () => {
    await expect(prisma.platActionHub.findMany({})).rejects.toThrow(/Unscoped platform query/);
    await expect(prisma.platConBudgetLine.count({})).rejects.toThrow(/Unscoped platform query/);
    await expect(
      prisma.platCorrection.updateMany({ where: { id: { in: [1] } }, data: { rootCause: "x" } }),
    ).rejects.toThrow(/Unscoped platform query/);
  });

  it("throws on creates without orgId", async () => {
    await expect(
      // @ts-expect-error — deliberately missing orgId
      prisma.platActionHub.create({ data: { title: "no org" } }),
    ).rejects.toThrow(/must set orgId/);
  });

  it("allows scoped queries and PlatOrganisation lookups", async () => {
    await expect(prisma.platActionHub.count({ where: { orgId: ctx.orgId } })).resolves.toBe(0);
    await expect(
      prisma.platOrganisation.findFirst({ where: { slug: "test-lifecycle" } }),
    ).resolves.toBeTruthy();
  });
});

describe("recordWriter lifecycle", () => {
  let actionId: number;

  it("executes a direct write and appends an audit row", async () => {
    const result = await writeRecord(ctx, {
      table: "action",
      op: "create",
      data: { title: "Direct action" },
      actor,
    });
    expect(result.status).toBe("executed");
    actionId = result.recordId as number;
    const log = await prisma.platExecutionLog.findFirst({
      where: { orgId: ctx.orgId, id: result.execLogId! },
    });
    expect(log?.status).toBe("executed");
    expect(log?.targetTable).toBe("plat_core_actionhub");
  });

  it("refuses writes against another org's records", async () => {
    const foreign = await prisma.platOrganisation.create({
      data: { slug: "test-lifecycle-foreign", name: "Foreign" },
    });
    const foreignCtx = { ...ctx, orgId: foreign.id, orgSlug: foreign.slug };
    await expect(
      writeRecord(foreignCtx, {
        table: "action",
        op: "update",
        recordId: actionId,
        data: { status: "done" },
        actor,
      }),
    ).rejects.toThrow(/not found in this organisation/);
    await prismaUnscoped.platOrganisation.delete({ where: { id: foreign.id } });
  });

  it("defers a proposal, then approval performs the write and audits it", async () => {
    const proposed = await writeRecord(ctx, {
      table: "action",
      op: "update",
      recordId: actionId,
      data: { status: "done" },
      actor: { type: "ai", name: "TestBot" },
      requireApproval: true,
    });
    expect(proposed.status).toBe("proposed");

    // Not yet applied.
    let action = await prisma.platActionHub.findFirst({
      where: { id: actionId, orgId: ctx.orgId },
    });
    expect(action?.status).toBe("open");

    const executed = await executeProposal(ctx, proposed.proposalId!, "Approver");
    expect(executed.status).toBe("executed");
    action = await prisma.platActionHub.findFirst({ where: { id: actionId, orgId: ctx.orgId } });
    expect(action?.status).toBe("done");

    const pending = await prisma.platPendingWrite.findFirst({
      where: { id: Number(proposed.proposalId), orgId: ctx.orgId },
    });
    expect(pending?.status).toBe("executed");
    expect(pending?.resolvedBy).toBe("Approver");
    const audit = await prisma.platExecutionLog.findFirst({
      where: { orgId: ctx.orgId, id: pending!.execLogId! },
    });
    expect(audit?.approvedBy).toBe("Approver");
  });

  it("rejection never performs the write", async () => {
    const proposed = await writeRecord(ctx, {
      table: "action",
      op: "update",
      recordId: actionId,
      data: { status: "deferred" },
      actor: { type: "ai", name: "TestBot" },
      requireApproval: true,
    });
    await rejectProposal(ctx, proposed.proposalId!, "Approver", "not needed");
    const action = await prisma.platActionHub.findFirst({
      where: { id: actionId, orgId: ctx.orgId },
    });
    expect(action?.status).toBe("done"); // unchanged
    await expect(executeProposal(ctx, proposed.proposalId!, "Approver")).rejects.toThrow(
      /not found/,
    );
  });

  it("expired proposals refuse to execute", async () => {
    const proposed = await writeRecord(ctx, {
      table: "action",
      op: "update",
      recordId: actionId,
      data: { status: "open" },
      actor: { type: "ai", name: "TestBot" },
      requireApproval: true,
    });
    await prisma.platPendingWrite.updateMany({
      where: { id: Number(proposed.proposalId), orgId: ctx.orgId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(executeProposal(ctx, proposed.proposalId!, "Approver")).rejects.toThrow(
      /expired/,
    );
    const action = await prisma.platActionHub.findFirst({
      where: { id: actionId, orgId: ctx.orgId },
    });
    expect(action?.status).toBe("done"); // still unchanged
  });

  it("re-validates at approval time and fails closed on an invalid payload", async () => {
    // A stored proposal whose payload no longer satisfies the schema (here an
    // empty title) must never be written — executeProposal re-validates, throws,
    // and parks the row in "failed" rather than silently applying bad data.
    const bad = await prisma.platPendingWrite.create({
      data: {
        orgId: ctx.orgId,
        tableKey: "action",
        op: "create",
        payload: JSON.stringify({ title: "" }), // violates title.min(1)
        actorType: "ai",
        actorName: "TestBot",
        status: "proposed",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await expect(executeProposal(ctx, bad.id, "Approver")).rejects.toThrow();
    const pending = await prisma.platPendingWrite.findFirst({
      where: { id: bad.id, orgId: ctx.orgId },
    });
    expect(pending?.status).toBe("failed");
    expect(pending?.error).toBeTruthy();
  });
});

describe("learning loop", () => {
  it("clusters corrections, promotes a rule, applies it context-scoped", async () => {
    for (const [ai, human] of [
      [1000, 1150],
      [2000, 2260],
      [4000, 4500],
    ]) {
      await prisma.platCorrection.create({
        data: {
          orgId: ctx.orgId,
          dimension: "budget.test",
          aiValue: ai,
          humanValue: human,
          variancePct: Math.round(((human - ai) / ai) * 1000) / 10,
          rootCause: "test cause",
          context: JSON.stringify({ suburb: "Testville" }),
        },
      });
    }
    const engine = await runHypothesisEngine(ctx);
    expect(engine.created).toBe(1);

    const hypothesis = await prisma.platHypothesis.findFirst({
      where: { orgId: ctx.orgId, dimension: "budget.test", status: "pending" },
    });
    expect(hypothesis).toBeTruthy();
    expect(hypothesis!.sampleCount).toBe(3);

    const ruleId = await promoteHypothesisToRule(ctx, hypothesis!.id, "adjustment");
    expect(ruleId).toBeTruthy();

    const matched = await applyRules(ctx, { suburb: "Testville" });
    expect(matched.some((r) => r.adjustment?.dimension === "budget.test")).toBe(true);
    const unmatched = await applyRules(ctx, { suburb: "Elsewhere" });
    expect(unmatched.some((r) => r.adjustment?.dimension === "budget.test")).toBe(false);
  });
});
