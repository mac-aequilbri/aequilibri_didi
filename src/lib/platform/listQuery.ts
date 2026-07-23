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

export interface SortFieldDef<Row> {
  /** URL token; also the default row property. */
  name: string;
  label: string;
  getValue?: (row: Row) => string | number | Date | null | undefined;
}

/** A categorical group-by dimension (?group=name). Independent of `fields` and
 *  the rendered columns — you can group by a field the table neither filters
 *  nor shows, as long as getValue can read it off the row. getValue must map
 *  each row to a SINGLE bucket key (unlike the multi-match filter predicates). */
export interface GroupFieldDef<Row> {
  /** URL token. */
  name: string;
  label: string;
  /** The bucket key for a row; null/undefined/"" all fall into the empty bucket. */
  getValue: (row: Row) => string | null | undefined;
  /** Known buckets: drives display order (declaration order) and labels.
   *  Keys not listed here sort after these, alphabetically. */
  options?: Array<{ value: string; label?: string }>;
  /** Label for the null/blank bucket. Defaults to "— none —". */
  emptyLabel?: string;
}

export interface ListViewConfig<Row> {
  fields: FilterField<Row>[];
  /** Row accessors the free-text q param searches on the predicate path. */
  search?: Array<(row: Row) => string | null | undefined>;
  /** Postgres columns q searches with `contains` on the Prisma path. */
  prismaSearch?: string[];
  /** Sortable fields (?sort=name:asc). Omit for source-order lists. */
  sort?: SortFieldDef<Row>[];
  /** Group-by dimensions (?group=name). Omit for windows that don't group. */
  groups?: GroupFieldDef<Row>[];
  /** Rows per page (?page=N). Omit to render everything. */
  pageSize?: number;
}

/** Rows-per-page choices offered by the FilterBar's selector (?ps=N). */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** A validated, backend-agnostic filter state parsed from the URL. */
export interface ListQuery {
  q: string;
  /** enum field name → selected option values. */
  enums: Record<string, string[]>;
  /** range field name → ISO date bounds (inclusive). */
  ranges: Record<string, { from?: string; to?: string }>;
  /** Active sort, validated against config.sort. */
  sort: { field: string; dir: "asc" | "desc" } | null;
  /** Active group-by dimension, validated against config.groups. */
  group: string | null;
  /** 1-based page; meaningful only when config.pageSize is set. */
  page: number;
  /** User-chosen rows per page (?ps=N); null = config.pageSize default. */
  pageSize: number | null;
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

  let sort: ListQuery["sort"] = null;
  const sortRaw = first(sp.sort);
  if (sortRaw && config.sort?.length) {
    const [field, dir] = sortRaw.split(":");
    if (config.sort.some((s) => s.name === field) && (dir === "asc" || dir === "desc")) {
      sort = { field, dir };
    }
  }

  let group: string | null = null;
  const groupRaw = first(sp.group);
  if (groupRaw && config.groups?.some((g) => g.name === groupRaw)) group = groupRaw;

  const pageRaw = Number(first(sp.page));
  const page = Number.isInteger(pageRaw) && pageRaw > 1 ? pageRaw : 1;

  const psRaw = Number(first(sp.ps));
  const pageSize = config.pageSize && PAGE_SIZE_OPTIONS.includes(psRaw) ? psRaw : null;

  return { q: first(sp.q).trim(), enums, ranges, sort, group, page, pageSize };
}

/** Whether any row-narrowing filter is active (sort/page don't count). */
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
  if (query.sort) p.set("sort", `${query.sort.field}:${query.sort.dir}`);
  if (query.group) p.set("group", query.group);
  if (query.page > 1) p.set("page", String(query.page));
  if (query.pageSize) p.set("ps", String(query.pageSize));
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
  /** Sortable fields for the Sort pill (name + label only). */
  sort?: Array<{ name: string; label: string }>;
  /** Group-by dimensions for the Group pill (name + label only). */
  groups?: Array<{ name: string; label: string }>;
  /** Default rows per page; presence enables the FilterBar's Rows selector. */
  pageSize?: number;
}

export function toClientConfig<Row>(config: ListViewConfig<Row>): ClientListConfig {
  return {
    hasSearch: Boolean(config.search?.length || config.prismaSearch?.length),
    sort: config.sort?.map((s) => ({ name: s.name, label: s.label })),
    groups: config.groups?.map((g) => ({ name: g.name, label: g.label })),
    pageSize: config.pageSize,
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

/** Normalise a group getValue result to a bucket key ("" = the empty bucket). */
function groupKeyOf<Row>(def: GroupFieldDef<Row>, row: Row): string {
  const v = def.getValue(row);
  return v == null ? "" : String(v);
}

/** Comparator ordering rows by their group bucket: declared options first (in
 *  declaration order), then unlisted keys alphabetically, then the empty bucket
 *  last. Direction-independent — the group order never flips with the sort dir. */
function groupComparator<Row>(def: GroupFieldDef<Row>): (a: Row, b: Row) => number {
  const order = new Map((def.options ?? []).map((o, i) => [o.value, i] as const));
  const rank = (key: string): [number, number | string] => {
    if (key === "") return [2, ""]; // empty bucket always last
    const idx = order.get(key);
    if (idx !== undefined) return [0, idx]; // declared option: by declaration order
    return [1, key]; // known-but-unlisted key: alphabetical
  };
  return (a, b) => {
    const [ta, ka] = rank(groupKeyOf(def, a));
    const [tb, kb] = rank(groupKeyOf(def, b));
    if (ta !== tb) return ta - tb;
    if (typeof ka === "number" && typeof kb === "number") return ka - kb;
    return String(ka).localeCompare(String(kb));
  };
}

/** Sort + paginate an already-filtered list per the query. When a group is
 *  active it becomes the primary ordering key and the sort (if any) orders rows
 *  within each group. Windows that filter in their source (Actions) call this
 *  in the page; applyListQuery calls it for everyone else. Page is clamped so a
 *  stale ?page= never strands the user on an empty slice. */
export function sortAndPaginate<Row>(
  rows: Row[],
  query: ListQuery,
  config: ListViewConfig<Row>,
): { items: Row[]; page: number; pageCount: number } {
  let items = rows;

  const groupDef = query.group ? config.groups?.find((g) => g.name === query.group) : undefined;
  const sortDef = query.sort ? config.sort?.find((s) => s.name === query.sort?.field) : undefined;

  if (groupDef || sortDef) {
    const byGroup = groupDef ? groupComparator(groupDef) : null;
    const get = sortDef
      ? (sortDef.getValue ??
        ((row: Row) => (row as Record<string, unknown>)[sortDef.name] as string | number | Date | null))
      : null;
    const flip = query.sort?.dir === "desc" ? -1 : 1;
    items = [...items].sort((a, b) => {
      if (byGroup) {
        const g = byGroup(a, b);
        if (g !== 0) return g;
      }
      if (!get) return 0;
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // empty values always last, either direction
      if (vb == null) return -1;
      const na = va instanceof Date ? va.getTime() : va;
      const nb = vb instanceof Date ? vb.getTime() : vb;
      if (typeof na === "number" && typeof nb === "number") return (na - nb) * flip;
      return String(na).localeCompare(String(nb)) * flip;
    });
  }

  const size = query.pageSize ?? config.pageSize;
  if (!size) return { items, page: 1, pageCount: 1 };
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), page, pageCount };
}

export interface GroupSection<Row> {
  /** Bucket key ("" for the empty bucket). */
  key: string;
  /** Display label for the section header. */
  label: string;
  count: number;
  rows: Row[];
}

/** Segment an already-sorted, already-paginated slice into contiguous group
 *  sections for rendering. Call only when query.group is set; rows must already
 *  be group-ordered (sortAndPaginate does that). A bucket split across a page
 *  boundary yields a section on each page — the header simply repeats atop the
 *  next page, which is the intended behaviour. With no active/valid group it
 *  returns a single unlabelled section holding every row (or none when empty). */
export function splitIntoGroups<Row>(
  items: Row[],
  query: ListQuery,
  config: ListViewConfig<Row>,
): GroupSection<Row>[] {
  const def = query.group ? config.groups?.find((g) => g.name === query.group) : undefined;
  if (!def) {
    return items.length ? [{ key: "", label: "", count: items.length, rows: items }] : [];
  }
  const labelFor = (key: string) =>
    key === ""
      ? (def.emptyLabel ?? "— none —")
      : (def.options?.find((o) => o.value === key)?.label ?? key);
  const sections: GroupSection<Row>[] = [];
  let current: GroupSection<Row> | null = null;
  for (const row of items) {
    const key = groupKeyOf(def, row);
    if (!current || current.key !== key) {
      current = { key, label: labelFor(key), count: 0, rows: [] };
      sections.push(current);
    }
    current.rows.push(row);
    current.count += 1;
  }
  return sections;
}

/** One-call page helper for windows whose source already returns the full
 *  view-model list: filter + sort + paginate + total + facets, ready to spread
 *  into FilterBar props. `matching` is the filtered count before pagination —
 *  feed that to FilterBar's `shown`. (Windows needing backend-side filtering,
 *  like Actions on Postgres, use toPredicate/toPrismaWhere in their source.) */
export function applyListQuery<Row>(
  rows: Row[],
  query: ListQuery,
  config: ListViewConfig<Row>,
): {
  items: Row[];
  total: number;
  matching: number;
  page: number;
  pageCount: number;
  facets: FacetCounts;
} {
  const filteredRows = hasActiveFilters(query) ? rows.filter(toPredicate(query, config)) : rows;
  const { items, page, pageCount } = sortAndPaginate(filteredRows, query, config);
  return {
    items,
    total: rows.length,
    matching: filteredRows.length,
    page,
    pageCount,
    facets: countEnumOptions(rows, config),
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
