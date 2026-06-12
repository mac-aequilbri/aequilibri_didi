// Auth activation switch — shared by proxy (edge), layout, and org-context,
// so it must stay free of Prisma/node-only imports.
//
// Clerk activates when both keys are present (same pattern as
// ANTHROPIC_API_KEY: configured → real, absent → open demo mode). The
// platform was built demo-open; setting the two env vars turns on real
// multi-tenant authentication with no code change.

export function clerkEnabled(): boolean {
  return !!(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}
