import { normalizeTeamRole } from "./module1Governance";
import { financeVisible } from "./roles";

export type ReportingRole = "owner" | "builder" | "architect" | "broker";
export type ReportMode = "live" | "snapshot";

export interface ReportingCapabilities {
  role: ReportingRole;
  showFinancialDetail: boolean;
  showCashflowChart: boolean;
  canGenerateReports: boolean;
  audienceLabel: string;
}

export function reportingRole(role: string): ReportingRole {
  return normalizeTeamRole(role);
}

export function reportingCapabilities(roleRaw: string): ReportingCapabilities {
  const role = reportingRole(roleRaw);
  // CLS (governance §3): finance surfaces open to Owner and to the Finance
  // Manager / Auditor sub-roles ("builder+finance", "broker+auditor").
  const finance = financeVisible(roleRaw);
  if (role === "owner") {
    return {
      role,
      showFinancialDetail: true,
      showCashflowChart: true,
      canGenerateReports: true,
      audienceLabel: "Owner view (full financial detail)",
    };
  }
  if (role === "builder" || role === "architect") {
    return {
      role,
      showFinancialDetail: finance,
      showCashflowChart: finance,
      canGenerateReports: true,
      audienceLabel: finance
        ? "Finance view (full financial detail)"
        : "Delivery view (scope/schedule-focused)",
    };
  }
  return {
    role,
    showFinancialDetail: finance,
    showCashflowChart: finance,
    canGenerateReports: false,
    audienceLabel: finance
      ? "Auditor view (read-only, full financial detail)"
      : "Portfolio view (cross-project summary)",
  };
}

export function reportModeFor(key: string): ReportMode {
  if (key === "coordination_dashboard") return "live";
  return "snapshot";
}
