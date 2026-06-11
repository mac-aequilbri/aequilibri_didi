// Org-scoped path helpers — never hardcode /app/<slug> in actions or pages.

export function orgPath(orgSlug: string, path = ""): string {
  return `/app/${orgSlug}${path}`;
}
