// ONE-TIME cutover helper, run from package.json "postinstall".
//
// The UC2/UC3 rebuild removed the uc2_*/uc3_* models from the schema, so on
// the next deploy `prisma db push` wants to drop those tables and aborts with
// a data-loss warning unless given --accept-data-loss. The Render service's
// dashboard build command is not synced from render.yaml, so the flag there
// may never apply. This script removes the problem instead: on Render only,
// it drops the orphaned demo tables BEFORE `prisma db push` runs, leaving the
// push nothing destructive to do.
//
// Guards:
//  - exits 0 immediately unless RENDER=true (set by Render) and DATABASE_URL
//    is Postgres — it can never run on a developer machine
//  - only touches tables named uc2_* / uc3_* (UC1 is uc1_roofing_*; the
//    platform tables are plat_*) — all demo data
//  - fail-safe: any error is logged and swallowed; worst case the build fails
//    at `prisma db push` exactly as it does today
//
// REMOVE this script and its postinstall entry (plus the --accept-data-loss
// flag in render.yaml) after the first successful cutover deploy.

import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
if (process.env.RENDER !== "true" || !/^postgres/.test(url)) {
  process.exit(0);
}

const sql = `
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND (tablename LIKE 'uc2\\_%' OR tablename LIKE 'uc3\\_%')
  LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    RAISE NOTICE 'dropped %', r.tablename;
  END LOOP;
END $$;
`;

try {
  const result = spawnSync("npx", ["prisma", "db", "execute", "--url", url, "--stdin"], {
    input: sql,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status === 0) {
    console.log("[cutover-cleanup] dropped legacy uc2_*/uc3_* tables (if any).");
  } else {
    console.log(
      `[cutover-cleanup] prisma db execute exited ${result.status}: ${result.error?.message ?? ""} ${result.stderr ?? ""}`,
    );
  }
} catch (err) {
  console.log(`[cutover-cleanup] skipped (${err?.message ?? err})`);
}
process.exit(0);
