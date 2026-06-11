// Dev helper: wipe the Plat* demo orgs (cascade deletes all platform rows)
// so prisma/seed.mjs can reseed them from scratch. Never used in production.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const r = await prisma.platOrganisation.deleteMany({});
console.log(`Deleted ${r.count} platform organisations (cascade).`);
await prisma.$disconnect();
