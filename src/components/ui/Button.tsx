// Button primitives — thin wrappers over the design-system button classes
// (globals.css) so pages stop hand-rolling `rounded border px-2 py-1 …`
// variants. Four variants, two sizes:
//   primary  → .btn-ae             (the screen's main action)
//   outline  → .btn-ae-outline     (secondary actions — the default)
//   ghost    → .btn-ae-ghost       (tertiary/low-emphasis, table rows)
//   danger   → .btn-ae-danger-outline (destructive; pair with ConfirmSubmitButton)
// For pending-state submits keep using SubmitButton/ConfirmSubmitButton — they
// compose with these classes via their `className` prop.

import type { ComponentProps } from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-ae",
  outline: "btn-ae-outline",
  ghost: "btn-ae-ghost",
  danger: "btn-ae-danger-outline",
};

/** Compose the design-system class string for a button-shaped element.
 *  Useful when a component (SubmitButton, Link) takes `className` directly. */
export function buttonClass(
  variant: ButtonVariant = "outline",
  size: ButtonSize = "md",
  extra = "",
): string {
  return [VARIANT_CLASS[variant], size === "sm" ? "text-xs" : "", extra]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}

export function LinkButton({
  variant = "outline",
  size = "md",
  className = "",
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
