// UC3 type aliases

export type ProjectStatus = "planning" | "active" | "on_hold" | "complete";
export type PhaseStatus = "planning" | "active" | "on_hold" | "complete";
export type ActionStatus = "open" | "in_progress" | "complete" | "overdue" | "cancelled";
export type Priority = "low" | "medium" | "high" | "critical";
export type RiskStatus = "open" | "mitigated" | "closed" | "accepted";
export type VoStatus = "draft" | "pending_approval" | "approved" | "rejected" | "withdrawn";
export type MmStatus = "raw" | "processed" | "confirmed";
export type Provider = "xero" | "myob" | "qbo";
export type AccountingStatus = "disconnected" | "connected" | "error";
export type AiAuthority = "full_write" | "approval_required" | "blocked";
export type ReportStatus = "draft" | "approved" | "sent";
export type DecisionStatus = "open" | "decided" | "deferred";

// Helpers

export function riskLevel(likelihood: number, impact: number): "HIGH" | "MEDIUM" | "LOW" {
  const score = likelihood * impact;
  if (score >= 15) return "HIGH";
  if (score >= 8) return "MEDIUM";
  return "LOW";
}

export function healthLabel(score: number): "Healthy" | "At Risk" | "Critical" {
  if (score >= 80) return "Healthy";
  if (score >= 60) return "At Risk";
  return "Critical";
}
