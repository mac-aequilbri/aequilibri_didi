# UC3 (MSME Platform) — UI/UX Audit & Improvement Plan

**Date:** 2026-07-20 · **Scope:** all `(platform)` windows under `/app` and `/app/[org]/…` (UC1 roofing excluded) · **Method:** six parallel code audits (shell/nav, list windows, detail+forms, financial, AI/analysis, admin/ops) + live spot-check against the running dev server (Dulong Downs Didi org).

---

## Executive summary

The platform's individual windows are functional and several are genuinely good (Assessment intake, Reports generation, public client portal, org dashboard). The UX problems are overwhelmingly **systemic, not per-window**: the same 8–10 defect patterns repeat across 30+ windows because good shared components exist (`SubmitButton`, `StatusBadge`, `EmptyState`, `FilterBar`, `DateField`, confirm-gated delete) but are used inconsistently. That is good news — most of the fix is a mechanical consistency sweep, not a redesign.

**4 findings are Critical (fix first, they are trust/safety issues):**

| # | Finding | Where |
|---|---------|-------|
| C1 | **Approvals page renders financial proposal diffs without financial-role gating** — any org member sees budget/cashflow amounts, payees, before→after values. Only the approve *action* is role-checked. (This is the spec-12 "financial-route role gating" gap surfacing in UI.) | `approvals/page.tsx:95` |
| C2 | **Cashflow trend chart adds inflows and outflows together** — $100k in + $100k out charts as $200k. The headline cashflow visual is arithmetically wrong. | `cashflow/page.tsx:74-83` |
| C3 | **Shared record editor silently drops `required` on textarea/select fields** — required descriptions on Decisions/Risks can be saved blank from the edit screen. | `_record-edit/RecordEditor.tsx:66-91` |
| C4 | **Four learning-rules actions have no role check at all** (run engine, promote/reject hypothesis, snapshot) — a read-only Broker can trigger them. Exec-log approve/reject is likewise only membership-gated. | `learning-rules/actions.ts:14-33,51-55`, `exec-log/page.tsx:52` |

**The 10 systemic themes (ranked by user impact):**

1. **Silent failures.** Approval write failures are swallowed (`approvals/actions.ts:69-75`); a failed assistant message leaves an eternal "thinking" bubble and loses the typed text (`AssistantClient.tsx:380-382`); command-palette search errors are hidden; client-card metric errors masquerade as "no data". Users cannot tell "it failed" from "nothing happened".
2. **No pending state on mutation buttons.** `SubmitButton` (with spinner + `aria-busy`) exists and is used in most `/new` forms — but Approvals approve/reject, Accounting connect/sync/disconnect, team invite/role/deactivate, template toggle/delete, learning-rules engine buttons, tender/architectural/delay-cascade AI runs, quotes inline saves, document analyse/verify, and schema-drift migrate are all plain buttons on multi-second Airtable/AI calls. Double-submit is possible everywhere.
3. **Destructive actions without confirmation.** Template-mapping delete, BIM model delete, integration delete/disable, team deactivate, role change, hypothesis reject, rule activate, variation reject, quote accept (creates a project!), report regenerate (overwrites in place), schema-drift migrate (mutates a customer base), approvals approve-of-delete ("permanently deletes" warning next to an unguarded button). Client delete at least uses `window.confirm` — itself the wrong pattern.
4. **Frozen navigation between list windows.** Every list is `force-dynamic` against Airtable (1–11 s reads) but only Actions has a `loading.tsx`. Navigating projects → decisions → risks freezes the old page for the full fetch. This alone likely accounts for much of the "platform feels slow/broken" feedback.
5. **Form errors destroy user input.** Onboarding, template-new, most create actions either `redirect('?error=…')` (fresh empty form) or throw to the error boundary. Long forms lose everything on one validation failure. No inline field errors anywhere except Actions and Risks (partially).
6. **Five different edit/detail paradigms.** Projects has read-only detail + edit page; Actions has a bespoke editor; 7 registers (decisions, risks, vendors, procurement, comms, phases, room-matrix) have *no read-only view at all* — clicking a row lands in an editable form with no related records, no delete, and silent redirect-to-list on save. Documents/variations/minutes are read-only + workflow buttons; Quotes is a page of independent mini-forms each with its own Save.
7. **Keyboard/a11y baseline gaps.** No `:focus-visible` outline anywhere (keyboard focus is invisible app-wide); inline status `<select>`s without `aria-label`; command palette without listbox semantics; popovers that don't trap/restore focus; progress bars without `role="progressbar"`; tables without `scope="col"`; Phases table with no header row at all.
8. **Internal jargon leaks to end users.** "UC1"/"UC3" badges, footer "æquilibri POC — Next.js port" on every page, "Module 3 capability" subtitles, "seeded from UC1 rates", raw DB table names in the dashboard activity feed, raw tool names (`query_records`) in assistant chips, raw JSON dumps in tender/architectural results and exec-log/approvals payloads, `#recXXX` breadcrumbs, raw Airtable base IDs.
9. **Mobile/overflow.** 10 of 12 list tables have no `overflow-x-auto` wrapper (Quotes and Phases have the correct pattern); onboarding uses `grid-cols-2` with no base breakpoint; procurement is an 8-column table plus an inline form.
10. **Format/consistency drift.** Dates: `formatDate` vs raw ISO (risks, comms, phases). Status: `StatusBadge` everywhere except Comms (dropdown only) and Vendors/Budget-RAG (raw text). Empty states: guided `EmptyState` vs plain grey text (procurement, quotes, minutes, phases, room-matrix). `.replace("_"," ")` non-global in several labels. Chart colors hardcoded, bypassing design tokens.

---

## Per-window audit

Severity: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low. File paths relative to `src/app/(platform)/app/` unless noted.

### Group 1 — Shell & navigation

#### 1.1 Global shell (`src/app/layout.tsx`, `Sidebar.tsx`, `globals.css`)
Top navbar (brand, UC-switcher, user button), sidebar with org switcher + 5–6 collapsible sections (~25 items), footer.
- 🟠 No `:focus-visible` styling anywhere; several inputs explicitly `outline:none`. Keyboard focus invisible app-wide. One global CSS rule fixes it.
- 🟠 No skip-to-content link; keyboard users tab the whole sidebar every page.
- 🟡 "UC1"/"UC3" codenames and footer "æquilibri POC — Next.js port" ship to all users (`layout.tsx:39-45,58`).
- 🟡 Org-switcher renders a "▾" caret but is just a link to `/app` — misleading affordance (`Sidebar.tsx:81-83`).
- ⚪ `nav-count` pill ~2.8:1 contrast; section collapse state not persisted; emoji glyphs vary by OS.
- **Quick wins:** global focus ring; fix footer/UC labels; skip link.

#### 1.2 Breadcrumbs + header (`[org]/layout.tsx`, `Breadcrumbs.tsx`)
- 🟡 Detail pages show `#recABC123` as the leaf crumb instead of the record name (`Breadcrumbs.tsx:42`).
- ⚪ Hand-maintained `LABELS` map already drifting from the ~40 route folders.
- **Quick win:** let pages pass a resolved title for the leaf crumb.

#### 1.3 Command palette (`CommandSearch.tsx` + `[org]/search/route.ts`)
⌘K modal, debounced search over 8 entity types.
- 🟡 Action/Risk/Decision/Vendor results link to the **list page**, not the record — search can't deep-link half its result types (`route.ts:66-86`).
- 🟡 Fetch errors swallowed — search failure looks like "no results" (`CommandSearch.tsx:65-66`).
- 🟡 No listbox/option roles or `aria-activedescendant`; hardcoded "⌘K" hint on Windows.
- ⚪ Airtable path pulls 500 records × 8 tables per keystroke-batch and filters in JS.
- **Quick wins:** deep-link all result types; surface search errors.

#### 1.4 Client list / landing (`app/page.tsx` + `ClientCardMetrics`, `DeleteClientButton`)
Org picker cards with metrics, admin Templates/Onboard/Delete.
- 🟠 Delete client uses native `window.confirm` and has no pending state (`DeleteClientButton.tsx:19`).
- 🟡 Metric-fetch failure silently renders as an idle card ("Open workspace") — data-having orgs look empty (`ClientCardMetrics.tsx:101`).
- ⚪ `replace("_"," ")` non-global on engagement labels. Good: real skeleton on metrics, thoughtful empty state.
- **Quick wins:** shared confirm dialog + pending delete.

#### 1.5 Onboarding (`app/new/page.tsx`)
Single-page, 3-section provisioning form.
- 🟠 `grid-cols-2` with no base breakpoint — cramped two-across inputs on phones (`page.tsx:87,150,159,182`).
- 🟡 On failure: `redirect('?error=…')` **loses the entire long form**; single top-level error, no per-field messages (`actions.ts:78,115-117`).
- 🟡 Raw Airtable template base IDs dumped in the instruction card; no wizard steps/progress for a very long form.
- Good: `LogoField` validation/preview is exemplary; staged provisioning loader.
- **Quick wins:** responsive grids; `useActionState` preserving input.

#### 1.6 Templates (`app/templates/`, `templates/new/`)
Admin table of industry→template mappings; toggle + delete per row.
- 🟠 **Delete has no confirmation at all** — single click destroys a mapping (`templates/page.tsx:61-66`).
- 🟡 Toggle/delete have no pending state; 6-column table with no overflow wrapper.
- ⚪ New-mapping errors round-trip via `?error=` losing input.
- **Quick wins:** confirm on delete; `overflow-x-auto`; pending buttons.

#### 1.7 Org dashboard (`[org]/page.tsx` + `loading.tsx`, `error.tsx`)
Attention banner, 5 metric cards, cashflow trend, jobs + recent activity. **Overall the strongest window** — has skeleton, error boundary with retry, good empty states.
- 🟡 Activity feed leaks raw table names (`log.targetTable.replace(/^plat_…/,"")` → "con_variation_order") (`page.tsx:165`).
- ⚪ Skeleton grid is 4-col vs real 5-col (layout shift); non-global `replace("_"," ")`.
- **Quick wins:** friendly table-name map; align skeleton columns.

### Group 2 — Register list windows

Shared machinery (`listQuery.ts`, `FilterBar.tsx`) is clean and well-factored: URL-driven state, debounced search, stale-page clamping. Gaps: enum popover doesn't move/trap focus (🟡), pager not disabled while pending (⚪), no landmark label (⚪).

**Cross-list consistency matrix** (✓ = present):

| Window | FilterBar | Sort | Paging | Guided empty state | loading.tsx | Overflow wrap | Row-level link target |
|---|---|---|---|---|---|---|---|
| Projects (cards) | ✓ | ✓ | ✓ | ✓ | ✗ | n/a | ✓ whole card |
| Actions | ✓ | ✓ | ✓ | ✓ | **✓ (only one)** | ✗ | title only |
| Decisions | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | title only |
| Risks | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ (matrix ✓) | title only |
| Vendors | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | title only |
| Procurement | ✓ | ✓ | ✓ | ✗ plain text | ✗ | ✗ (8 cols!) | title only |
| Comms | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | title only |
| Documents | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | title only |
| Quotes | ✓ | ✓ | ✓ | ✗ plain text | ✗ | **✓ (the model)** | title only |
| Variations | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | title only |
| Meeting minutes | ✓ | ✓ | ✓ | ✗ plain text | ✗ | ✗ | title only |
| Phases | ✗ none | ✗ | ✗ | ✗ plain text | ✗ | ✓ | title only |
| Room matrix | ✗ none | ✗ | ✗ | ✗ plain text | ✗ | ✗ | title only |

Per-window notables beyond the matrix:

- **Projects** — only card-grid register (intentional divergence, works well); progress bar missing `role="progressbar"` (⚪).
- **Actions** — 🟠 Postgres path caps at `take: 200` while showing the true total: pagination can never reach records past 200 (`actionsSource.ts:161`). Good: overdue highlighting, unmapped-status panel, metric cards.
- **Decisions** — ⚪ raw `sourceType` vs Actions' humanized version.
- **Risks** — 🟡 escalated date printed as ISO vs `formatDate` elsewhere; 🟡 status select lacks `aria-label`; heat matrix good; escalation page is the only bulk surface (threshold-based, can't pick specific risks).
- **Vendors** — 🟡 Active column is raw "Yes/No" text, no badge; star rating unlabeled for screen readers.
- **Procurement** — 🟠 worst mobile offender: 8 columns + inline status form, no overflow wrap; 🟡 plain-text empty state with no CTA.
- **Comms** — 🟠 the Status column renders *only* a `<select>` — current status invisible until opened; 🟡 ISO dates.
- **Documents** — ⚪ "+ Add document" vs empty-state "+ New document" label mismatch. Good: guided empty state, safe external links.
- **Quotes** — has the correct overflow pattern (`overflow-x-auto` + `min-w-[40rem]`) to copy everywhere; 🟡 plain empty state.
- **Variations** — ⚪ "+ New / AI draft" vs "+ New variation" label mismatch; AI origin badge good.
- **Meeting minutes** — 🟡 plain empty state; only 4 columns (fine).
- **Phases** — 🟠 no search/filter/sort/pagination; renders every phase of every job unbounded; 🟡 table has **no header row**; good: `PendingButton` on mutations, `aria-label` on RAG select (the only one).
- **Room matrix** — 🟠 no list machinery, no create route, no header action; ⚪ no `scope="col"`.

**Group quick wins:** (1) one shared `loading.tsx` skeleton dropped into all 12 list routes; (2) mechanical overflow-wrapper sweep copying the Quotes pattern; (3) normalize empty states, `StatusBadge` in Comms, `formatDate` in risks/comms/phases; (4) make whole rows clickable (stretched link) — Projects cards prove the pattern.

### Group 3 — Detail windows & create/edit forms

**Structural finding:** five paradigms coexist (see theme 6). The shared config-driven editor (`_record-edit/RecordEditor.tsx`) serves 7 registers but is *the edit form as the detail page* — no read-only view, no related records, no delete, silent redirect-to-list on save.

Shared editor (`RecordEditor.tsx`, `recordEditorActions.ts`):
- 🔴 `required` only emitted on the `<input>` branch — textarea/select required fields (Decisions/Risks descriptions) not enforced (`RecordEditor.tsx:66-91`).
- 🟠 No required-field `*` marking (create forms have it; edit doesn't).
- 🟠 Save redirects silently to the list — no success feedback anywhere in Paradigm A.
- 🟠 Dates are bare `<input type="date">` — the `DateField` no-past guard used on create is lost on edit.
- 🟡 No unsaved-changes protection (nowhere in the repo); 🟡 no delete for any Paradigm-A register.
- Good: AI-suggest flow, `role="alert"`/`role="status"` on banners (better than the create forms).

Per-window notables:

- **projects/[id]** — the model detail page (metrics, phases, risks, actions). 🟡 related-list rows aren't links. **projects/[id]/edit**: 🟠 plain submit (no pending); 🟡 no try/catch on `updateJob` → error boundary eats input; 🟡 status options duplicated vs create; ⚪ no back affordance. **projects/new**: good redirect-to-detail success (best in app); 🟠 no failure handling; 🟡 flat 2-col grid, plain-text address though `AddressAutocomplete` exists.
- **projects/[id]/models** — 🟡 one-click model delete, no confirm, no pending. Good empty-state instructions.
- **actions/[id]** — strongest editor (controlled inputs, inline `role="alert"` error, "Saved — returning…" feedback). 🟡 duplicates the shared editor concept — consolidation target; ⚪ blank title saveable; no no-past on due date.
- **decisions/[id]** — 🔴 required description not enforced; 🟡 create offers 2 status options, edit offers 3 (superseded) — drift.
- **risks/[id]** — 🔴 same required bug; 🟡 likelihood/impact are number inputs on edit but constrained selects on create. **risks/new** — only create form with a caught failure path (`?error=save_failed`), but input still lost; 🟡 `jobId` required with no blank option → silently files against the first job (same trap in procurement/variations/minutes/quotes creates).
- **vendors/[id]** — 🟡 email/tel input types + phone pattern on create are lost on edit (plain text).
- **procurement/[id]/new** — 🟡 dual vendor entry (select *and* free text) with no explanation of which wins; unitPrice bare number, no `$`.
- **comms/[id]/new** — 🟡 messageType/stakeholderRole option lists duplicated between config and create form.
- **documents/[id]** — read-only intelligence view. 🟡 "Analyse with AI"/"Verify integrity" plain buttons, no pending on multi-second AI ops; ⚪ no metadata edit after upload.
- **variations/[id]** — 🟡 Reject is one-click, no confirm, no reason capture; no pending on approve/reject; ⚪ negative final cost accepted.
- **meeting-minutes/[id]** — 🟡 extracted actions not editable before Confirm — AI-mistaken owners/dates are all-or-nothing; no pending on Confirm. Good status messaging.
- **quotes/[id]** — 🟡 every meta/line row is its own uncontrolled form with its own Save, no pending, no indication which row saved; 🟡 "Mark accepted (creates project)" one-click, no confirm. Print view clean (⚪ no print button / back link).
- **phases/[id], room-matrix/[id]** — shared-editor defaults; room-matrix has edit but no create anywhere (🟡 asymmetric); ceilingHeight free text vs numeric area.

**Group quick wins:** (1) two-line fix for the `required` bug + `*` marking; (2) try/catch + `?error=` (the `createRisk` pattern) on `createJob`/`createDecision`/`createVendor`/`createComm`/`createProcurement` + success flash on all saves; (3) shared confirm+pending wrapper on quote accept, variation reject, model delete, document analyse/verify.

### Group 4 — Financial windows

- **Budget** — 🟠 no aggregate variance card (the headline number an owner needs); metric cards never use `tone` so nothing turns red over budget; 🟠 `BarsCompare` labels only the Actual bar — budgeted values are unreadable (`charts.tsx:52`); 🟡 chart compares Budget-vs-Actual while table variance is Forecast-vs-Estimated (two definitions on one screen, unexplained); 🟡 RAG rendered as raw text, not colored; 🟡 create failure throws to boundary, losing input; ⚪ "Committed $" collected but never displayed.
- **Cashflow** — 🔴 trend chart sums In and Out (C2); 🟡 ledger Amount column unsigned/uncolored — direction only in a separate Type column; 🟡 no In/Out/Net summary cards ("am I cash-positive this month" is unanswerable at a glance); 🟡 y-axis `$0k` for sub-$500 values; ⚪ new-entry period regex stricter than the formats legacy data uses.
- **Accounting** — 🟠 Connect/Sync/Disconnect plain buttons, no pending on a multi-second Xero sync; 🟡 Disconnect unconfirmed; 🟡 connected-but-never-synced renders nothing below the card.
- **Approvals** — 🔴 page lacks `requireFinancialAccess` (C1); 🟠 write failures silently swallowed — card just vanishes, later shows `failed` with no reason; 🟠 approve/reject no pending state → double-submit possible; 🟠 approve-of-**delete** is one unguarded click beside a "permanently deletes" warning; 🟡 no post-approval confirmation or link to the written record; 🟡 root-cause form shows even when nothing was edited, implying a correction is expected; ⚪ values truncated at 90 chars with no expansion. Good bones: field-level diffs, editable corrections, AI/manual badges.
- **Charts (`charts.tsx`)** — 🟡 hardcoded hex colors bypass the `--ae-*` token system; ⚪ truncated labels with no `<title>` tooltip; legend can overlap at 3+ series; components return `null` on empty data leaving silent gaps.

**Group quick wins:** gate approvals; net the cashflow chart; add Variance and In/Out/Net cards; `SubmitButton` on approvals + accounting; surface approval failures.

### Group 5 — AI & analysis windows

- **Assistant** — 🟠 no streaming: full multi-specialist run completes before any UI update; rich tool trace exists but only shows after completion; 🟠 a failed send leaves a **permanent thinking bubble and loses the typed message** (composer resets before await, no try/catch); 🟡 no cancel; 🟡 raw tool names (`query_records`) and payload JSON in chips/approval rows; 🟡 close-session form exposes corrections-taxonomy jargon ("Correction dimension: assistant.session"); ⚪ single-line composer, no AI-disclaimer on answers.
- **Assess (intake)** — **the model to copy**: staged pending overlay, results persisted via `?run=` (refresh-safe), confidence + assumptions + source cascade, `useTransition` refiners. 🟠 "seeded from UC1 rates" leaks a codename; ⚪ confidence value has no scale/unit.
- **Assess — tender & architectural** — worst windows in scope. 🟠 plain run button on a 30–60 s multi-doc AI analysis (no pending, double-submit possible); 🟠 users must **hand-paste raw `recXXXX` document IDs into a textarea** while the selectable document table renders directly below; 🟠 results shown as `JSON.stringify` in a `<pre>`; 🟠 "Module 3 capability" subtitle; 🟡 failed/empty runs produce no message at all.
- **Reports** — good pending states, drafts persist, markdown rendered, AI badges. 🟡 Regenerate overwrites an approved report in place with no confirm/versioning; 🟡 save-as-template has no naming step (title = first 60 chars of the prompt); 🟡 print view renders inside the app layout with no `print:hidden` chrome rules and no print button; ⚪ raw scope tokens as checkbox labels; report list filters stubbed.
- **Coordination / Project plan** — clean, good empty states; ⚪ "MED" abbreviation.
- **Delay cascade** — 🟠 plain button on a long AI run; 🟡 silent failure path. Good: results persist to exec log.
- **Org portal (share links)** — 🟡 **no copy-link button** — the primary artifact of the screen is a truncated anchor; ⚪ revoke unconfirmed (recoverable), expiry date accepts the past, no success highlight on the new link.
- **Public portal** — strong: expired-state, responsive, finance-free footer, BIMx loading state. ⚪ no "status as of" timestamp; ⚪ one failed query blanks the whole page to "expired" — a transient error looks like a dead link to the client.

**Group quick wins:** try/catch + retry on assistant send; `SubmitButton` on tender/architectural/delay-cascade; replace ID-textarea with checkboxes on the rendered document table; render Module-3 results as structured lists; copy-link button on portal.

### Group 6 — Admin & ops windows

Cross-cutting: **none of the seven windows uses `SubmitButton` or any confirm pattern**, though both exist in the repo. Role gating is inconsistent (see C4): team/agents/integrations/diagnostics/schema-drift gate with `requireAdmin`; exec-log and learning-rules pages only check membership.

- **Team** — 🟠 deactivate member and role changes are one-click, unconfirmed; 🟡 no pending on invite (sends a Clerk email); 🟡 last-owner rule enforced server-side only — the UI lets you try. Good: status banners, demo-mode notice, footer explainer (best-documented admin window).
- **Agents** — 🟠 switching to `auto_low_risk` (AI writes execute without approval) is one unconfirmed Save; 🟡 `propose_only` and `approve_required` have **identical hint text** — indistinguishable options; 🟡 raw tool/table identifiers with no plain-language legend.
- **Integrations** — 🟠 delete connection unconfirmed; enable/disable is a bare colored-text button, no pending; 🟡 the webhook signing secret can't be viewed, copied, or rotated — the one thing an admin comes here for is a dead end; 🟡 no health roll-up ("all channels healthy / N failing"); developer-grade HMAC docs with no copy buttons; ⚪ raw ISO timestamps.
- **Diagnostics** — 🟡 errors truncated to 40 chars inline in table cells; ⚪ counts cap at 1000 shown as exact; no last-refreshed timestamp; no "what healthy looks like" intro.
- **Exec log** — 🔴/🟠 approve/reject not admin-gated (C4) and unconfirmed; 🟠 approve/reject failures silently swallowed; 🟠 reject captures no reason though the action supports one; 🟡 raw JSON payloads with no human summary; 🟡 no filters (only sort) on a long audit trail; ⚪ "shown of total" count wrong (passes total as shown); no proposal↔history correlation.
- **Learning rules** — 🔴 four ungated actions (C4); 🟠 hypothesis reject unconfirmed; 🟡 rule activate/deactivate unconfirmed, no pending; 🟡 engine/snapshot buttons no pending on multi-second runs; 🟡 no error surfacing on any action; ⚪ explainer copy only at page bottom.
- **Schema drift** — 🟠 "Migrate ↑" mutates a customer's live base with no confirm and no pending; 🟡 raw missing-table/field identifiers with no impact framing; ⚪ unreachable/error rows lack remediation hints. Good: the migrate-result banner covers ok/partial/noop states properly.

**Group quick wins:** blanket `SubmitButton` + shared confirm sweep; role-gate the ungated actions; masked+copyable webhook secret; plain-language payload summaries in exec-log with JSON behind a disclosure.

---

## Improvement plan

Phased so each phase is independently shippable and the mechanical sweeps come before structural work.

### Phase 0 — Safety & correctness (≈2–3 days) 🔴
1. Add `requireFinancialAccess` to `approvals/page.tsx` (or filter proposals to viewer-visible tables) — C1.
2. Role-gate the four learning-rules actions and exec-log approve/reject (`getCurrentUser`/approver role) — C4.
3. Fix `RecordEditor` required drop-through (textarea/select) + add `*` marking — C3.
4. Net the cashflow trend by direction (In positive, Out negative, or two series) — C2.
5. Stop swallowing approval/exec-log write failures — surface an error banner stating no change was made.
6. Fix the Actions list 200-row truncation (paginate in the query).

### Phase 1 — Mechanical consistency sweep (≈1 week, high leverage, low risk)
1. **Pending states:** replace every plain mutation button with `SubmitButton` (~20 call sites: approvals, accounting, team, agents, integrations, templates, learning-rules, schema-drift, exec-log, tender, architectural, delay-cascade, document analyse/verify, quote forms, project edit, model delete).
2. **Confirmations:** build one shared `ConfirmSubmitButton` (in-app dialog, not `window.confirm`) and apply to: client delete, template delete, model delete, integration delete/disable, team deactivate + role change, `auto_low_risk`, hypothesis reject, rule activate, variation reject, quote accept, report regenerate, schema-drift migrate, approvals delete-approve.
3. **Loading:** one shared list-skeleton `loading.tsx` dropped into all 12 list routes (kills the frozen-navigation feel — probably the single biggest perceived-performance win).
4. **Overflow:** wrap all bare list tables in the Quotes pattern (`overflow-x-auto` + `min-w`).
5. **Focus:** add global `:focus-visible` outline + skip-to-content link.
6. **Format normalization:** `formatDate` everywhere (risks/comms/phases), `StatusBadge` in Comms/Vendors/Budget-RAG, guided `EmptyState` in procurement/quotes/minutes/phases/room-matrix, global `replace(/_/g," ")`, chart colors → CSS tokens.

### Phase 2 — Forms & feedback layer (≈1 week)
1. Convert create/edit actions to `useActionState`: inline errors, preserved input, per-field messages (start with onboarding — the longest form).
2. Success feedback convention: redirect-to-detail on create (the projects/new pattern) + a `?saved=1` flash or toast on edit.
3. Reuse `DateField` (no-past) in the shared editor; align create-vs-edit field types (risks likelihood selects, vendors email/tel, decisions status options); add blank options to required job selects (stop silent first-job filing); resolve procurement dual vendor entry.
4. Unsaved-changes guard in `RecordEditor` and `ActionEditor`.
5. Jargon sweep: footer, UC badges, "Module 3", "UC1 rates", activity-feed table names, assistant tool-chip labels, exec-log/approvals payload summaries (human sentence + JSON behind a disclosure), breadcrumb record titles.

### Phase 3 — Structural UX (≈2–3 weeks)
1. **One detail paradigm:** give Paradigm-A registers a read-only detail view (projects/[id] as the template: summary + related records + explicit Edit) and migrate `ActionEditor` onto the shared editor. Add delete (via the approvals write-path) where the register warrants it.
2. **Row-level navigation:** whole-row click targets on all list tables; command-palette deep links for actions/risks/decisions/vendors.
3. **Financial headline numbers:** Variance card (red tone when over) on Budget; In/Out/Net cards on Cashflow; signed/colored ledger amounts; both values labeled in `BarsCompare`.
4. **Module-3 flows:** document multi-select checkboxes replacing the ID textarea; structured result rendering; pending overlay (reuse the Assess pattern).
5. **Approvals flow completion:** post-approval confirmation with a link to the written record; reject-reason input; root-cause form only after an edit (also closes the spec-12 "post-write reconciliation" and "correction wiring" gaps).
6. Phases/room-matrix: adopt FilterBar (at minimum a job filter); header row on the phases table; a create path for rooms or remove the edit asymmetry.

### Phase 4 — Experience polish (ongoing)
1. Assistant: try/catch + retry + preserved text on failed send (do this one early — it's cheap), then streaming or staged progress, cancel, multi-line composer, human-labeled tool chips.
2. Reports: regenerate confirm + version retention; named save-as-template dialog; `print:hidden` chrome + print button.
3. Integrations: masked+copyable secret, copy buttons on webhook docs, health roll-up banner. Portal: copy-link button + new-link highlight.
4. Mobile pass: onboarding grids, procurement column collapse, sidebar/mobile QA.
5. A11y completion: command-palette listbox semantics, FilterBar focus trap, `aria-label` on inline selects, `scope="col"`, `role="progressbar"`.
6. Empty-data guidance: chart "not enough data yet" hints, connected-but-unsynced accounting state, admin-window intro copy (learning rules, schema drift, diagnostics).

### Suggested acceptance checklist (definition of "consistent window")
Every window should have: pending state on every mutation · confirm on every destructive/irreversible action · loading skeleton · guided empty state · visible error on failure (input preserved) · success feedback · `formatDate`/`currency`/`StatusBadge` · overflow-safe tables · keyboard focus visible · no internal codenames.
