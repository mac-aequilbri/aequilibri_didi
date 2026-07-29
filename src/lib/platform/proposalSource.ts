// Where a proposal came from, for the reviewer.
//
// A proposal raised from inbound correspondence was written by nobody: an
// extraction pass chose the table, and a resolution ladder chose the project.
// Both of those decisions are inferences, so the approvals card has to show
// them — which project, on what basis, and the sentence that justified it.
//
// It rides in the proposal payload under `__source`, the same convention as
// `__rationale`/`__recId`: reviewer-facing metadata that executeProposal strips
// before the write, so no table needs a column for it.

import type { ResolutionStrategy } from "./jobResolver";

export interface ProposalProvenance {
  /** The project the message was attached to, as resolved. */
  jobName?: string;
  strategy: ResolutionStrategy;
  /** 0-1, from the resolution ladder — not the extraction's own confidence. */
  confidence: number;
  /** True when no project could be identified and this was parked in General. */
  unassigned: boolean;
  /** Subject line of the message it came from. */
  subject?: string;
  channel?: string;
}

export interface ProposalSource extends ProposalProvenance {
  /** The sentence in the source message that justified this record. */
  evidence: string;
}

/** How the project was chosen, in words a reviewer can act on. */
export function strategyLabel(strategy: ResolutionStrategy): string {
  switch (strategy) {
    case "explicit":
      return "project supplied with the message";
    case "name":
      return "project named in the message";
    case "sender":
      return "inferred from the sender";
    case "single_job":
      return "the only project in this workspace";
    case "general":
      return "no project identified — parked in General";
    case "none":
      return "no project identified";
  }
}

/** Read the provenance out of a stored proposal payload, or null when the
 *  proposal did not come from an ingested message. Never throws. */
export function proposalSourceOf(payload: string): ProposalSource | null {
  let raw: unknown;
  try {
    raw = (JSON.parse(payload) as { __source?: unknown }).__source;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const strategy = str(o.strategy);
  return {
    jobName: str(o.jobName) || undefined,
    strategy: (strategy || "none") as ResolutionStrategy,
    confidence: typeof o.confidence === "number" ? o.confidence : 0,
    unassigned: o.unassigned === true,
    subject: str(o.subject) || undefined,
    channel: str(o.channel) || undefined,
    evidence: str(o.evidence),
  };
}
