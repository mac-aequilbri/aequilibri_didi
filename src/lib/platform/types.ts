// Platform core — shared types for the three-tier architecture.
// Choice fields are string-literal unions (the DB stores varchar, not enums),
// matching the convention used across the Uc* schemas.

export type EngagementType = "short_job" | "long_project" | "ongoing" | "seasonal";

/** How much write authority the org grants the AI assistant. */
export type AiAuthority = "propose_only" | "approve_required" | "auto_low_risk";

export type ActorType = "ai" | "human" | "system";

export type ExecStatus = "proposed" | "approved" | "executed" | "rejected" | "failed";

/** Parsed PlatOrganisation.settings. */
export interface OrgConfig {
  assistant: { name: string; persona: string };
  features: Record<string, boolean>;
}

/** Request context every platform service takes as its first argument. */
export interface OrgCtx {
  orgId: number;
  orgSlug: string;
  orgName: string;
  vertical: string;
  defaultEngagementType: EngagementType;
  allowedEngagementTypes: EngagementType[];
  aiAuthority: AiAuthority;
  config: OrgConfig;
}

export interface Actor {
  type: ActorType;
  name: string;
  /** Chat message that produced this write, for provenance. */
  sourceMessageId?: number;
}

/** Feature flags that gate nav items and screens; org settings override these. */
export const DEFAULT_FEATURES: Record<string, boolean> = {
  risks: true,
  variations: true,
  reports: true,
  meeting_minutes: true,
  documents: true,
  portal: true,
  accounting: false,
  bim: true,
  delay_cascade: false,
  procurement: false,
  room_matrix: false,
  project_plan: false,
  vendors: true,
  learning_rules: true,
};
