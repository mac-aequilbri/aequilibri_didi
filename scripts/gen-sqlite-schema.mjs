// Derive prisma/schema.dev.prisma (SQLite, for local dev against the existing
// Django db.sqlite3) from the canonical prisma/schema.prisma (Postgres).
// SQLite doesn't support PG native types or the Json scalar, so we strip
// `@db.*` attributes and map `Json` → `String`. Run via `npm run db:dev:gen`.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "prisma", "schema.prisma");
const out = join(here, "..", "prisma", "schema.dev.prisma");

let schema = readFileSync(src, "utf8");

// 1. Swap the datasource block to SQLite + DEV_DATABASE_URL.
schema = schema.replace(
  /datasource db \{[\s\S]*?\}/,
  `datasource db {\n  provider = "sqlite"\n  url      = env("DEV_DATABASE_URL")\n}`,
);

// 2. Remove all PostgreSQL native-type attributes (@db.VarChar(200), @db.Decimal(10,2), ...).
schema = schema.replace(/\s+@db\.[A-Za-z]+(\([^)]*\))?/g, "");

// 3. SQLite has no Json scalar — store as String (the app JSON-encodes anyway).
schema = schema.replace(/(\n\s+\w+\s+)Json(\s)/g, "$1String$2");

// 4. Django-written Decimal columns trip Prisma's SQLite Decimal reader
//    ("Conversion failed: input contains invalid characters"). Use Float in
//    dev — the app coerces via toNum() so values are identical. Match the
//    scalar type token only (optional `?`), preserving trailing attributes.
schema = schema.replace(/(\n\s+\w+\s+)Decimal(\??\s)/g, "$1Float$2");

schema =
  "// AUTO-GENERATED from schema.prisma by scripts/gen-sqlite-schema.mjs — do not edit.\n" +
  "// Local-dev SQLite variant pointed at the existing Django db.sqlite3.\n\n" +
  schema;

writeFileSync(out, schema);
console.log(`Wrote ${out}`);
