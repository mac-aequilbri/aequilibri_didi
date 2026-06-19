// Airtable migration — public surface of the data-access layer.
//
// Status: SKELETON. Reads are functional; writes are gated behind
// AIRTABLE_MIGRATION=true. The Postgres/Prisma path is untouched — this layer
// activates only when wired in deliberately. See docs/airtable-migration-mapping.md.

export {
  DEMO_BASE_ID,
  MASTER_TEMPLATE_BASE_ID,
  airtableEnabled,
  resolveBaseId,
} from "./config";
export { AirtableError } from "./client";
export type { AirtableRecord, ListOptions, Codec, FieldDef } from "./types";
export * as decisions from "./tables/decisions";
