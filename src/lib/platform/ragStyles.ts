// Shared RAG (Red/Amber/Green) styling — one source of truth for the risk
// register, phase boards and plan views, which previously each carried their
// own near-duplicate Tailwind maps. Classes use the semantic design tokens
// exposed via @theme (globals.css), not the stock palette.

const RAG_CLASS: Record<string, string> = {
  red: "bg-ae-danger-bg text-ae-danger",
  amber: "bg-ae-warning-bg text-ae-warning",
  green: "bg-ae-success-bg text-ae-success",
};

const RAG_BORDER_CLASS: Record<string, string> = {
  red: "border border-ae-danger/30",
  amber: "border border-ae-warning/30",
  green: "border border-ae-success/30",
};

const NEUTRAL = "bg-ae-muted-bg text-ae-muted-strong";

/** Tailwind classes for a RAG value (case-insensitive). Unknown → neutral. */
export function ragClass(rag: string | null | undefined, opts?: { border?: boolean }): string {
  const key = (rag ?? "").trim().toLowerCase();
  const base = RAG_CLASS[key] ?? NEUTRAL;
  if (!opts?.border) return base;
  return `${base} ${RAG_BORDER_CLASS[key] ?? "border border-ae-muted/30"}`;
}
