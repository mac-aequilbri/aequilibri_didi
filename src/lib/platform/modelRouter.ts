// Model router — the one place model selection lives (Platform Architecture
// doc: Haiku for classification/routing, Sonnet default, Opus gated for
// complex analysis). Override per task type via PLATFORM_MODEL_<TASK> env vars.

export type AiTask =
  | "classification"
  | "extraction"
  | "chat"
  | "drafting"
  | "vision"
  | "complex_reasoning";

const MODEL_BY_TASK: Record<AiTask, string> = {
  classification: "claude-haiku-4-5",
  extraction: "claude-sonnet-4-6",
  chat: "claude-sonnet-4-6",
  drafting: "claude-sonnet-4-6",
  vision: "claude-sonnet-4-6",
  complex_reasoning: "claude-opus-4-7", // matches the Opus tier already used in src/lib/claude.ts
};

export function modelFor(task: AiTask): string {
  const override = process.env[`PLATFORM_MODEL_${task.toUpperCase()}`];
  return override || MODEL_BY_TASK[task];
}
