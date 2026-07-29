# Email intelligence plan — project-aware extraction of actions & decisions

Status: **Phases 1–4 built 2026-07-29** (same day as the plan). Phase 5 (learning loop) not
started. Not yet verified against a live email — see [What remains](#what-remains).

## Decisions taken (owner, 2026-07-29)

Answering the five open questions at the foot of this doc:

| Question | Decision |
|---|---|
| First-release scope | **Full vocabulary** — all 8 tables, Phases 1–3 together |
| No project identified | **Attach to `General` and flag it** on the approvals card |
| Synchronous or queued | **Synchronous**, inline in the webhook |
| Noise filter | **None** — every inbound message gets an extraction pass |
| Confidence threshold | Not specified by the owner; set to **0.4** (`MIN_CONFIDENCE`, `emailIntel.ts`) |

## What was built

| Piece | Where |
|---|---|
| Resolution ladder + pure name matcher | [`src/lib/platform/jobResolver.ts`](../src/lib/platform/jobResolver.ts) (+ 13 unit tests) |
| AI intent extraction | [`src/services/platform/emailIntel.ts`](../src/services/platform/emailIntel.ts) (+ 15 tests) |
| `email.extract` prompt (v1.0) | [`src/lib/platform/prompts.ts`](../src/lib/platform/prompts.ts) |
| 8-table routing vocabulary, compiler-enforced | [`src/lib/platform/ingestion.ts`](../src/lib/platform/ingestion.ts) — `ROUTE_TABLES … satisfies readonly WritableTable[]` |
| Proposal provenance (`__source`) | [`src/lib/platform/proposalSource.ts`](../src/lib/platform/proposalSource.ts) |
| Wiring | `documents.ts` — `resolveJobContext` takes text; `ingestInboundMessage` resolves then extracts |
| Approvals card: project, basis, confidence | `approvals/page.tsx` — `SourceNote` |

Deliberate constraints in the build:

- **Nothing auto-writes.** Every intent is a `requireApproval: true` proposal, regardless of
  `aiAuthority`, as the plan required.
- **Money is never confirmed by email** — cashflow intents are forced to `status: "Forecast"`.
- **`cashflow` is dropped on Postgres orgs** before it can be proposed (no write delegate).
- **Ambiguity is not resolved by guessing.** Two projects matching equally well yields no match.
- **Extraction failure never loses the message** — it falls back to the keyword rules
  (`demo_mode`) or to filing as correspondence (exception).

## The requirement (owner, 2026-07-29)

> "The way the email works is we get information from it for potential actions, decisions, etc.
> related to the project. It should know which project it is and do the relevant things."

An inbound email must:
1. **Identify which project (JOBS record) it concerns**, from its own content — not an explicit id.
2. **Extract operational intent** — actions, decisions, risks, variations, procurement, money.
3. **Raise those as approval-gated proposals** against that project.

Today it does none of these. It files the email as correspondence and stops.

**The good news:** the pipeline behind this already works end to end. `ingestInboundMessage` →
`createDocumentRecord` → `inferRouteSuggestions` → `routeOperationalWrites` → `writeRecord({requireApproval:true})`
→ `PENDING_WRITES` → `/approvals` → `executeProposal`. Only **two narrow pieces** are missing: a job
resolver that reads free text, and an AI-backed replacement for the regex router. This is a
focused build, not a new subsystem.

---

## What happens today (verified on Render, 2026-07-29)

A real signed email through n8n → `/api/platform/hooks` returned:

```json
{ "ok": true, "orgSlug": "sunridge", "documents": 1, "proposals": 0 }
```

A DOCUMENTS row is created (`Document_Type: Correspondence`, `Uploaded_By: email webhook`) with an
AI summary. **Zero proposals**, every time.

## Root cause — three independent blockers

### 1. No job id, and auto-resolution deliberately declines

`resolveJobContext` ([documents.ts:125](../src/services/platform/documents.ts#L125)), Airtable mode:

```ts
if (jobId != null) return { jobId, jobCode: undefined };
const jobs = await core.list(ctx.orgSlug, "JOBS", { maxRecords: 2 });
return jobs.length === 1 ? { jobId: jobs[0].id, jobCode: undefined } : {};
```

Auto-assigns only when the org has **exactly one** job. Sunridge has four, so it returns `{}`.

Two related details: the function takes a `fallbackTitle` parameter that is **never used for
matching** (only as a `jobCode` display fallback at `:140`), and `ingestInboundMessage` doesn't even
pass the subject into it ([documents.ts:704](../src/services/platform/documents.ts#L704)).

### 2. Every routing rule is gated on `jobId != null`

`inferRouteSuggestions` ([ingestion.ts:173](../src/lib/platform/ingestion.ts#L173)) is a
**regex engine — no AI is involved in routing today**. Four rules, all job-gated
(`:190`, `:208`, `:227`, `:245`):

| Rule | Condition | Target |
|---|---|---|
| Invoice | `jobId != null` && classification `invoice` && amount found | cashflow |
| Quote | `jobId != null` && classification `quote` | procurement |
| Decision | `jobId != null` && `/approved\|confirmed\|selected\|decision\|proceed\|variation\|delay/i` | decision |
| Action | `jobId != null` && `/due\|lead time\|urgent\|follow up\|send\|issue/i` | action |

With no job id the text is never examined, and the routing block at `documents.ts:385` never runs.

### 3. Email is hardcoded to `correspondence`

`ingestInboundMessage` ([documents.ts:718](../src/services/platform/documents.ts#L718)) sets
`docType`/`classification` to `"correspondence"` unconditionally, so the invoice and quote rules can
**never** fire from the webhook path. Only the two keyword rules are reachable.

The demo text ("order 40 sheets of plasterboard for the Riverside job by Friday") matches neither
keyword set, and "Riverside" isn't a Sunridge job — so even with all three blockers removed, that
exact message yields nothing.

---

## Existing infrastructure to reuse

### The closest working analogue — copy this pattern

**`processMeetingMinutes`** ([minutes.ts:67](../src/services/platform/construction/minutes.ts#L67))
already does AI extraction → structured records, for meeting minutes:
`getPrompt("minutes.extract")` → `callClaude(...)` → strict JSON `{"actions":[{title,owner,dueDate}]}`
→ defensive parse/clamp (`:81-93`) → `createActions()` writes one row per item with
`sourceType: "meeting_minutes"`. Email extraction is the same shape with a wider output schema.

### AI client

`src/lib/claude.ts` is the single wrapper.

- `callClaude(system, user, {tools?, maxTokens?, model?})` at `:180`; `ChatResult = {content, tool_uses, demo_mode}`.
- Gated on **`ANTHROPIC_API_KEY`**; when absent every call returns canned demo output with
  `demo_mode: true`. **Callers must branch on it** (see `documents.ts:815`, `minutes.ts:79`).
- **No structured-output/JSON mode and no `tool_choice` plumbing.** Every extraction site does
  "prompt says strict JSON" + fenced-JSON parse in a try/catch. Tool use *is* supported.
- Errors are swallowed and returned as content strings (`:243-245`), never thrown.
- System prompts are sent with `cache_control: ephemeral` (`:227`). No response caching.
- Models via `modelFor(task)` ([modelRouter.ts:22](../src/lib/platform/modelRouter.ts#L22)) —
  `extraction` → sonnet-4-6, `classification` → haiku-4-5. Override with `PLATFORM_MODEL_<TASK>`.
- Prompts live in a versioned registry, `getPrompt(key, vars?)` ([prompts.ts:195](../src/lib/platform/prompts.ts#L195)).

### Proposal path (already correct — do not rebuild)

| Step | Where |
|---|---|
| `routeOperationalWrites(ctx, actor, suggestions, sourceDocumentId?)` | [documents.ts:253](../src/services/platform/documents.ts#L253) — the `createProposal` equivalent; sets `requireApproval: true` |
| `writeRecord(ctx, req)` | [recordWriter.ts:748](../src/lib/platform/recordWriter.ts#L748) — persists instead of writing when `requireApproval` |
| Store | Airtable `PENDING_WRITES` / `prisma.platPendingWrite`; TTL 7 days |
| Display | `approvals/page.tsx:211` — filters on `canApprove(role, tableKey) && inScope(scope, p.jobId)` |
| Resolve | `executeProposal` (`recordWriter.ts:991`) / `rejectProposal` (`:1165`) |

**Approval is already authority-aware:** `executor.ts:373` uses
`requireApproval: requiresApproval(ctx.aiAuthority, policy.risk)`, with
`AiAuthority = propose_only | approve_required | auto_low_risk` ([types.ts:8](../src/lib/platform/types.ts#L8)).
Reuse that rather than inventing a gate.

### Target tables already exist

`WritableTable` = `keyof typeof REGISTRY`, **25 keys** ([recordWriter.ts:437-465](../src/lib/platform/recordWriter.ts#L437))
including `action, decision, risk, variation_order, comms, plan, procurement, cashflow, vendor`.

`RouteSuggestion.table` is a **4-value subset**: `"cashflow" | "procurement" | "decision" | "action"`
([ingestion.ts:30](../src/lib/platform/ingestion.ts#L30)).

So **widening the routing vocabulary needs no new writer plumbing** — only the union and the
extraction schema. Airtable targets (all link to `Job`): `ISSUES` (primary field `Action_Name` —
this is what `action` maps to), `DECISIONS`, `RISKS`, `CHANGE_LOG` (variations; already has
`Is_AI_Drafted`/`AI_Draft`), `COMMS`, `PROCUREMENT`, `CASHFLOWS`, `PLAN`.

### Agent home

`ingestionAgent` ([agents/ingestion.ts:12](../src/services/platform/agents/ingestion.ts#L12)) is
module 2's agent, tools `["query_records","suggest_ingestion_routes"]`, **explicitly read-only by
design** ("proposes routes only; writing them is done via the normal gated tools"). The natural
home for an AI email→intent capability. `suggest_ingestion_routes` (`tools.ts:359`) is already a
read-only wrapper over `inferRouteSuggestions`.

---

## Bugs found and fixed on the way

1. **Airtable job ids never reached the proposal's `Job_Id` column.** `recordWriter.ts` only
   persisted `jobId` when `typeof data.jobId === "number"`, so `rec…` strings were dropped.
   Fixed with a separate `proposalJobId` that accepts either.
   **Correction to this plan's original claim:** the stated consequence — that RLS scoping of
   email-derived proposals would break — was **wrong**. `pendingWritesSource.ts` already falls
   back to `jobIdFromPayload(payload)` when the column is blank (both in `loadPendingWrites` and
   `loadProposedPendingCount`), so scoping worked all along. The real defect was a blank column
   in Airtable: bad data and an unfilterable view, not a security or correctness hole.
   **Follow-on (fixed):** the *read* side threw the project away too — `resolvePending`
   hardcoded `jobId: null` for Airtable and `PendingProposal.jobId` was typed `number | null`,
   so **every outbound event from an Airtable org carried no project** and n8n could not route
   on one. `PendingProposal` gained a `jobRef` (either backend's id) which is what
   `emitOutboundEvent` now sends; the numeric `jobId` stays for the execution-log Int column.
   The column-then-payload precedence is now one pure, tested helper (`proposalJobId`) shared by
   the approvals queue and the outbound emitter, instead of being written out twice.
2. **Case-sensitive job search in Postgres.** `search/route.ts` now passes
   `mode: "insensitive"`, matching the Airtable branch which lowercases both sides.
3. **(New, found during the build) Source links were silently erased.** `routeOperationalWrites`
   spread `suggestion.payload` *after* the injected `sourceType`/`sourceId`, and
   `inferRouteSuggestions` always emits `sourceId: undefined` (it is called without
   `sourceDocumentId`). The spread therefore overwrote the real document id with `undefined` on
   every routed action and decision. The injected fields now go last — the document *is* the
   source, so it wins.

---

## Target design

### Phase 1 — Project resolution from content (no AI)

New `resolveJobFromText(ctx, { subject, body, sender, explicitJobId })` in `src/lib/platform/`,
returning `{ jobId, jobName, strategy, confidence }`. Deterministic ladder:

1. **Explicit** — `jobId` in the webhook payload (the route already accepts it). Confidence 1.0.
2. **Name match** — normalised match of each `JOBS.Job_Name` against subject + body. Exact wins,
   then distinctive-token overlap ("Maleny Ridge" → "Maleny Ridge House"). Ambiguous → unresolved.
3. **Sender mapping** — a known vendor/client implies its project.
   **Correction:** this rung is **Postgres-only**, not the cross-backend step the plan assumed.
   It relies on `PlatJob.clientContactId`. The canonical Airtable schema has **no CONTACTS↔JOBS
   link in either direction** (`CONTACTS` links to `ORGANISATIONS`; `JOBS` links to `TEAM`), so
   there is nothing to join on. On Airtable the ladder degrades to name → single-job → General.
   Adding a `Job` link to `CONTACTS` would enable it, and is the cheapest way to strengthen
   resolution for Sunridge/Didi.
4. **Single-job org** — preserve today's behaviour (`General` doesn't count toward the total).
5. **General bucket** — the org's `General` job as an explicit last resort, flagged unassigned.

Extract the query from `search/route.ts:59-112` (both Airtable and Postgres branches exist there).
Keep the ladder pure and unit-testable. Then extend `resolveJobContext` to call it, and pass the
subject/body through from `ingestInboundMessage` (which today passes nothing).

### Phase 2 — AI intent extraction

New `extractEmailIntents(ctx, { subject, body, sender, job })` → `RouteSuggestion[]`, following the
`processMeetingMinutes` pattern exactly:

- Add a versioned key to `prompts.ts` (e.g. `email.extract`).
- `callClaude(system, body, { model: modelFor("extraction") })`.
- Strict-JSON prompt + fenced-JSON parse in try/catch, with per-field clamping.
- **`demo_mode` → fall back to today's `inferRouteSuggestions`.** Keeps tests hermetic and the path
  degrades rather than breaking when `ANTHROPIC_API_KEY` is absent.
- Return `RouteSuggestion[]` so **`routeOperationalWrites` is untouched**.

Each intent should carry a `confidence` and an `evidence` string (the sentence that justifies it),
threaded into `WriteRequest.rationale` — the executor already lifts `proposalReason` into
`rationale` at `executor.ts:142`, so there's a precedent.

Never auto-write from inbound email in the first release, whatever `aiAuthority` says.

### Phase 3 — Widen the vocabulary

Extend `RouteSuggestion.table` beyond the current four to include `risk`, `variation_order`, `comms`,
`plan`. Add `satisfies WritableTable` so the subset relationship is enforced — today nothing checks
it, and `documents.ts:270` passes the value straight through.

Watch out: `cashflow` is **Airtable-only, no Postgres delegate** (`recordWriter.ts:453`) and throws
in Postgres mode.

### Phase 4 — Surfacing and review

- Approvals UI: show source email, resolved project **and why** (strategy + confidence), and the
  evidence sentence per proposal.
- Decide handling for unresolved-project proposals (see open decisions).
- Consider also writing a `COMMS` row for the correspondence register, not only `DOCUMENTS`.

### Phase 5 — Learning loop

`LEARNING_RULES` and `CORRECTIONS` exist. When a reviewer re-assigns a proposal to a different
project, capture it as a correction so name matching improves.

---

## Open decisions

Resolved 2026-07-29 — see [Decisions taken](#decisions-taken-owner-2026-07-29) at the top.

One is still open: **cost ceiling per email**. With no noise filter, every inbound message —
newsletters, auto-replies, OOO — costs one sonnet-4-6 extraction call. Worth a look once real
volume is known; a header-based pre-filter is a few lines if it turns out to matter.

## What remains

1. **Live verification.** Nothing here has met a real email. The end-to-end assertion in the test
   plan below (email naming "Maleny Ridge House" → proposal against the right job, with
   `PENDING_WRITES.Job_Id` populated) has **not** been run.
2. **Browser eyeball of the approvals card.** The route compiles and returns a Clerk redirect
   when unauthenticated; the `SourceNote` block has not been seen rendered with real data.
3. **Phase 5 learning loop** — capture a reviewer's project re-assignment as a `CORRECTIONS`
   record so name matching improves. Not started.
4. **Prompt tuning against real correspondence.** `email.extract` is v1.0 and unexercised;
   expect the confidence calibration and the per-table field coverage to need a pass.
5. **Optional:** add a `Job` link to Airtable `CONTACTS` to switch on the sender rung (see above).

## Test plan

**Done** (28 tests, `jobResolver.test.ts` + `emailIntel.test.ts`):

- Unit: name matching — full name, partial name, case/punctuation, single-word names, word
  boundaries ("Woodlands" must not match "Woodlandsville"), generic words, ambiguity, `General`
  never matched by name, empty inputs. Pure, no network.
- Unit: `demo_mode` falls back to the keyword rules and carries the resolved job id.
- Unit: extraction mapping and clamping — field-name mapping per table, fenced JSON, derived
  procurement totals, confidence floor, unknown tables, missing required fields, malformed JSON,
  invalid dates dropped, out-of-range scores clamped, `cashflow` dropped on Postgres, money never
  marked paid.

**Not done** — the live assertion:

- Live: email `mac@aequilibri.com` naming "Maleny Ridge House" with an action; assert a proposal
  lands against the right job **and that `PENDING_WRITES.Job_Id` is populated**.
- Regression on real data: an email matching no project must land in `General` flagged
  unassigned, never on the wrong project. (The unit suite covers the matcher's half of this.)

## References

- Inbound plumbing/runbook: [`n8n/README.md`](../n8n/README.md), [`docs/n8n-automation-plan.md`](./n8n-automation-plan.md)
- Routing engine: [`src/lib/platform/ingestion.ts`](../src/lib/platform/ingestion.ts)
- Ingestion path: [`src/services/platform/documents.ts`](../src/services/platform/documents.ts)
- Pattern to copy: [`src/services/platform/construction/minutes.ts`](../src/services/platform/construction/minutes.ts)
- Write/propose path: [`src/lib/platform/recordWriter.ts`](../src/lib/platform/recordWriter.ts)
- Sunridge base `appoEUYcRkug8F3oO` (4 jobs, incl. `General`); control base `app51Tmrgab3QYP4Z`
