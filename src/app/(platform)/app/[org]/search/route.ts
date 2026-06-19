// Org-scoped global search backing the ⌘K palette. Every query is filtered by
// orgId (the tenancy guard enforces this), so search can never cross tenants.
// Returns a small, typed, grouped result set the client renders directly.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOrgCtx } from "@/lib/platform/org-context";
import { orgPath } from "@/lib/platform/paths";

export const dynamic = "force-dynamic";

interface Hit {
  type: string;
  label: string;
  sublabel?: string;
  href: string;
}

const PER_TYPE = 5;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ org: string }> },
) {
  const { org } = await params;
  const ctx = await requireOrgCtx(org); // also gates membership when auth is on
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const p = (path: string) => orgPath(ctx.orgSlug, path);
  const where = { orgId: ctx.orgId };
  const take = PER_TYPE;

  const [jobs, actions, risks, decisions, variations, documents, vendors, quotes] =
    await Promise.all([
      prisma.platJob.findMany({
        where: { ...where, OR: [{ name: { contains: q } }, { code: { contains: q } }] },
        take,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.platActionHub.findMany({
        where: { ...where, title: { contains: q } },
        take,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.platConRisk.findMany({
        where: { ...where, description: { contains: q } },
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.platDecision.findMany({
        where: { ...where, description: { contains: q } },
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.platConVariationOrder.findMany({
        where: { ...where, OR: [{ title: { contains: q } }, { refNumber: { contains: q } }] },
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.platDocument.findMany({
        where: { ...where, title: { contains: q } },
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.platConVendor.findMany({
        where: { ...where, name: { contains: q } },
        take,
        orderBy: { name: "asc" },
      }),
      prisma.platConQuote.findMany({
        where: { ...where, OR: [{ title: { contains: q } }, { refNumber: { contains: q } }] },
        take,
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const results: Hit[] = [
    ...jobs.map((j) => ({ type: "Project", label: j.name, sublabel: j.code, href: p(`/projects/${j.id}`) })),
    ...actions.map((a) => ({ type: "Action", label: a.title, sublabel: a.status, href: p("/actions") })),
    ...risks.map((r) => ({ type: "Risk", label: r.description, sublabel: r.status, href: p("/risks") })),
    ...decisions.map((d) => ({ type: "Decision", label: d.description, sublabel: d.status, href: p("/decisions") })),
    ...variations.map((v) => ({ type: "Variation", label: v.title, sublabel: v.refNumber || v.status, href: p(`/variations/${v.id}`) })),
    ...documents.map((d) => ({ type: "Document", label: d.title, sublabel: d.docType, href: p(`/documents/${d.id}`) })),
    ...vendors.map((v) => ({ type: "Vendor", label: v.name, sublabel: v.category, href: p("/vendors") })),
    ...quotes.map((q2) => ({ type: "Quote", label: q2.title, sublabel: q2.refNumber || q2.status, href: p(`/quotes/${q2.id}`) })),
  ];

  return NextResponse.json({ results });
}
