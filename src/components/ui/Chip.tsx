// Chip — small inline tag for row-level annotations: AI origin, categories,
// issue types, RAG health. One component instead of scattered
// `bg-violet-100 text-violet-700`-style literals; colors come from the
// semantic tokens (globals.css .ae-chip-*).
//
// Not for record statuses — those stay on StatusBadge (PageHeader.tsx), which
// owns the status→tone vocabulary.

import type { ReactNode } from "react";

export type ChipVariant = "ai" | "info" | "success" | "warning" | "danger" | "neutral";

export function Chip({
  variant = "neutral",
  children,
  className = "",
  title,
}: {
  variant?: ChipVariant;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={`ae-chip ae-chip-${variant} ${className}`.trim()} title={title}>
      {children}
    </span>
  );
}

/** The one way to mark AI-origin records/rows across the app. */
export function AiChip({ className = "" }: { className?: string }) {
  return (
    <Chip variant="ai" className={className} title="Drafted by AI">
      AI
    </Chip>
  );
}
