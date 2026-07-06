// Agent registry — the single lookup table of module-agents. Adding a new
// module-agent is one entry here; the loop and orchestrator resolve agents
// through getAgent() / SPECIALISTS. Registry order follows the value chain
// (onboard → ingest → assess → document → run → learn → report).

import { assessmentAgent } from "./assessment";
import { documentAgent } from "./document";
import { ingestionAgent } from "./ingestion";
import { learningLoopAgent } from "./learningLoop";
import { onboardingAgent } from "./onboarding";
import { projectIntelligenceAgent } from "./projectIntelligence";
import { reportingAgent } from "./reporting";
import type { AgentDefinition, AgentKey } from "./types";

export const AGENTS: Record<AgentKey, AgentDefinition> = {
  onboarding: onboardingAgent,
  ingestion: ingestionAgent,
  assessment: assessmentAgent,
  document: documentAgent,
  project_intelligence: projectIntelligenceAgent,
  learning_loop: learningLoopAgent,
  reporting: reportingAgent,
};

/** Specialists the orchestrator can route to, in registry order. */
export const SPECIALISTS: AgentDefinition[] = Object.values(AGENTS);

export function getAgent(key: AgentKey): AgentDefinition {
  return AGENTS[key];
}
