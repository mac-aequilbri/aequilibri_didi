# Reporting revamp — predefined report catalog + prompt-built AI reports

Status: PLANNED (drafted 2026-07-20). Supersedes the single "Generate with AI"
button on `/app/[org]/reports`.

## 1. Current state

- One report type: the weekly report. `generateWeeklyReport` (services/platform/construction/reports.ts)
  builds a JSON context from `loadJobContext` (phases, budget, cashflow, risks,
  actions, variations), calls Claude with the `reports.weekly` prompt, and stores
  the markdown as a DOCUMENTS row (`Document_Type: "Report"`, lifecycle in
  `AI_Analysis.module8` — see reportDoc.ts).
- Lifecycle: draft → approved → sent, all through `writeRecord` (audit + approval
  discipline). `reportingPolicy.ts` gates who can generate and who sees financial
  detail (Owner / finance sub-roles vs delivery vs portfolio views).
- Pain points: only one report shape; "Generate with AI" is opaque (no say over
  content); repeated clicks create duplicate drafts for the same week; every
  report pays an AI call even when the output is really a data table.

## 2. Target model

Two complementary paths on the Reports page:

1. **Predefined reports** — a typed catalog of report definitions. Each knows its
   data slices, audience gating, sections, and whether it is *deterministic*
   (rendered straight from data, no AI call) or *narrative* (AI-drafted from a
   pinned prompt). One click + parameters (job, period) → draft.
2. **Custom AI report ("build from prompt")** — the user describes the report in
   free text; the system assembles the allowed data context, sends prompt +
   context to Claude, and produces a draft. The prompt is stored with the report
   for audit and regeneration, and can be saved as a reusable template that then
   appears alongside the predefined reports.

Everything downstream is unchanged: reports remain DOCUMENTS rows with a
`module8` lifecycle block, draft → approve → send, `writeRecord` audit, and
snapshot semantics per `reportModeFor`.

## 3. Predefined report catalog (v1)

Data slices come from `loadJobContext` plus existing list sources. "Finance"
column = content redacted/hidden unless `reportingCapabilities.showFinancialDetail`.

| id | Title | Kind | Data slices | Finance | Notes |
|---|---|---|---|---|---|
| `weekly_progress` | Weekly Progress Report | narrative (AI) | phases, budget, cashflow, risks, actions, variations | partial | The existing report, unchanged output; becomes a catalog entry. |
| `monthly_client_summary` | Monthly Client Summary | narrative (AI) | phases, budget summary, variations, decisions, comms highlights | partial | Month period param; client-friendly tone; client-portal shareable. |
| `project_health` | Project Health Snapshot | narrative (AI) | health score, completion, top risks, overdue actions, budget headline | partial | One-pager for owner/exec; the "how is this job really going" report. |
| `budget_variance` | Budget vs Actuals | deterministic + AI summary ¶ | budget lines (budget, actual, variance %, category) | yes | Table rendered from data; optional 3-sentence AI commentary. |
| `cashflow_forecast` | Cashflow Forecast | deterministic + AI summary ¶ | cashflow periods (projected vs actual), open variations cost | yes | Finance-gated entirely (hidden from non-finance roles). |
| `risk_register` | Risk Register | deterministic | open risks (desc, likelihood × impact score, owner, mitigation) | no | Pure table sorted by score; no AI call. |
| `variations_register` | Variations / Change Orders | deterministic | variations (ref, title, status, cost impact) | cost column | Cost column dropped for non-finance audiences. |
| `actions_status` | Open Actions & Overdue | deterministic | actions (title, owner, due, status), overdue flag | no | By-owner grouping; feeds site meetings. |
| `phase_schedule` | Phase / Schedule Status | deterministic | phases (name, status, completion %, dates) | no | Simple progress table + completion bar per phase. |
| `handover_completion` | Handover / Completion Report | narrative (AI) | full job context + documents index + final variations | partial | v2 — end-of-job; needs document index work first. |

Principles:

- **Deterministic where the report is a register.** Risk/variations/actions/phase
  reports are tables; AI adds nothing but cost and hallucination risk. They render
  from data with an optional AI executive-summary paragraph (flag per report).
- **Every narrative prompt is pinned** in the `prompts.ts` registry
  (`reports.<id>`, versioned) with the same grounding guardrails as
  `reports.weekly` ("ground every statement in the supplied data; do not invent
  numbers").
- **Duplicate protection:** generating a report with the same `(jobId, reportId,
  period)` as an existing draft supersedes it (or warns) instead of silently
  creating a second draft — fixes the current duplicate-drafts annoyance.

## 4. Custom AI report — "build from prompt"

UI (Reports page, second card):

- Job selector + period (from/to or week/month picker).
- **Prompt textarea** — e.g. "Compare subcontractor spend against budget for the
  fit-out phase, flag anything more than 10% over, and list the variations that
  caused it."
- **Data scope picker** — checkboxes for the slices to include (phases, budget,
  cashflow, risks, actions, variations, decisions, comms). Defaults to all the
  slices the viewer's role may see; finance slices are not offered to
  non-finance roles (CLS enforced server-side, not just in the UI).
- Generate → draft report opens, same approve/send flow.

Pipeline (`generateCustomReport(ctx, user, { jobId, period, prompt, scopes })`):

1. Server-side scope filter: intersect requested scopes with
   `reportingCapabilities(viewer.role)` — the context builder never serializes
   finance slices for a non-finance viewer, whatever the client sent.
2. Build context JSON from the allowed slices (reuse the weekly report's
   context assembly, factored out per-slice).
3. System prompt `reports.custom` (new, versioned): markdown output, ground in
   data only, refuse content outside the supplied context, honour the user's
   requested structure, ≤600 words unless the prompt asks for a register.
4. Store as DOCUMENTS row: `module8.kind: "custom_report"`, plus
   `module8.promptSpec: { prompt, scopes, period, promptVersion }` so the report
   is auditable and **regenerable** (a "Regenerate" button re-runs the same spec
   against fresh data).
5. Draft → approve → send lifecycle identical to predefined reports.

**Save as template:** on any custom report, "Save as template" persists the
promptSpec as an org-level report definition that then appears in the
predefined list (badge: "Custom"). Storage: control-base table
`PLAT_REPORT_CATALOG` (per vertical + per org overrides) — the same data-driven
pattern as `PLAT_JOB_CATALOG`. Code-registry defaults ship the v1 catalog;
control base overlays org/vertical additions.

## 5. Architecture changes

- `src/lib/platform/reportCatalog.ts` — typed registry: `{ id, title, kind:
  "narrative" | "deterministic", scopes, financeGate, promptKey?, period:
  "week" | "month" | "range", aiSummary? }`. v1 ships in code; control-base
  overlay later (Phase 4).
- `src/services/platform/construction/reports.ts` — refactor: extract
  `buildJobReportContext(ctx, jobId, scopes, caps)` (per-slice builders +
  role redaction); `generateReport(ctx, user, reportId, params)` dispatches
  narrative (AI) vs deterministic (markdown table renderers);
  `generateCustomReport` for promptSpecs. `generateWeeklyReport` becomes
  `generateReport(..., "weekly_progress", ...)` (keep a thin alias for callers).
- `module8` block gains: `reportId` (catalog id or `"custom_report"`),
  `period`, `promptSpec?`. `parseReportModule8` stays tolerant (old rows have
  neither — treated as `weekly_progress`).
- Reports list page: group/filter by report type; show type badge.
- Actions (`reports/actions.ts`): `generateReportAction` takes `reportId` +
  period params; new `generateCustomReportAction`; both re-check
  `canGenerateReports` server-side.

## 6. Phases

1. **Phase 1 — catalog + pipeline refactor.** reportCatalog.ts, context builder
   split with role redaction, `generateReport` dispatcher, weekly report ported,
   duplicate-supersede rule. Reports page: catalog picker (cards or select +
   params) replaces the single form.
2. **Phase 2 — deterministic reports.** Table renderers + the five register
   reports (`budget_variance`, `cashflow_forecast`, `risk_register`,
   `variations_register`, `actions_status`, `phase_schedule`). Optional AI
   summary paragraph flag.
3. **Phase 3 — custom prompt builder.** Prompt + scope picker UI,
   `reports.custom` prompt, promptSpec storage, Regenerate button.
4. **Phase 4 — templates + catalog as data.** "Save as template",
   `PLAT_REPORT_CATALOG` control-base overlay (vertical defaults + org
   custom), monthly/handover reports, n8n-scheduled generation (auto-draft
   weekly/monthly per org — ties into the n8n automation plan).

## 7. Open questions

- Should deterministic registers skip the approval step (they contain no AI
  judgement)? Leaning **no** — keep one lifecycle; approval is cheap and the
  send step is the real gate.
- Multi-job / portfolio reports (broker "Portfolio view") — v2; needs a
  cross-job context builder and its own catalog entries.
- Client-portal exposure of `monthly_client_summary` — reuse the portal's
  existing snapshot surface or a dedicated share link?
