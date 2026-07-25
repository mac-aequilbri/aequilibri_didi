# æquilibri design system

Working standards for platform UI. The token layer lives in `src/app/globals.css`
(`:root` variables + `@theme inline` Tailwind exposure); the React primitives live
in `src/components/ui/` and `src/components/`. New screens compose these — don't
hand-roll buttons, chips, banners, or colors.

## Tokens

- **Brand**: `--ae-earth/water/air/fire/space/cream/ink` + derived
  (`--ae-space-hover/-deep`, `--ae-quiet`). Brand terracotta (`--ae-space`) means
  *interactive or selected* — never decoration.
- **Semantic** (each with a `-bg` pair): `--ae-success`, `--ae-warning`,
  `--ae-danger`, `--ae-info`, `--ae-ai` (AI/automation origin), `--ae-muted(-strong)`.
  Exposed as Tailwind utilities: `text-ae-danger`, `bg-ae-success-bg`,
  `border-ae-warning/30`, etc. **Stock palette classes (`red-600`, `emerald-100`,
  `violet-700`…) are not allowed for semantic meaning** — the only tolerated stock
  usage is data-viz shading (heat-map bands, Gantt fills).
- **Radius**: `--ae-radius-xs…xl/pill`. **Elevation**: `--ae-shadow-sm…xl/brand`.

## Type & spacing

- Page title: `text-2xl font-bold` (via `PageHeader` only).
- Section heading: `text-base font-semibold`; label-style alternative:
  `text-xs font-semibold uppercase tracking-wide text-neutral-500`.
- Body `text-sm`; captions/table-meta/chips `text-xs`. Minimum text color
  `text-neutral-500` (400 only for disabled/decorative). Numerals `tabular-nums`.
- Cards `ae-card p-5`; pages `p-6`; forms `space-y-4`; page sections `space-y-6`.
- Page widths: lists full-width; detail `max-w-4xl`; forms `max-w-2xl`;
  settings/admin `max-w-3xl`.

## Components

| Need | Use | Notes |
|---|---|---|
| Button | `Button`/`LinkButton`/`buttonClass` (`ui/Button`) | `primary` (one per screen), `outline`, `ghost` (table rows), `danger`. Sizes `md`/`sm`. |
| Pending submit | `SubmitButton` (`form/`) | spinner + `aria-busy`; style via `buttonClass(...)`. |
| Destructive | `ConfirmSubmitButton` | two-step arm/confirm; never `window.confirm`. |
| Record status | `StatusBadge` (`PageHeader.tsx`) | central `STATUS_TONE` map — add new statuses there. |
| Tag/annotation | `Chip`/`AiChip` (`ui/Chip`) | `ai` = the one AI-origin marker; RAG via `ragClass()` (`lib/platform/ragStyles`). |
| Banner | `MessageBar` (`ui/MessageBar`) | info/success/warning/danger; sets `role` itself. |
| KPI | `MetricCard` | tones quiet at zero — color signals exception. |
| Empty state | `EmptyState` | mandatory in every list + not-found; filtered vs truly-empty copy. |
| List machinery | `listQuery` + `FilterBar` + `SortableTh` + `GroupHeader` | URL-driven; `SortableTh name` must match a config sort entry. |
| Create form | `CreateForm` (`form/`) | action returns `{error}` on failure (input preserved), `redirect()` on success. |
| Icons | `lucide-react` | 16px tables/chips, 20px nav/header; no emoji/glyph chrome. Nav icons via the `NAV_ICONS` registry in `Sidebar.tsx`. |
| Route labels | `lib/platform/routeLabels.ts` | single source for nav + breadcrumbs. |

## Definition of a consistent window (PR review gate)

Every window must have:

1. Pending state on every mutation (`SubmitButton` family).
2. Two-step confirm on every destructive/irreversible action.
3. `loading.tsx` skeleton (`ListSkeleton`) on list routes.
4. Guided `EmptyState` (filter-aware copy on filtered lists).
5. Visible error on failure with the user's input preserved; success feedback
   (redirect-to-detail on create, inline flash on edit).
6. `formatDate`/`currency`/`StatusBadge` for dates, money, statuses.
7. Tables: `overflow-x-auto` + `min-w`, `scope="col"`, `SortableTh` where the
   config defines sorts, `aria-sort` (SortableTh provides it).
8. Visible keyboard focus (global `:focus-visible`), `aria-label` on inline
   controls that lack visible labels.
9. Semantic colors via `ae-*` tokens only; text ≥ `neutral-500`.
10. No internal jargon (codenames, raw table names, raw JSON) in user-visible copy.
