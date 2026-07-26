// Auth activation switches — shared by proxy (edge), layout, and org-context,
// so this module must stay free of Prisma/node-only imports.
//
// Clerk activates when BOTH keys are present (a single key set is treated as
// misconfiguration, not demo mode). Without Clerk the platform fails CLOSED
// in production: /app/* returns 503 unless ALLOW_DEMO_MODE=true is set
// explicitly. Open demo mode is therefore always a deliberate decision,
// never the result of a missing or mistyped env var.

export function clerkEnabled(): boolean {
  return !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

/** Exactly one Clerk key set — almost certainly a deployment mistake. */
export function clerkMisconfigured(): boolean {
  return (
    !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== !!process.env.CLERK_SECRET_KEY
  );
}

/** May the platform run unauthenticated? In local dev/test: yes. Anywhere
 *  else — including a deployment whose NODE_ENV is unset or mistyped — only
 *  with the explicit ALLOW_DEMO_MODE=true opt-in, and never when Clerk is
 *  half-configured. (Keying on === "development" rather than !== "production"
 *  means a misconfigured production box fails closed, not open.) */
export function demoModeAllowed(): boolean {
  if (clerkMisconfigured()) return false;
  const env = process.env.NODE_ENV;
  if (env === "development" || env === "test") return true;
  return process.env.ALLOW_DEMO_MODE === "true";
}

/** Platform operators allowed to provision new customer organisations when
 *  auth is active (comma-separated emails). In demo mode provisioning is
 *  open by definition of the demo. */
export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
