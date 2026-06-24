export type PriorityBand = "CRITICAL" | "URGENT" | "HIGH" | "MED" | "LOW";

const PRIORITY_WEIGHT: Record<PriorityBand, number> = {
  CRITICAL: 5,
  URGENT: 4,
  HIGH: 3,
  MED: 2,
  LOW: 1,
};

export function priorityBandForRiskScore(score: number): PriorityBand {
  if (score >= 20) return "CRITICAL";
  if (score >= 15) return "URGENT";
  if (score >= 10) return "HIGH";
  if (score >= 6) return "MED";
  return "LOW";
}

export function priorityBandForActionDueDate(
  dueDate: Date | null,
  now = new Date(),
): PriorityBand {
  if (!dueDate) return "LOW";
  const days = Math.floor((dueDate.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "CRITICAL";
  if (days <= 2) return "URGENT";
  if (days <= 7) return "HIGH";
  if (days <= 14) return "MED";
  return "LOW";
}

export function strongerBand(a: PriorityBand, b: PriorityBand): PriorityBand {
  return PRIORITY_WEIGHT[a] >= PRIORITY_WEIGHT[b] ? a : b;
}

export function comparePriority(a: PriorityBand, b: PriorityBand): number {
  return PRIORITY_WEIGHT[b] - PRIORITY_WEIGHT[a];
}
