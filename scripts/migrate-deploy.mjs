// Self-healing `prisma migrate deploy` for the Render build. Handles the
// states left behind by the pre-migrations era (schema managed by `db push`):
//
//   P3005  DB has tables but no _prisma_migrations  → mark baseline applied
//   P3018  migration CREATEs something that already exists (db push created
//          it before migrations were introduced)     → mark THAT migration
//          applied (the end state is identical)
//   P3009  a previously failed migration is recorded → roll its record back
//          and retry (if its objects already exist, the P3018 path then
//          resolves it as applied)
//
// Any other failure exits non-zero and fails the build — only the known
// "database is already in the desired state" cases are auto-resolved.

import { spawnSync } from "node:child_process";

const BASELINE = "20260612000000_baseline";
const MAX_ATTEMPTS = 6;

function prisma(args) {
  const r = spawnSync("npx", ["prisma", ...args], {
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
  });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  return { status: r.status, out };
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const deploy = prisma(["migrate", "deploy"]);
  if (deploy.status === 0) process.exit(0);

  if (deploy.out.includes("P3005")) {
    console.log(`[migrate-deploy] unbaselined database — marking ${BASELINE} as applied`);
    prisma(["migrate", "resolve", "--applied", BASELINE]);
    continue;
  }

  const name = /Migration name: (\S+)/.exec(deploy.out)?.[1];
  if (deploy.out.includes("P3018") && /already exists/i.test(deploy.out) && name) {
    console.log(`[migrate-deploy] ${name} targets objects that already exist — marking applied`);
    prisma(["migrate", "resolve", "--applied", name]);
    continue;
  }

  const failed = /`(\S+)` migration.*failed|migration started at .* failed/i.test(deploy.out);
  const failedName = /(\d{14}\w+)/.exec(deploy.out)?.[1];
  if (deploy.out.includes("P3009") && (failed || failedName) && failedName) {
    console.log(`[migrate-deploy] failed migration ${failedName} recorded — rolling back its record and retrying`);
    prisma(["migrate", "resolve", "--rolled-back", failedName]);
    continue;
  }

  console.error(`[migrate-deploy] unrecoverable migration failure (attempt ${attempt})`);
  process.exit(deploy.status ?? 1);
}

console.error("[migrate-deploy] did not converge — manual intervention needed");
process.exit(1);
