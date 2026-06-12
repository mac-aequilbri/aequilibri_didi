// Organisation picker — entry point of the platform routes. Tenancy is
// carried in the URL from here on (/app/[org]/...), not in a cookie.
// With Clerk active, only organisations the signed-in user belongs to are
// listed; demo mode shows everything.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAuthEmail } from "@/lib/platform/org-context";

export const dynamic = "force-dynamic";

export default async function OrgPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;
  const email = await getAuthEmail();

  const orgs = await prisma.platOrganisation.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { jobs: true } },
      cfgTeam: { where: { isActive: true }, select: { email: true } },
    },
  });
  const visible =
    email === null
      ? orgs
      : orgs.filter((o) => o.cfgTeam.some((m) => m.email.toLowerCase() === email));

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2">Choose an organisation</h1>
          <p className="text-neutral-600 mb-10">
            Each organisation is an isolated customer instance on the shared platform core.
          </p>
        </div>
        <Link href="/app/new" className="btn-ae">
          + Onboard new customer
        </Link>
      </div>
      {denied && (
        <p className="mb-6 text-sm text-red-600">
          You are not a member of that organisation. Ask its admin to add your email to the team.
        </p>
      )}
      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {email === null ? (
            <>
              No organisations found — run <code>node prisma/seed.mjs</code> to load the demo data.
            </>
          ) : (
            <>No organisations are linked to {email} yet — onboard one above, or ask an admin to add you.</>
          )}
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {visible.map((org) => (
            <Link
              key={org.id}
              href={`/app/${org.slug}`}
              className="ae-card p-6 block hover:shadow-md transition-shadow"
            >
              <h2 className="text-lg font-semibold mb-1">{org.name}</h2>
              <p className="text-sm text-neutral-600 capitalize">
                {org.vertical} · {org.defaultEngagementType.replace("_", " ")} ·{" "}
                {org._count.jobs} job{org._count.jobs === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
