import { normalizeTeamRole } from "./module1Governance";

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
      showFinancialDetail: false,
      showCashflowChart: false,
      canGenerateReports: true,
      audienceLabel: "Delivery view (scope/schedule-focused)",
    };
  }
  return {
    role,
    showFinancialDetail: false,
    showCashflowChart: false,
    canGenerateReports: false,
    audienceLabel: "Portfolio view (cross-project summary)",
  };
}

export function reportModeFor(key: string): ReportMode {
  if (key === "coordination_dashboard") return "live";
  return "snapshot";
}
