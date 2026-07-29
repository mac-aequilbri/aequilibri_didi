# n8n Automation Plan — aequilibri integration layer

Status: **plan** for building the n8n side of the integration layer shipped in commit `e411bfc`
(inbound webhook, connection registry, outbound outbox, retry/DLQ). Target: **n8n Cloud**,
first channel **Gmail / Google Workspace**.

## The division of responsibility (non-negotiable design)

> **n8n owns transport + credentials. The platform owns the event contract + config intent.**

The platform **never** stores a client's Gmail token or mailbox password. Those live in n8n's
encrypted credential store. Our app stores only: (1) a *connection row* saying "email-in is enabled
for org X", and (2) the signed webhook contract / the `PLAT_OUTBOX` table.

Consequence — the two workflow shapes are asymmetric:
- **Inbound = one workflow per client** (each mailbox has its own OAuth credential).
- **Outbound = one shared workflow for all clients** (a single trigger on the shared `PLAT_OUTBOX`,
  routed by `Org_Slug`).

## Prerequisites on the platform side (do these first)

1. ✅ Deploy is live (`e411bfc` on `aequilibri-next.onrender.com`).
2. ✅ **Run the control-base table scripts** — done 2026-07-20 (`PLAT_CONNECTIONS` + `PLAT_OUTBOX`
   created in the control base).
3. ✅ (pilot org) **Set the per-org webhook secret.** Done 2026-07-20 for `dulong-downs-didi` via
   `settings.webhookSecret` in `PLAT_ORG_REGISTRY`; verified live (prod endpoint moved 503→401).
   Other orgs: script/Airtable only, or the global `PLATFORM_WEBHOOK_SECRET` fallback on Render.
   **Gap:** no rotate-from-UI yet (see "Platform work needed" below).
4. ✅ (pilot org) **Create connection rows** — `dulong-downs-didi:email:in` created + active
   2026-07-20. Other orgs via `/app/<org>/integrations`; an `email / out` row later enables outbound.
5. **Set `CRON_SECRET` on Render** — still unset as of 2026-07-20, which disables the scheduler
   endpoint and therefore the outbox retry/DLQ sweep (and the legacy pull ingestion).

## Workflow A — Inbound Gmail → webhook (per client; a template to duplicate)

**Ready to import: [`n8n/workflow-a-inbound-email.json`](../n8n/workflow-a-inbound-email.json).**
Import it rather than hand-building — it encodes all four gotchas below.

**Nodes:**
1. **Manual test trigger** — lets you prove signing + transport *before* a Gmail credential exists.
   When no Gmail item is present the Code node emits a synthetic message instead.
2. **Gmail Trigger** — credential = *this client's* Gmail OAuth2. Event: "Message Received". (Poll
   interval per n8n Cloud minimums.)
3. **Code node** — builds the normalized payload and the string to sign. Emits `rawBody` (the exact
   bytes to send), `ts`, and `signBase = ${ts}.${rawBody}`. **No `require('crypto')`** — see gotcha 2.
4. **Crypto node** — action `HMAC`, type `SHA256`, value `{{ $json.signBase }}`, secret
   `{{ $vars.AEQ_SECRET_DULONG }}`, output property `signature`, encoding `hex`.
5. **HTTP Request** — `POST https://aequilibri-next.onrender.com/api/platform/hooks`.

**The four gotchas** (each one silently produces a 401, which is why they're worth naming):

1. **Body must be "Raw" mode**, content `{{$json.rawBody}}`, type `application/json`. NOT "JSON"
   mode — that re-serializes and invalidates the signature. This is the #1 failure mode.
2. **`require('crypto')` is unreliable in Code nodes on n8n Cloud** (sandboxed built-ins). Use the
   built-in **Crypto node** for the HMAC instead — that's why the shape above has 5 nodes, not 3.
3. **`$env` is blocked on n8n Cloud.** Use **Variables** (`$vars.AEQ_SECRET_DULONG`), created under
   Overview → Variables. Confirmed available on this instance's plan (2026-07-29).
4. **The org slug is `dulong-downs-didi`, not `dulong-downs`.** An earlier draft of this doc had the
   short form; `dulong-downs` is a *different* seeded org with no webhook secret and no connection
   row, so it fails 503/403 rather than obviously.

Set the HTTP node's response options to `fullResponse` + `neverError` so a 4xx surfaces as readable
output (status + body) instead of a red node — much faster to debug than "Continue on Fail".

**Per-client variables** (the only things that change when duplicating): the Gmail credential, the
`ORG_SLUG` constant in the Code node, and the `$vars` secret name.

**Attachments (phase 1b):** add a step to base64-encode Gmail binary attachments into
`payload.attachments = [{name, mimeType, contentBase64}]` before signing. Skip for the first pass.

**What the platform does with it:** verifies HMAC + timestamp (±300s) → checks the `email/in`
connection is active (else 403) → dedups on `email:<messageId>` → runs the ingestion pipeline
(classify → route to approval-gated proposals) → stamps connection health.

## Workflow B — Outbound `PLAT_OUTBOX` → Gmail (single, shared across all orgs)

**Nodes:**
1. **Schedule Trigger** — every 2–5 min. (More reliable than the Airtable Trigger for a
   status-queue, and it uniformly picks up both newly-enqueued and scheduler-re-driven `pending`
   rows.)
2. **Airtable — Search** — control base, `PLAT_OUTBOX`, `filterByFormula = {Status}='pending'`.
3. **Airtable — Search** (per row) — `PLAT_CONNECTIONS` where `Org_Slug` = row's org, `Direction=out`,
   `Is_Active=1` → gives the delivery target + credential pointer. (If none, skip — the platform
   shouldn't have enqueued, but be defensive.)
4. **Gmail — Send** — to the resolved recipient; subject/body from the outbox `Summary` + a deep link
   back into the app. Sender credential: **one platform Gmail** (e.g. `noreply@aequilibri`) for MVP.
5. **Airtable — Update** `PLAT_OUTBOX`: on success `Status=delivered`, `Delivered_At=now`; on failure
   `Status=failed`, `Attempts = Attempts+1`, `Last_Error=<msg>`. The platform's scheduler then
   re-drives `failed` rows (`<5 attempts → pending`, else `dead`).

**Open decision (flag before building B): where does the recipient come from?** The outbox event
(`report.ready` for org X) does not carry a "send to" address. Options:
- **(recommended)** add a `Destination` field to `PLAT_CONNECTIONS` (small script edit) — the `out`
  row holds the target address/channel;
- MVP shortcut: reuse the connection `Notes` field as the destination;
- resolve from the org's team/contact record.
Pick one before building B.

## Instance state (checked 2026-07-29)

`https://aequilibri.app.n8n.cloud` — n8n Cloud 2.31.5. **Zero workflows**; one credential
(`n8n free OpenAI API credits`), no Gmail and no Airtable credential yet. Variables are available on
the plan. So Workflows A and B are both still unbuilt: the platform half is live, the n8n half is empty.

Platform side verified the same day: `/api/platform/hooks` returns 401 to an unsigned POST (endpoint
live, pilot secret set); `/api/platform/scheduler` returns 503, i.e. **`CRON_SECRET` is still unset on
Render** — which keeps the outbox retry/DLQ sweep off and blocks Phase 2.

## Phasing

- **Phase 1 — prove inbound (pilot):** Workflow A for one org (`dulong-downs-didi`) end-to-end on Render.
  Validates the signed webhook, default-deny, dedup, and health stamping on real infra (none of the
  `/api` paths were locally testable). Success = an inbound email creates a document + proposals, and
  the connection's "Last event" updates.
- **Phase 2 — prove outbound:** Workflow B (shared). Resolve the recipient decision first. Success =
  approving a proposal / sending a report drops a `pending` row that n8n delivers and marks
  `delivered`; kill delivery to see the scheduler re-drive `failed` → `pending` → `dead`.
- **Phase 3 — breadth:** Slack/Teams outbound (same trigger, different send node), Drive-folder
  inbound (`channel=drive`), email attachments.

## Platform work needed to make this fully self-serve (not blocking Phase 1–2)

- **Webhook-secret UI** on `/app/<org>/integrations` — generate/rotate the per-org secret (calls the
  existing `setOrgWebhookSecret`), so onboarding a client doesn't need a script run.
- **`Destination` field** on `PLAT_CONNECTIONS` for outbound routing (Phase 2 decision above).
- **Per-client Drive storage** (only if a client needs files in *their own* Drive) — today our
  storage is one service-account Drive segregated by `<orgSlug>/` subfolders, not per-client Drives.

## Per-client onboarding runbook (once workflows exist)

1. In `/app/<org>/integrations`: add `email / in` (and `email / out` if outbound) connection rows.
2. Set the org's webhook secret (script today; UI later).
3. In n8n: duplicate Workflow A, connect the client's Gmail credential, set `orgSlug` + secret, enable.
4. Send a test email → confirm a document + proposals appear and "Last event" updates.
5. (Outbound) confirm an approved proposal / sent report is delivered and marked `delivered`.
