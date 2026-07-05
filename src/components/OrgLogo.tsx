// Shared client/customer branding mark. Renders the uploaded logo (a data URL
// stored in settings.branding.logo) wherever the org name is shown. When no
// logo is set it renders either nothing, or — with `fallback` — an initials
// badge, so name+mark pairings stay visually consistent across the app.
//
// No hooks / server-only imports: safe to use from both Server and Client
// Components (sidebar, breadcrumbs, page headers, print pages, org picker).

/** Up to two initials from a name, for the fallback badge. */
export function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function OrgLogo({
  name = "",
  logo,
  size = 28,
  fallback = false,
  className = "",
}: {
  name?: string;
  logo?: string | null;
  /** Square edge length in px. */
  size?: number;
  /** Show an initials badge when there's no logo. */
  fallback?: boolean;
  className?: string;
}) {
  const box = { width: size, height: size };
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" style={box} className={`shrink-0 rounded-lg object-contain ${className}`} />
    );
  }
  if (!fallback) return null;
  return (
    <span
      aria-hidden
      style={{ ...box, fontSize: Math.round(size * 0.4) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-ae-space font-bold text-white ${className}`}
    >
      {orgInitials(name)}
    </span>
  );
}
