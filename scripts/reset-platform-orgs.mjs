// Dev helper: wipe the Plat* demo orgs (cascade deletes all platform rows)
// so prisma/seed.mjs can reseed them from scratch. Never used in production —
// and guarded so it CANNOT be: it deletes every org and every dependent row
// in whatever database DATABASE_URL points at.
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run: NODE_ENV=production.");
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  const target = (process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@");
  console.error(
    `This deletes ALL platform organisations (cascade) in: ${target || "<DATABASE_URL unset>"}\n` +
      "Re-run with --yes to confirm.",
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const r = await prisma.platOrganisation.deleteMany({});
console.log(`Deleted ${r.count} platform organisations (cascade).`);
await prisma.$disconnect();
