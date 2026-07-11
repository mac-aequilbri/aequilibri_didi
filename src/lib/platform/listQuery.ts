// Shared list-filtering convention for the platform's list windows.
//
// Three layers, one contract:
//  1. Filter state lives in the URL (?status=open,in_progress&due_from=2026-07-01&q=roof)
//     so server components read it straight from searchParams — links are
//     shareable and the back button works. Enum params are comma-joined
//     multi-values; ranges use <name>_from / <name>_to; q is free text.
//  2. Each window declares a ListViewConfig describing its filterable fields —
//     the read-side twin of RecordEditorConfig: declare once, shared machinery
//     (parse + FilterBar + compilers) does the rest.
//  3. One parsed ListQuery compiles to whichever backend the window's source is
//     on: toPredicate() for the Airtable path (applied AFTER the TTL-cached
//     core.list read, so toggling filters never adds Airtable API calls) and
//     toPrismaWhere() for the Postgres path.
//
// This module is pure (no server-only imports) so the FilterBar client
// component can share the types and URL serialisation.

export interface EnumOption<Row> {
  value: string;
  /** Display label; defaults to value. */
  label?: string;
  /** Virtual option: rows match by predicate instead of field equality (e.g.
   *  the Action Hub's "unmapped" pseudo-status). Has no Postgres meaning —
   *  toPrismaWhere drops it. */
  match?: (row: Row) => boolean;
}

interface FieldBase {
  /** URL param name; also the default row property and Postgres column. */
  name: string;
  label: string;
  /** Postgres column when it differs from name; null = not filterable on the
   *  Postgres path (the constraint is silently skipped there). */
  prismaField?: string | null;
}

export interface EnumField<Row> extends FieldBase {
  kind: "enum";
  options: EnumOption<Row>[];
  /** Row accessor for the predicate path; defaults to row[name]. Return null
   *  for rows that should match no real option. */
  getValue?: (row: Row) => string | null | undefined;
}

export interface DateRangeField<Row> extends FieldBase {
  kind: "daterange";
  getValue?: (row: Row) => Date | null | undefined;
}

export type FilterField<Row> = EnumField<Row> | DateRangeField<Row>;

export interface ListViewConfig<Row> {
  fields: FilterField<Row>[];
  /** Row accessors the free-text q param searches on the predicate path. */
  search?: Array<(row: Row) => string | null | undefined>;
  /** Postgres columns q searches with `contains` on the Prisma path. */
  prismaSearch?: string[];
}

/** A validated, backend-agnostic filter state parsed from the URL. */
export interface ListQuery {
  q: string;
  /** enum field name → selected option values. */
  enums: Record<string, string[]>;
  /** range field name → ISO date bounds (inclusive). */
  ranges: Record<string, { from?: string; to?: string }>;
}

/** Per enum field, per option value → row count. Feeds the FilterBar facets. */
export type FacetCounts = Record<string, Record<string, number>>;

type SearchParams = Record<string, string | string[] | undefined>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/** Parse searchParams into a ListQuery, validated against the config: unknown
 *  params, unknown enum values, and malformed dates all degrade to "no filter"
 *  rather than erroring. */
export function parseListQuery<Row>(sp: SearchParams, config: ListViewConfig<Row>): ListQuery {
  const enums: Record<string, string[]> = {};
  const ranges: Record<string, { from?: string; to?: string }> = {};
  for (const f of config.fields) {
    if (f.kind === "enum") {
      const raw = first(sp[f.name]);
      if (!raw) continue;
      const allowed = new Set(f.options.map((o) => o.value));
      const values = raw
        .split(",")
        .map((s) => s.trim())
        .filter((v) => allowed.has(v));
      if (values.length > 0) enums[f.name] = values;
    } else {
      const from = first(sp[`${f.name}_from`]);
      const to = first(sp[`${f.name}_to`]);
      const r: { from?: string; to?: string } = {};
      if (DATE_RE.test(from)) r.from = from;
      if (DATE_RE.test(to)) r.to = to;
      if (r.from || r.to) ranges[f.name] = r;
    }
  }
  return { q: first(sp.q).trim(), enums, ranges };
}

export function hasActiveFilters(query: ListQuery): boolean {
  return (
    query.q !== "" || Object.keys(query.enums).length > 0 || Object.keys(query.ranges).length > 0
  );
}

/** Serialise a ListQuery back to a query string ("" when nothing is active). */
export function buildQueryString(query: ListQuery): string {
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  for (const [name, values] of Object.entries(query.enums)) {
    if (values.length > 0) p.set(name, values.join(","));
  }
  for (const [name, r] of Object.entries(query.ranges)) {
    if (r.from) p.set(`${name}_from`, r.from);
    if (r.to) p.set(`${name}_to`, r.to);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function enumGetter<Row>(f: EnumField<Row>): (row: Row) => string | null | undefined {
  return f.getValue ?? ((row) => (row as Record<string, unknown>)[f.name] as string | null);
}

function dateGetter<Row>(f: DateRangeField<Row>): (row: Row) => Date | null | undefined {
  return f.getValue ?? ((row) => (row as Record<string, unknown>)[f.name] as Date | null);
}

/** Compile a ListQuery to a row predicate — the Airtable execution path.
 *  Within a field selected values OR together; across fields (and q) they AND. */
export function toPredicate<Row>(query: ListQuery, config: ListViewConfig<Row>): (row: Row) => boolean {
  const checks: Array<(row: Row) => boolean> = [];

  const q = query.q.toLowerCase();
  if (q && config.search?.length) {
    const accessors = config.search;
    checks.push((row) => accessors.some((get) => (get(row) ?? "").toLowerCase().includes(q)));
  }

  for (const f of config.fields) {
    if (f.kind === "enum") {
      const selected = query.enums[f.name];
      if (!selected?.length) continue;
      const byValue = new Map(f.options.map((o) => [o.value, o]));
      const real = new Set(selected.filter((v) => !byValue.get(v)?.match));
      const virtual = selected
        .map((v) => byValue.get(v)?.match)
        .filter((m): m is (row: Row) => boolean => m !== undefined);
      const get = enumGetter(f);
      checks.push((row) => {
        const v = get(row);
        return (v != null && real.has(v)) || virtual.some((m) => m(row));
      });
    } else {
      const r = query.ranges[f.name];
      if (!r) continue;
      const from = r.from ? new Date(r.from).getTime() : null;
      const to = r.to ? new Date(r.to).getTime() + DAY_MS : null; // inclusive of the "to" day
      const get = dateGetter(f);
      checks.push((row) => {
        const d = get(row);
        if (!d) return false;
        const t = d.getTime();
        return (from === null || t >= from) && (to === null || t < to);
      });
    }
  }

  return (row) => checks.every((c) => c(row));
}

/** Compile a ListQuery to a Prisma where fragment — the Postgres execution
 *  path. Spread it into the source's where alongside the tenancy clause. */
export function toPrismaWhere<Row>(
  query: ListQuery,
  config: ListViewConfig<Row>,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (query.q && config.prismaSearch?.length) {
    where.OR = config.prismaSearch.map((col) => ({ [col]: { contains: query.q } }));
  }
  for (const f of config.fields) {
    if (f.prismaField === null) continue;
    const col = f.prismaField ?? f.name;
    if (f.kind === "enum") {
      const selected = query.enums[f.name];
      if (!selected?.length) continue;
      // Virtual options don't exist in Postgres: a purely-virtual selection
      // compiles to `in: []` (no rows), which is the honest answer there.
      const byValue = new Map(f.options.map((o) => [o.value, o]));
      where[col] = { in: selected.filter((v) => !byValue.get(v)?.match) };
    } else {
      const r = query.ranges[f.name];
      if (!r) continue;
      const range: Record<string, Date> = {};
      if (r.from) range.gte = new Date(r.from);
      if (r.to) range.lt = new Date(new Date(r.to).getTime() + DAY_MS);
      where[col] = range;
    }
  }
  return where;
}

// ── Client projection ─────────────────────────────────────────────────
// ListViewConfig carries functions, so it can't cross the server→client
// boundary. toClientConfig strips it down to the serialisable shape the
// FilterBar needs.

export interface ClientEnumOption {
  value: string;
  label: string;
}

export interface ClientFilterField {
  kind: "enum" | "daterange";
  name: string;
  label: string;
  options?: ClientEnumOption[];
}

export interface ClientListConfig {
  hasSearch: boolean;
  fields: ClientFilterField[];
}

export function toClientConfig<Row>(config: ListViewConfig<Row>): ClientListConfig {
  return {
    hasSearch: Boolean(config.search?.length || config.prismaSearch?.length),
    fields: config.fields.map((f) =>
      f.kind === "enum"
        ? {
            kind: f.kind,
            name: f.name,
            label: f.label,
            options: f.options.map((o) => ({ value: o.value, label: o.label ?? o.value })),
          }
        : { kind: f.kind, name: f.name, label: f.label },
    ),
  };
}

/** Count rows per enum option over the UNFILTERED list, so the FilterBar can
 *  show facet counts. Cheap: one pass over rows already in memory. */
export function countEnumOptions<Row>(rows: Row[], config: ListViewConfig<Row>): FacetCounts {
  const counts: FacetCounts = {};
  for (const f of config.fields) {
    if (f.kind !== "enum") continue;
    const get = enumGetter(f);
    const per: Record<string, number> = {};
    for (const o of f.options) per[o.value] = 0;
    for (const row of rows) {
      const v = get(row);
      for (const o of f.options) {
        if (o.match ? o.match(row) : v === o.value) per[o.value] += 1;
      }
    }
    counts[f.name] = per;
  }
  return counts;
}
