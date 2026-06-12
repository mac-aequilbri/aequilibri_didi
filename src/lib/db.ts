import { PrismaClient } from "@prisma/client";

// Prisma client singleton — avoids exhausting connections during Next.js HMR.
//
// Tenant-isolation guard: every fan-out query (findMany/findFirst/count/
// aggregate/groupBy/updateMany/deleteMany) and every create against an
// org-scoped Plat* model MUST carry an orgId constraint, or the client throws
// before the query executes. This turns multi-tenant isolation from a
// per-call-site convention into a mechanism: a forgotten `where: { orgId }`
// is a loud error in dev, CI and prod — never a silent cross-tenant leak.
//
// Unique-key operations (findUnique/update/delete by id) are exempt because
// the platform pattern verifies ownership first (see recordWriter's
// findFirst({ id, orgId }) guard). PlatOrganisation itself is the tenancy
// root and is exempt. The rare legitimate cross-org lookup (portal token
// resolution, seeds, ops scripts) must use `prismaUnscoped` explicitly.

const ORG_SCOPED = /^Plat(?!Organisation$)/;
const FANOUT_OPS = new Set([
  "findMany",
  "findFirst",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
]);

/* eslint-disable @typescript-eslint/no-explicit-any */
function hasOrgConstraint(where: any): boolean {
  if (!where || typeof where !== "object") return false;
  if (where.orgId !== undefined) return true;
  if (Array.isArray(where.AND)) return where.AND.some(hasOrgConstraint);
  return false;
}

function makeClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  const guarded = base.$extends({
    name: "org-isolation-guard",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (ORG_SCOPED.test(model)) {
            const a = (args ?? {}) as any;
            if (FANOUT_OPS.has(operation) && !hasOrgConstraint(a.where)) {
              throw new Error(
                `Unscoped platform query: ${model}.${operation} must filter by orgId (use prismaUnscoped for deliberate cross-org access).`,
              );
            }
            if (operation === "create" && a.data && a.data.orgId === undefined) {
              throw new Error(`Unscoped platform write: ${model}.create must set orgId.`);
            }
            if (operation === "createMany") {
              const rows = Array.isArray(a.data) ? a.data : [a.data];
              if (rows.some((r: any) => r && r.orgId === undefined)) {
                throw new Error(`Unscoped platform write: ${model}.createMany rows must set orgId.`);
              }
            }
          }
          return query(args);
        },
      },
    },
  });
  return { base, guarded };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type Clients = ReturnType<typeof makeClient>;
const globalForPrisma = globalThis as unknown as { prismaClients?: Clients };

const clients = globalForPrisma.prismaClients ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prismaClients = clients;

/** Org-isolation-guarded client — the default for all platform code. */
export const prisma = clients.guarded;

/** Raw client for deliberate cross-org access only (portal token resolution,
 *  seeds, ops scripts). Every use is a reviewed exception. */
export const prismaUnscoped = clients.base;
