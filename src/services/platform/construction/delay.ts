// Delay cascade analysis — given a trigger event and delay days, model the
// knock-on impact across the job's remaining phases. Output is advisory
// (logged, not persisted as entities).

import { callClaude } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { modelFor } from "@/lib/platform/modelRouter";
import { getPrompt } from "@/lib/platform/prompts";
import { OrgCtx } from "@/lib/platform/types";

export interface CascadeResult {
  impacts: { phase: string; delayDays: number; reason: string }[];
  totalDelayDays: number;
  mitigations: string[];
  demoMode: boolean;
}

export async function analyzeDelayCascade(
  ctx: OrgCtx,
  userName: string,
  jobId: number,
  trigger: string,
  delayDays: number,
): Promise<CascadeResult> {
  const phases = await prisma.platConPhase.findMany({
    where: { orgId: ctx.orgId, jobId, isAiDraft: false },
    orderBy: { sortOrder: "asc" },
    select: { name: true, status: true, completionPct: true },
  });

  const { system, version } = getPrompt("delay.cascade");
  const res = await callClaude(
    system,
    `Trigger: ${trigger}\nInitial delay: ${delayDays} days\nPhases (in order): ${JSON.stringify(phases)}`,
    { model: modelFor("complex_reasoning"), maxTokens: 1200 },
  );

  let result: CascadeResult;
  if (res.demo_mode) {
    const remaining = phases.filter((p) => p.status !== "complete");
    result = {
      impacts: remaining.map((p, i) => ({
        phase: p.name,
        delayDays: Math.max(1, delayDays - i),
        reason: "Demo mode — simulated sequential slip.",
      })),
      totalDelayDays: delayDays + Math.max(0, remaining.length - 1),
      mitigations: ["Demo mode — connect an API key for real analysis."],
      demoMode: true,
    };
  } else {
    try {
      const parsed = JSON.parse(res.content.replace(/^```(json)?|```$/g, "").trim());
      result = {
        impacts: Array.isArray(parsed.impacts)
          ? parsed.impacts.map((i: { phase?: unknown; delayDays?: unknown; reason?: unknown }) => ({
              phase: String(i.phase ?? ""),
              delayDays: Number(i.delayDays) || 0,
              reason: String(i.reason ?? ""),
            }))
          : [],
        totalDelayDays: Number(parsed.totalDelayDays) || delayDays,
        mitigations: Array.isArray(parsed.mitigations) ? parsed.mitigations.map(String) : [],
        demoMode: false,
      };
    } catch {
      result = {
        impacts: [],
        totalDelayDays: delayDays,
        mitigations: [`AI output could not be parsed: ${res.content.slice(0, 300)}`],
        demoMode: false,
      };
    }
  }

  await prisma.platExecutionLog
    .create({
      data: {
        orgId: ctx.orgId,
        jobId,
        actorType: "ai",
        actorName: "Delay Analyst",
        operation: "generate",
        targetTable: "delay_cascade",
        payload: JSON.stringify({ trigger, delayDays, by: userName }),
        result: JSON.stringify(result).slice(0, 4000),
        status: "executed",
        executedAt: new Date(),
        promptVersion: version,
      },
    })
    .catch(() => {});

  return result;
}
