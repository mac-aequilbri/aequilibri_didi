export const MODULE1_CORE_SCHEMA_VERSION = "2026.06-core-m1";
export const MODULE1_PROJECT_DELIVERY_VERSION = "2026.06-project-delivery-m1";

export const MODULE1_REQUIRED_CORE_TABLES = [
  "CORRECTIONS",
  "JOBS",
  "ORGANISATIONS",
  "INTELLIGENCE_SNAPSHOT",
] as const;

export const PROJECT_DELIVERY_DOMAIN_TABLES = [
  "ACTION_HUB",
  "CHANGE_LOG",
  "PROCUREMENT",
  "CASHFLOW",
  "BUDGET",
  "ROOM_MATRIX",
  "VENDORS",
  "PROJECT_PHASES",
  "PROJECT_PLAN",
  "REF_CATEGORIES",
  "REF_ZONES",
  "REF_BUDGET",
] as const;

export const PROJECT_DELIVERY_CUSTOMER_CONFIG_VALUES = [
  "vendor records",
  "budget values",
  "zone names",
  "team members",
  "pricing overrides",
] as const;

export const ONBOARDING_LOAD_SEQUENCE = [
  "project phases",
  "room/zone matrix",
  "vendor list",
  "reference data",
  "opening budget",
  "ongoing operational data",
] as const;

export type TeamRole = "owner" | "builder" | "architect" | "broker";
type LegacyRole = "admin" | "editor" | "readonly";

const LEGACY_ROLE_MAP: Record<LegacyRole, TeamRole> = {
  admin: "owner",
  editor: "builder",
  readonly: "broker",
};

export function normalizeTeamRole(role: string): TeamRole {
  const r = role.trim().toLowerCase();
  if (r === "owner" || r === "builder" || r === "architect" || r === "broker") return r;
  if (r === "admin" || r === "editor" || r === "readonly") return LEGACY_ROLE_MAP[r];
  return "broker";
}

export function isWriteRole(role: string): boolean {
  const r = normalizeTeamRole(role);
  return r === "owner" || r === "builder" || r === "architect";
}

export function isAdminRole(role: string): boolean {
  return normalizeTeamRole(role) === "owner";
}

/** Lower score means higher priority in demo-mode fallbacks. */
export function rolePriority(role: string): number {
  const r = normalizeTeamRole(role);
  if (r === "owner") return 0;
  if (r === "builder") return 1;
  if (r === "architect") return 2;
  return 3;
}

export interface Module1Governance {
  schema: {
    coreVersion: string;
    projectDeliveryVersion: string;
    migrationStatus: "planned" | "in_progress" | "validated";
    lastValidatedAt: string;
  };
  onboarding: {
    loadSequence: readonly string[];
    requiredCoreTables: readonly string[];
  };
  domainModel: {
    projectDeliveryTables: readonly string[];
    customerConfigValues: readonly string[];
  };
}

export function defaultModule1Governance(): Module1Governance {
  return {
    schema: {
      coreVersion: MODULE1_CORE_SCHEMA_VERSION,
      projectDeliveryVersion: MODULE1_PROJECT_DELIVERY_VERSION,
      migrationStatus: "planned",
      lastValidatedAt: "",
    },
    onboarding: {
      loadSequence: ONBOARDING_LOAD_SEQUENCE,
      requiredCoreTables: MODULE1_REQUIRED_CORE_TABLES,
    },
    domainModel: {
      projectDeliveryTables: PROJECT_DELIVERY_DOMAIN_TABLES,
      customerConfigValues: PROJECT_DELIVERY_CUSTOMER_CONFIG_VALUES,
    },
  };
}
