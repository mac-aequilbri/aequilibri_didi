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
  if (!airtableEnabled()) return new Map();
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

/** Invalidate after DOMAIN_LABELS writes (onboarding, admin edits). */
export function invalidateDomainLabels(orgSlug: string): void {
  cache.delete(orgSlug);
}

// Referenced for type-safety documentation: DOMAIN_LABELS is a provisioned
// Core table (schema.generated), addressed here via core.list's typed name.
const _assertTable: CoreTableName = "DOMAIN_LABELS";
void _assertTable;
