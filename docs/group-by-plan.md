# Group-by for list windows — implementation plan

Adds a categorical **group-by** to the shared list-window machinery
(`src/lib/platform/listQuery.ts` + `src/components/FilterBar.tsx`), as a peer of
the existing sort feature. State lives in the URL (`?group=<field>`).

## 1. Design (settled)

- **One URL param, `?group=<field>`**, a peer of `?sort=` — shareable,
  back-button-safe, composes with `q`/enums/ranges/sort/page.
- **Categorical only** for v1 (one field → one bucket per row). Date-bucketing
  (by month/week) deferred.
- **Composition:** the group key becomes the *primary* sort; the user's
  `?sort=` is the secondary sort within each group. Pagination stays
  **row-based**; group headers render at boundaries within a page (a group
  spanning a page break re-shows its header on the next page). No new
  pagination math.
- **Decoupled from columns/filters:** grouping candidates live in their own
  config list, so you can group by a field the table doesn't render and isn't
  filterable.
- **Zero extra Airtable reads:** grouping is a pure post-`core.list` operation,
  same guarantee as filtering today.

## 2. Config shape (`listQuery.ts`)

```ts
export interface GroupFieldDef<Row> {
  name: string;                                        // URL token
  label: string;
  getValue: (row: Row) => string | null | undefined;  // single bucket key
  options?: Array<{ value: string; label?: string }>; // order + labels; else alpha
  emptyLabel?: string;                                 // null/blank bucket; default "— none —"
}
// added to ListViewConfig:
groups?: GroupFieldDef<Row>[];
```

## 3. Core module changes (`listQuery.ts`)

- `ListQuery` gains `group: string | null`; `parseListQuery` validates it
  against `config.groups`; `buildQueryString` serializes it.
- Group key prepended as the primary comparator in `sortAndPaginate`.
- New exported `splitIntoGroups(items, query, config)` →
  `Array<{ key, label, count, rows }>` segmenting the already-paginated slice.
- `toClientConfig` / `ClientListConfig` carry `groups: [{name,label}]`.

## 4. FilterBar (`FilterBar.tsx`)

- A **"Group" pill** cloned from the Sort pill (field list + "No grouping"),
  reusing `.filter-pill` CSS — no new styles. `setGroup()` respects the `latest`
  ref and resets to page 1.

## 5. Rendering (per-window)

- Shared `<GroupHeaderRow colSpan>` (tables) / `<GroupHeading>` (cards) showing
  label + count.
- When `query.group` is set, the page iterates `splitIntoGroups(...)` and emits
  a header per section instead of `items.map(...)`. ~5–10 lines per window.

## 6. Per-window group catalog

**Tier 1** = free, works in both backends. **Tier 1°** = on the row but degrades
to empty in **Airtable mode** (linked dimension not resolved) — grouping works
but collapses to one "— none —" bucket until link resolution is added; live
clients run Airtable-first, so treat these as needing resolution to be useful.
**Tier 2** = not on the row at all; needs a source extension.

| Window | Tier 1 (free) | Tier 1° (Airtable-degraded) | Tier 2 (source extension) |
|---|---|---|---|
| **actions** | owner, priority, issue type, source | project/job (code null in Airtable) | **vendor** (not on row) |
| **risks** | status, severity band, RAG, category, owner | jobCode | — |
| **projects** | status, suburb, engagementType° | — | owner / PM / team |
| **documents** | classification, docType, kind, storage provider, status, uploadedBy | jobCode / jobName | — |
| **comms** | message type, stakeholder role, status, sentBy, overdue | — | project (only `jobId` link), stakeholder name (only `stakeholderId`) |
| **vendors** | category, active/inactive | — | — |
| **quotes** | status, clientName | jobCode | — |
| **variations** | status, AI-drafted vs manual | jobCode | raisedBy, approvedBy (detail-only) |
| **meeting-minutes** | status | jobCode | owner / organizer |
| **cashflow** | type (In/Out), status, category, payee | — | project/job (lives on parent group, not the txn row) |
| **procurement** | status, late/on-time | jobCode, vendorName | budget category label (only link id) |
| **decisions** | status, source type | jobCode, madeBy (placeholder in Airtable) | resolved owner name (Airtable) |

**Cross-cutting:** "group by project/job" is the most-requested dimension and is
Tier 1° almost everywhere (present on Postgres, null/blank in Airtable because
Airtable JOBS has no code field), and full Tier 2 for **comms** and
**cashflow**. A single "resolve job label into the row view-models" work item
would upgrade project-grouping across ~7 windows at once — worth doing as its
own scoped task rather than per-window.

## 7. Rollout

1. **Phase 1** — core module + FilterBar pill (param plumbed, no visual grouping yet).
2. **Phase 2** — shared header components + pilot 3: risks, comms, actions. Verify on live Didi data.
3. **Phase 3** — remaining 8 windows, Tier-1 dimensions only.
4. **Phase 4 (separate task)** — job-label resolution to unlock Tier 1° project-grouping in Airtable mode; individual Tier-2 add-ons (actions→vendor, procurement budget category) as requested.
5. **Phase 5 (optional)** — collapse/expand sections (client state).

## 8. Edge cases

- Virtual/derived buckets (risk severity bands) supply a single-key `getValue` —
  never the multi-match filter predicate.
- Null/blank → one "— none —" bucket, sorted last.
- High-cardinality dims (owner, payee, vendor) → alpha order + counts; fine, just
  many sections.
- FilterBar `latest`-ref discipline applies to `setGroup`.
