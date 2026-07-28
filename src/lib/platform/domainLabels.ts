// Governance Phase 4 — the DOMAIN_LABELS read layer (§4). One record per Core
// field per Domain renders vertical-specific field labels, so onboarding a new
// vertical means adding records, never a column. Read once per org and cached
// (TTL); tolerant of the table being absent or unpopulated — every miss falls
// back to the hardcoded label, so an empty DOMAIN_LABELS (its state until D8
// population) changes nothing.

import { airtableEnabled, core } from "@/lib/airtable";
import { airtableMapFor } from "@/lib/airtable/fieldMaps";
import type { CoreTableName } from "@/lib/airtable/schema.generated";
import { TtlCache } from "@/lib/airtable/ttlCache";
import type { RecordEditorConfig } from "./recordEditor";
import type { OrgCtx } from "./types";

export interface DomainLabel {
  label: string;
  contextNote: string;
}

const cache = new TtlCache<Map<string, DomainLabel>>(10 * 60_000);

const S = (v: unknown): string => (typeof v === "string" ? v : "");

/** Active labels for the org's vertical, keyed `${Core_Table}.${Core_Field_Label}`.
 *  Domain matching is prefix/case tolerant ("Construction" ↔ "construction");
 *  "General" rows apply to every vertical, specific rows win. */
export async function getDomainLabels(ctx: OrgCtx): Promise<Map<string, DomainLabel>> {
  if (!airtableEnabled(ctx)) return new Map();
  return cache.get(ctx.orgSlug, async () => {
    try {
      const rows = await core.list(ctx.orgSlug, "DOMAIN_LABELS", { maxRecords: 1000 });
      const vertical = ctx.vertical.toLowerCase();
      const out = new Map<string, DomainLabel>();
      for (const general of [true, false]) {
        // two passes: General first, then vertical-specific overrides
        for (const r of rows) {
          if (r["Active"] === false) continue;
          const domain = S(r["Domain"]).toLowerCase();
          const isGeneral = domain === "general" || domain === "";
          const matches = isGeneral ? general : !general && (vertical.startsWith(domain) || domain.startsWith(vertical));
          const label = S(r["Domain_Label"]).trim();
          const key = `${S(r["Core_Table"])}.${S(r["Core_Field_Label"])}`;
          if (matches && label && key !== ".") {
            out.set(key, { label, contextNote: S(r["Context_Note"]).trim() });
          }
        }
      }
      return out;
    } catch {
      return new Map(); // table absent (older base) — hardcoded labels apply
    }
  });
}

/** Overlay domain labels onto a RecordEditorConfig: each field's app key is
 *  translated to its Airtable Core field via the write field map, and a
 *  matching DOMAIN_LABELS row replaces the label (Context_Note becomes help
 *  text when the field has none). Returns the config unchanged when there are
 *  no labels — the common case until D8 populates the table. */
export async function localizeEditorConfig(
  ctx: OrgCtx,
  config: RecordEditorConfig,
): Promise<RecordEditorConfig> {
  return applyDomainLabels(config, await getDomainLabels(ctx));
}

/** Pure overlay half of localizeEditorConfig (unit-testable). */
export function applyDomainLabels(
  config: RecordEditorConfig,
  labels: ReadonlyMap<string, DomainLabel>,
): RecordEditorConfig {
  if (!labels.size) return config;
  const map = airtableMapFor(config.table);
  if (!map) return config;
  const airName = (appKey: string): string | undefined =>
    map.specs.find((s) => s.from === appKey)?.air;
  return {
    ...config,
    fields: config.fields.map((f) => {
      const air = airName(f.name);
      const hit = air ? labels.get(`${map.table}.${air}`) : undefined;
      if (!hit) return f;
      return { ...f, label: hit.label, help: f.help ?? (hit.contextNote || undefined) };
    }),
  };
}

/** Domain label for one app-key field of a writable table ("budgetAmount" on
 *  "budget_line" → "Cost Line" when a BUDGET.Estimated row exists). Returns
 *  undefined when no override applies — callers keep their hardcoded label. */
export function labelForAppField(
  labels: ReadonlyMap<string, DomainLabel>,
  tableKey: string,
  appKey: string,
): string | undefined {
  if (!labels.size) return undefined;
  const map = airtableMapFor(tableKey);
  const air = map?.specs.find((s) => s.from === appKey)?.air;
  return air ? labels.get(`${map!.table}.${air}`)?.label : undefined;
}

/** Domain label for a whole table, by convention a DOMAIN_LABELS row with
 *  Core_Field_Label "_TABLE" (e.g. "ISSUES._TABLE" → "Matter tasks"). Falls
 *  back to undefined — callers keep friendlyTableLabel. */
export function tableLabelFor(
  labels: ReadonlyMap<string, DomainLabel>,
  tableKey: string,
): string | undefined {
  if (!labels.size) return undefined;
  const air = airtableMapFor(tableKey)?.table;
  return air ? labels.get(`${air}._TABLE`)?.label : undefined;
}

/** Assistant-prompt vocabulary block (Spec 12 Module 7: confirmation cards and
 *  assistant language use the org's domain terminology). "" when the org has
 *  no labels — the common case until D8 population. Capped to keep the prompt
 *  bounded. */
export async function domainVocabBlock(ctx: OrgCtx): Promise<string> {
  const labels = await getDomainLabels(ctx);
  if (!labels.size) return "";
  const lines = [...labels.entries()]
    .slice(0, 30)
    .map(([key, l]) => `${key.replace("._TABLE", " (table)")} is called "${l.label}"${l.contextNote ? ` — ${l.contextNote}` : ""}`);
  return `DOMAIN TERMINOLOGY (use these names with the user):\n- ${lines.join("\n- ")}`;
}

/** Invalidate after DOMAIN_LABELS writes (onboarding, admin edits). */
export function invalidateDomainLabels(orgSlug: string): void {
  cache.delete(orgSlug);
}

// Referenced for type-safety documentation: DOMAIN_LABELS is a provisioned
// Core table (schema.generated), addressed here via core.list's typed name.
const _assertTable: CoreTableName = "DOMAIN_LABELS";
void _assertTable;
