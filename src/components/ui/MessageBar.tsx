// MessageBar — the one banner style for inline feedback (success flashes,
// error notices, info hints). Replaces the per-page emerald/amber/red banner
// triplets; colors come from the semantic tokens (globals.css .ae-msg-*).
// ARIA role is derived from the variant: danger/warning announce as alerts.

import type { ReactNode } from "react";

export type MessageVariant = "info" | "success" | "warning" | "danger";

export function MessageBar({
  variant = "info",
  children,
  className = "",
}: {
  variant?: MessageVariant;
  children: ReactNode;
  className?: string;
}) {
  const role = variant === "danger" || variant === "warning" ? "alert" : "status";
  return (
    <div role={role} className={`ae-msg ae-msg-${variant} ${className}`.trim()}>
      {children}
    </div>
  );
}
