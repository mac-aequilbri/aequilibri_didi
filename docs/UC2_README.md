# UC2 — Dulong Downs / Didi AI Construction Coordinator

> **⚠️ Historical — the standalone UC2 module no longer exists.**
> UC2 has been folded into the shared **platform core**. "Dulong Downs / Didi" is now
> simply the `dulong-downs` **organisation** on the platform, reached through the UC3
> org picker at `/app` (there is no separate `/uc2` route or `Uc2*` database models
> anymore). Its "single long-project" dashboard comes generically from
> `engagementType: long_project`, not from any UC2-specific code.
> For current behaviour see [`PLATFORM_ARCHITECTURE.md`](PLATFORM_ARCHITECTURE.md) and the
> `src/app/(platform)/app/[org]/…` routes; the data layer is Airtable (system of record)
> when `AIRTABLE_MIGRATION`/`AIRTABLE_CONTROL_BASE_ID` are set, else Postgres.
> Everything below describes the retired standalone module and is kept for history only.

---

## What It Does

UC2 is a single-project construction coordinator for **Dulong Downs**, a residential build.
The module is purpose-built for one project (no multi-tenancy). Its centrepiece is **Didi**, an
AI assistant powered by Claude that answers questions about project data, drafts proposals for
budget/action/cashflow changes, and surfaces patterns as learnable hypotheses.

Key capabilities:

| Area | Description |
|---|---|
| Dashboard | Live metrics: phase progress, open/overdue actions, estimated budget, active rules, pending hypotheses, and a recent change log. |
| AI Chat (Didi) | Conversational interface. Didi reads the project database and proposes write operations; the user confirms or rejects each proposal before anything is persisted. |
| Actions | CRUD for `Uc2ActionHub` items (priority, owner, due date, category, zone, status). Status changes are recorded in `Uc2ChangeLog`. |
| Decisions | Record of project decisions with rationale, category, and status (draft / confirmed / superseded). |
| Procurement | Line-item purchase tracking (item, vendor, quantity, unit price, total, status). Status mutations logged in `Uc2ChangeLog`. |
| Project Phases | Ordered phases with completion percentage, start/end dates, and status. |
| Budget | Budget lines with estimated vs actual totals surfaced on the dashboard. |
| Cashflow | Time-series cash entries (projected vs actual). |
| Documents | Document metadata and file content storage. |
| Vendors | Vendor registry. |
| Room Matrix | Room-level planning matrix. |
| Change Log | Append-only log of every field mutation across all UC2 tables. |
| Learning Rules | Promoted rules that are injected verbatim into Didi's system prompt on every turn. Rules marked `cannotOverride` are labelled as critical constraints the AI must never breach. |
| Hypotheses | Patterns auto-extracted from Didi's chat responses; promoted to learning rules by a human. |

---

## How to Run

### Prerequisites

- Node.js 20+
- A PostgreSQL database **or** use the included SQLite dev database

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env` (already in the repo for local dev) and confirm these keys are present:

```
DATABASE_URL=         # PostgreSQL connection string (production)
                      # Omit to use SQLite dev.db automatically
ANTHROPIC_API_KEY=    # Claude API key — if absent, Didi runs in demo mode
```

### 3. Apply the database schema

```bash
# SQLite (local dev):
npm run db:dev:gen    # generates schema.dev.prisma and runs prisma generate

# PostgreSQL (production):
npm run db:push       # pushes schema.prisma to the database
npm run db:generate   # regenerates Prisma client
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000/uc2](http://localhost:3000/uc2).

### Demo mode (no API key)

If `ANTHROPIC_API_KEY` is not set, `callClaude` returns keyword-matched canned responses
(see `src/lib/claude.ts:158–206`). Didi still functions; all write flows work normally.

---

## Major Files

```
src/app/(uc2)/uc2/
  page.tsx                    Dashboard — parallel DB queries, renders metrics + phase table + change log
  layout.tsx                  UC2 layout wrapper
  actions.ts                  All Next.js Server Actions for UC2 (chat, CRUD, learning rules)
  chat/
    page.tsx                  Chat page — loads session, active rules, overdue items
    ChatClient.tsx            Client-side chat UI with confirm/reject proposal buttons
  decisions/
    page.tsx                  Decision list
    new/page.tsx              New decision form
  actions/
    page.tsx                  Action list
    new/page.tsx              New action form
    actions.ts                Action CRUD server actions
  procurement/
    page.tsx                  Procurement list
    new/page.tsx              New procurement form
  project-plan/page.tsx       Project plan view
  phases/page.tsx             Phase list
  budget/page.tsx             Budget summary
  cashflow/page.tsx           Cashflow table
  documents/page.tsx          Document list
  vendors/page.tsx            Vendor list
  room-matrix/page.tsx        Room matrix view
  change-log/page.tsx         Full change log
  learning-rules/
    page.tsx                  Rules list
    actions.ts                promoteHypothesis server action

src/lib/claude.ts             Shared Claude client (callClaude, callClaudeVision*)
src/lib/db.ts                 Prisma client singleton
src/lib/format.ts             currency(), formatDate() helpers used on the dashboard
prisma/schema.prisma          PostgreSQL schema — all Uc2* models defined here
prisma/schema.dev.prisma      SQLite schema for local development
```

---

## Request Flow

### Page render (dashboard example)

```
Browser GET /uc2
  → Next.js App Router renders src/app/(uc2)/uc2/page.tsx (server component)
  → Seven parallel Prisma queries (Promise.all):
      Uc2ActionHub.count (open/overdue)
      Uc2ProjectPhase.findMany
      Uc2Budget.findMany
      Uc2LearningRule.count (active)
      Uc2Hypothesis.count (pending)
      Uc2ChangeLog.findMany (last 5)
  → Returns fully-rendered HTML
```

### Chat message flow

```
User types a message and clicks Send
  → HTML <form action={sendMessage}> submits to server
  → actions.ts#sendMessage (Server Action):
      1. Resolve or create Uc2ChatSession (cookie didi_session_id)
      2. Persist user message → Uc2ChatMessage
      3. Load active Uc2LearningRule rows → append as "CRITICAL RULES" to system prompt
      4. Call callClaude(systemPrompt, userMessage, {maxTokens: 1500})
      5. detectProposal(aiResponse) — keyword scan for action verbs × data nouns
      6. Persist assistant message with hasProposal flag → Uc2ChatMessage
      7. Log to Uc2ExecutionLog (tool name, duration, session id)
      8. If response > 200 chars AND matches HYPOTHESIS_PATTERN regex → auto-create Uc2Hypothesis
      9. revalidatePath("/uc2/chat") → Next.js re-renders the chat page
```

### Proposal confirm/reject flow

```
User clicks Confirm on a flagged assistant message
  → confirmProposal Server Action:
      1. Set Uc2ChatMessage.proposalConfirmed = true
      2. Append entry to Uc2ChangeLog (field: proposalConfirmed, changedBy: "User")
      3. revalidatePath

Note: confirming a proposal marks it as accepted in the UI only.
      The actual data write (e.g. budget update) is NOT automatically executed by the app —
      the user must perform any downstream write manually.   ← ASSUMPTION: no write-back automation observed in the code.
```

### Action / Procurement status update

```
User changes status via a form on /uc2/actions or /uc2/procurement
  → updateActionStatus / updateProcurementStatus Server Action:
      1. Update the record
      2. Write old → new value to Uc2ChangeLog
      3. revalidatePath
```

---

## ML / AI Flow

### Model

`claude-opus-4-7` (hardcoded in `src/lib/claude.ts:7`). Single-turn, non-streaming.

### System prompt construction

On every `sendMessage` call the system prompt is assembled at runtime:

1. **Static preamble** — "You are Didi, the intelligent project management assistant for the
   Dulong Downs construction project … flag risks proactively … state what you intend to change."
2. **Active learning rules** — fetched from `Uc2LearningRule` where `isActive = true`, appended
   as `CRITICAL RULES (must never be overridden): LRN-XXXX: <description> [CANNOT OVERRIDE]`.

### Proposal detection

A simple heuristic in `detectProposal()` (actions.ts:73–78):

- Checks whether the AI response contains **any** action verb from
  `["update","change","set","write","modify","delete","create","add"]`
- AND **any** data noun from `["budget","action","cashflow","decision","procurement"]`.
- If both match → `hasProposal = true` on the stored message → UI shows amber "confirm?" banner.

### Hypothesis auto-extraction

After every assistant response longer than 200 characters, the regex
`/\b(should|recommend|suggest|consider|could|would|might|pattern|trend|learn|rule)\b/i`
is tested. On a match, the first 500 characters of the response are stored as a new
`Uc2Hypothesis` with `status = "pending"`.

### Hypothesis → Rule promotion

`promoteHypothesis` Server Action (learning-rules/actions.ts):

1. Reads the pending `Uc2Hypothesis`.
2. Generates a sequential rule code (`LRN-NNNN`).
3. Creates `Uc2LearningRule` (`isActive: true`, `cannotOverride: false`).
4. Marks the hypothesis `status = "promoted"`, records reviewer and timestamp.

The promoted rule is then injected into every subsequent Didi system prompt.

---

## Data Sources

| Source | Purpose | Where used |
|---|---|---|
| `prisma/schema.prisma` (PostgreSQL) | Primary data store for all UC2 entities | All server actions and page queries via `@/lib/db` |
| `prisma/dev.db` (SQLite) | Local development database | Dev environment only |
| `ANTHROPIC_API_KEY` | Claude API | `src/lib/claude.ts` — falls back to demo mode if absent |

There are no external construction data APIs in UC2. All project data is entered manually or
generated by Didi.

---

## Manual Checks / Operator Runbook

### Verifying the learning loop is working

1. Open `/uc2/learning-rules` — confirm active rules list is populated and rule codes are
   sequential (`LRN-0001`, `LRN-0002`, …).
2. Open `/uc2/chat` — check the right sidebar "Active Rules" panel shows the same rules Didi
   will receive in its system prompt.
3. To test hypothesis extraction: send a message like *"What pattern should we consider for
   concrete procurement?"* — Didi's response should trigger a new pending hypothesis. Check
   `/uc2/learning-rules` for it.

### Verifying the change log

After any action/procurement status change, open `/uc2/change-log` and confirm:
- `tableName`, `field`, `oldValue`, `newValue`, and `changedBy` are all populated.
- The dashboard "Recent Changes" card shows the last 5 entries in correct order.

### Checking execution logs

All `sendMessage` calls write to `Uc2ExecutionLog`. Query directly or check the
`/uc2/exec-log` page. Fields to review: `status`, `durationMs`, `sessionId`.

### Session management

Didi sessions are stored as `Uc2ChatSession` rows. The cookie `didi_session_id` (httpOnly,
24-hour max-age) identifies the active session. "New Session" button in the chat UI closes the
current session (`closedAt = now`) and clears the cookie.

---

## Known Risks & Limitations

Key: ✅ Fixed | ⚠ Open — mitigated | 🔴 Open — no fix yet

| Status | Risk | Detail |
|---|---|---|
| ✅ **Fixed** | **Proposal confirm was silently broken** | `confirmProposal` was reading `"message_id"` while the form sent `"msgId"`. `Number(null)` → `0` → no row ever updated. Fixed: server action now reads `"msgId"`. |
| ✅ **Fixed** | **Reject proposal was a no-op** | `rejectProposal` only called `revalidatePath`. The amber banner persisted forever. Fixed: now sets `hasProposal = false` (clears the banner) and writes a `Uc2ChangeLog` audit entry. |
| ✅ **Fixed** | **Orphan session created on every message** | `sendMessage` read `"session_key"` while the form sent `"sessionKey"`. A new `Uc2ChatSession` row was silently created on every send. Fixed: server action now reads `"sessionKey"`. |
| ✅ **Fixed** | **Decision creation not audited** | `createDecision` wrote no `Uc2ChangeLog` entry. Fixed: a changelog row is now written after every successful decision insert. |
| ✅ **Fixed** | **Learning rules injected unsanitised, no size cap** | All active rules were loaded and injected verbatim into the system prompt with no length limit per rule or total cap. A large rule set or a long description could overflow the context window or carry injection text. Fixed: capped at 20 most-recent active rules; each description truncated to 400 chars before injection. |
| ✅ **Fixed** | **`didi_session_id` cookie missing `Secure` and `SameSite`** | Cookie was set without `Secure` or `SameSite`, exposing it to HTTP interception and CSRF in production. Fixed: all three set-sites now include `secure: process.env.NODE_ENV === "production"` and `sameSite: "strict"`. |
| ✅ **Fixed** | **Duplicate `promoteHypothesis` with divergent logic** | `actions.ts` contained a dead export that generated `HYP-{id}-{timestamp}` rule codes and hardcoded `reviewedBy: "system"`. The page imports `learning-rules/actions.ts` (sequential `LRN-NNNN` codes). The dead export has been removed. |
| 🔴 **Open** | **Proposal confirm does not execute the described write** | Confirming a proposal sets `proposalConfirmed = true` on the message row only. No code path reads confirmed proposals and executes the implied data mutation. The user must make any described change manually. ← ASSUMPTION based on code review. |
| ⚠ **Mitigated** | **Rule promotion has no content validation** | `promoteHypothesis` creates a rule from raw hypothesis text with no schema or format check. A malformed or adversarial description could degrade Didi's responses. Mitigated by the 400-char cap on injection; the underlying text in the DB is still unvalidated. Review promoted rules before marking `cannotOverride = true`. |
| ⚠ **Mitigated** | **Hypothesis detection produces false positives** | `detectProposal` and the hypothesis regex are keyword-based. Any response containing a trigger verb + noun (e.g. "you should consider the procurement timeline") creates a hypothesis. Mitigated by requiring human promotion before a hypothesis becomes a rule. Review the hypotheses list regularly before promoting. |
| 🔴 **Open** | **No conversation history passed to Claude** | `sendMessage` passes only the single current user message. Didi has no memory of earlier turns in the same session. |
| 🔴 **Open** | **No authentication on any route** | Any user who can reach the server can read all project data, send messages as Didi, and promote hypotheses to rules. Requires an auth framework before production use. |
| 🔴 **Open** | **Single-project scope** | UC2 has no tenant or project isolation. All data is shared. Running two projects simultaneously requires a separate deployment or a schema extension. |
| 🔴 **Open** | **Demo mode responses persist as real data** | When `ANTHROPIC_API_KEY` is absent, `demoResponse()` returns canned text. These responses are written to `Uc2ChatMessage` and `Uc2ExecutionLog` identically to real AI output. Demo sessions should be identified and excluded from any analytics. |
