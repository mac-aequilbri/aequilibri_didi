// Organisation picker — entry point of the platform routes. Tenancy is
// carried in the URL from here on (/app/[org]/...), not in a cookie.

import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OrgPickerPage() {
  const orgs = await prisma.platOrganisation.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { jobs: true } } },
  });

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Choose an organisation</h1>
      <p className="text-neutral-600 mb-10">
        Each organisation is an isolated customer instance on the shared platform core.
      </p>
      {orgs.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No organisations found — run <code>node prisma/seed.mjs</code> to load the demo data.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {orgs.map((org) => (
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
