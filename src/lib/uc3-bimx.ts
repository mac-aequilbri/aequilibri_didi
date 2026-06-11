// BIMx integration — security boundary + provider seam for UC3.
//
// v1 scope: validate and normalize the BIMx Web Viewer embed URL that a user
// pastes after uploading a hyper-model to the BIMx Model Transfer site
// (https://bimx.graphisoft.com). Only graphisoft.com hosts over HTTPS are
// allowed to be framed — this blocks arbitrary iframe injection / XSS via an
// attacker-controlled `src`.
//
// FUTURE (designed, not built): this module is the reserved home for the BIMx
// API data-source client that ingests element / quantity data into the
// Assessment Engine's Data Ingestion sub-component. The `provider` field on
// Uc3BimModel is the seam — additional providers (e.g. "ifc") would add their
// own validators here.

/** Allowed embed hosts. Exact match on `graphisoft.com` or any subdomain. */
const ALLOWED_HOST_SUFFIX = "graphisoft.com";

/**
 * True only if `url` is an HTTPS URL whose host is graphisoft.com or a
 * subdomain of it (e.g. bimx.graphisoft.com). Everything else is rejected.
 */
export function isAllowedBimxEmbedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  return host === ALLOWED_HOST_SUFFIX || host.endsWith("." + ALLOWED_HOST_SUFFIX);
}

/**
 * Normalize raw user input into a clean, allow-listed embed URL.
 *
 * Accepts either a bare URL or a full `<iframe ... src="...">` embed snippet
 * (which is what the BIMx Model Transfer site's "Embed Hyper-model" dialog
 * hands the user). Returns the validated URL, or `null` if it is missing,
 * malformed, or points at a non-graphisoft host.
 */
export function normalizeBimxEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let candidate = raw.trim();
  if (!candidate) return null;

  // If the user pasted an <iframe> snippet, pull out the src attribute.
  if (candidate.toLowerCase().includes("<iframe")) {
    const match = candidate.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!match) return null;
    candidate = match[1].trim();
  }

  return isAllowedBimxEmbedUrl(candidate) ? candidate : null;
}
