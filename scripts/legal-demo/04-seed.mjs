// Stage 4 — synthetic matter data for the law-firm demo.
//
// Generates a deterministic ~3-year, ~3000-matter history for Meridian Legal
// Group and writes it to the client base. Everything derives from a fixed SEED,
// so a given run always produces the same firm and each stage is resumable
// (progress checkpointed in state.json → re-run to continue after an interrupt).
//
//   node scripts/legal-demo/04-seed.mjs
//
// Phases: clients → matters (JOBS) → stages (PHASES, all matters) → rich subset
// (CASHFLOWS/BUDGET/RISKS/COMMS on recent matters) → org decisions → a few
// AI-proposed writes for the approvals inbox.

import { pathToFileURL } from "node:url";
import { listAll, createAll, loadState, saveState, log } from "./_lib.mjs";
import {
  FIRM, LAWYERS, MATTER_CATALOG, MATTER_WEIGHTS, SUBURBS, RISK_POOL, DISBURSEMENTS,
  disbursementBucket, DECISIONS_POOL, personName, companyName, matterTitleSubject,
} from "./data.mjs";
import { rng, isoDate, addDays, monthKey } from "./_lib.mjs";

export const SEED = 20260721;
export const TOTAL_MATTERS = 3000;
export const RICH_COUNT = 250; // most-recent matters that get billing/budget/risk/comms
export const TODAY = new Date("2026-07-21T00:00:00Z");
const START = addDays(TODAY, -3 * 365); // 3 years of history

const CAT_BY_KEY = Object.fromEntries(MATTER_CATALOG.map((c) => [c.key, c]));
export const ENGAGEMENT_OPTION = { short_job: "Short Job", long_project: "Long Project", ongoing: "Ongoing Lifecycle", seasonal: "Seasonal Cycle" };
const money = (r, [lo, hi]) => Math.round((lo + r.next() * (hi - lo)) / 50) * 50;

// ── deterministic generation ──────────────────────────────────────────────────
export function buildClients() {
  const r = rng(SEED ^ 0x11);
  const clients = [];
  for (let i = 0; i < 460; i++) {
    const isCompany = r.bool(0.32);
    const name = isCompany ? companyName(r) : personName(r);
    const suburb = r.pick(SUBURBS);
    clients.push({
      isCompany, name,
      email: `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}@${isCompany ? "example.com.au" : "gmail.com"}`,
      phone: `0${r.int(2, 4)} ${r.int(1000, 9999)} ${r.int(1000, 9999)}`,
      role: isCompany ? "Commercial client" : "Client",
      notes: `${isCompany ? "Corporate" : "Individual"} client · ${suburb}, NSW`,
      suburb,
    });
  }
  return clients;
}

export function weightedCatalog(r) {
  const pairs = MATTER_CATALOG.map((c) => [c.key, MATTER_WEIGHTS[c.key] ?? 10]);
  return CAT_BY_KEY[r.weighted(pairs)];
}

export function buildMatters(clients) {
  const r = rng(SEED ^ 0x22);
  const yearSeq = {};
  const matters = [];
  for (let i = 0; i < TOTAL_MATTERS; i++) {
    const cat = weightedCatalog(r);
    // Slight growth trend: bias open dates toward more recent (sqrt skew).
    const dayOffset = Math.floor(Math.pow(r.next(), 0.8) * (3 * 365 - 1));
    const openDate = addDays(START, dayOffset);
    const ageDays = Math.round((TODAY - openDate) / 86400000);
    const client = cat.group.match(/Corporate|Employment|Property & Conveyancing/) && r.bool(0.6)
      ? clients.filter((c) => c.isCompany)[r.int(0, Math.max(0, clients.filter((c) => c.isCompany).length - 1))]
      : r.pick(clients);
    const clientLabel = client.isCompany ? client.name.replace(/ (Pty Ltd|Holdings|Group)$/, "") : client.name.split(" ").slice(-1)[0];

    // Typical matter duration by engagement.
    const durDays = cat.engagementType === "short_job" ? r.int(20, 120)
      : cat.engagementType === "ongoing" ? r.int(180, 720) : r.int(120, 540);
    // Closed if it has aged well past its duration; ongoing rarely closes.
    const closeProb = cat.engagementType === "ongoing" ? 0.15 : Math.min(0.96, ageDays / (durDays + 60));
    const isClosed = r.next() < closeProb && ageDays > durDays * 0.6;

    const year = openDate.getUTCFullYear();
    yearSeq[year] = (yearSeq[year] ?? 0) + 1;
    const ref = `M${year}-${String(yearSeq[year]).padStart(4, "0")}`;
    const subject = matterTitleSubject(r, cat, clientLabel);
    const lawyer = LAWYERS.find((l) => l.area === cat.group) ?? r.pick(LAWYERS);

    const estValue = money(r, cat.fee);
    let status, completed = null, actValue = null, variancePct = null, rag;
    if (isClosed) {
      const outcome = r.weighted([["Won", 3], ["Settled", 5], ["Completed", 6], ["Discontinued", 1], ["Lost", 1]]);
      status = `Closed – ${outcome}`;
      completed = addDays(openDate, Math.min(ageDays, Math.round(durDays * (0.8 + r.next() * 0.6))));
      actValue = Math.round((estValue * (0.82 + r.next() * 0.5)) / 50) * 50;
      variancePct = Math.round(((actValue - estValue) / estValue) * 100);
      rag = "Green";
    } else {
      status = r.weighted([["Active", 6], ["In Discovery", 2], ["Awaiting Court", 2], ["In Mediation", 1], ["On Hold", 1], ["Intake", 1]]);
      rag = r.weighted([["Green", 6], ["Amber", 3], ["Red", 1]]);
    }
    const target = addDays(openDate, durDays);

    matters.push({
      i, ref, cat, client, clientLabel, lawyer, subject, openDate, target, completed,
      isClosed, status, estValue, actValue, variancePct, rag, ageDays, durationDays: durDays,
    });
  }
  return matters;
}

export function jobFields(m) {
  const summary =
    `${m.cat.label} matter for ${m.client.name}. Responsible: ${m.lawyer.name} (${m.lawyer.title}). ` +
    `${m.cat.scopeHint}`;
  const f = {
    Job_Name: `${m.ref} — ${m.subject}`,
    Description: summary,
    Status: m.status,
    Engagement_Type: ENGAGEMENT_OPTION[m.cat.engagementType],
    Estimated_Value: m.estValue,
    Date_Estimated: isoDate(m.openDate),
    Target_Completion: isoDate(m.target),
    Estimated_Summary: `Estimated fees $${m.estValue.toLocaleString()} for ${m.cat.label.toLowerCase()}.`,
  };
  if (m.isClosed) {
    f.Date_Completed = isoDate(m.completed);
    f.Actual_Value = m.actValue;
    f.Variance_Percent = m.variancePct;
    f.Actual_Summary = `Matter closed (${m.status.replace("Closed – ", "")}). Final fees $${m.actValue.toLocaleString()} (${m.variancePct >= 0 ? "+" : ""}${m.variancePct}% vs estimate).`;
    f.Outcome = m.status.replace("Closed – ", "");
  }
  return f;
}

export function phaseRows(m, jobId) {
  const r = rng(SEED ^ 0x33 ^ (m.i * 2654435761));
  const phases = m.cat.phases;
  const n = phases.length;
  // How far along: closed = 100%, else a point through the sequence.
  const progress = m.isClosed ? 1 : Math.min(0.95, Math.max(0.08, m.ageDays / m.durationDays));
  const currentIdx = m.isClosed ? n : Math.min(n - 1, Math.floor(progress * n));
  const per = Math.max(7, Math.round(m.durationDays / n));
  return phases.map((name, idx) => {
    let status, pct, rag;
    if (idx < currentIdx) { status = "Complete"; pct = 100; rag = "Green"; }
    else if (idx === currentIdx && !m.isClosed) {
      status = "In Progress"; pct = r.int(20, 80);
      rag = r.weighted([["Green", 5], ["Amber", 3], ["Red", 1]]);
    } else { status = "Not Started"; pct = 0; rag = "Green"; }
    const start = addDays(m.openDate, idx * per);
    const end = idx < currentIdx ? addDays(start, Math.round(per * (0.6 + r.next() * 0.6))) : null;
    const row = {
      Phase_Name: name, Sequence: idx + 1, Sort_Order: idx + 1, Status: status,
      Completion_Pct: pct, RAG: rag, Is_AI_Draft: false, Start_Date: isoDate(start), Job: [jobId],
    };
    if (end) row.End_Date = isoDate(end);
    return row;
  });
}

// ── rich related records (recent matters only) ────────────────────────────────
export function cashflowRows(m, jobId) {
  const r = rng(SEED ^ 0x44 ^ (m.i * 40503));
  const rows = [];
  // Fee invoices (income) — progress billing.
  const nInv = m.isClosed ? r.int(2, 4) : r.int(1, 3);
  const billed = m.isClosed ? m.actValue : Math.round(m.estValue * (0.3 + r.next() * 0.4));
  for (let k = 0; k < nInv; k++) {
    const d = addDays(m.openDate, Math.round((m.durationDays / nInv) * (k + 1) * (0.6 + r.next() * 0.4)));
    if (d > TODAY) continue;
    const amt = Math.round(billed / nInv / 10) * 10;
    const paid = m.isClosed || d < addDays(TODAY, -35);
    rows.push({
      Cashflow_Name: `${m.ref} · Fee invoice ${k + 1}`, Type: "In", Amount: amt,
      Source_Or_Payee: m.client.name, Category: "Professional fees",
      Status: paid ? "Paid" : "Confirmed", Period: monthKey(d),
      Notes: `Progress fee invoice for ${m.cat.label.toLowerCase()}.`, Job: [jobId],
    });
  }
  // Disbursements (expenses).
  const bucket = DISBURSEMENTS[disbursementBucket(m.cat.group)];
  for (const [label, lo, hi] of r.picks(bucket, r.int(1, Math.min(3, bucket.length)))) {
    const d = addDays(m.openDate, r.int(5, Math.max(6, m.durationDays)));
    if (d > TODAY) continue;
    rows.push({
      Cashflow_Name: `${m.ref} · ${label}`, Type: "Out", Amount: money(r, [lo, hi]),
      Source_Or_Payee: label, Category: "Disbursement",
      Status: d < addDays(TODAY, -20) ? "Paid" : "Confirmed", Period: monthKey(d),
      Notes: "Disbursement.", Job: [jobId],
    });
  }
  return rows;
}

export function budgetRows(m, jobId) {
  const r = rng(SEED ^ 0x55 ^ (m.i * 2246822519));
  const cats = [["Professional fees", 0.6], ["Disbursements", 0.15]];
  if (m.cat.group.startsWith("Litigation") || m.cat.group.startsWith("Criminal")) cats.push(["Counsel / barrister", 0.22]);
  if (m.cat.group.startsWith("Personal")) cats.push(["Medical & experts", 0.2]);
  return cats.map(([name, frac]) => {
    const est = Math.round((m.estValue * frac) / 50) * 50;
    const forecast = Math.round((est * (0.9 + r.next() * 0.35)) / 50) * 50;
    const rag = forecast > est * 1.15 ? "Red" : forecast > est * 1.02 ? "Amber" : "Green";
    return { Budget_Category: name, Estimated: est, Forecast: forecast, RAG: rag, Notes: `${name} budget for ${m.ref}.`, Job: [jobId] };
  });
}

export function riskRows(m, jobId) {
  const r = rng(SEED ^ 0x66 ^ (m.i * 374761393));
  const pool = RISK_POOL[m.cat.group] ?? RISK_POOL["Litigation & Dispute Resolution"];
  return r.picks(pool, r.int(1, Math.min(3, pool.length))).map((desc) => {
    const like = r.int(2, 5), imp = r.int(2, 5);
    const rag = like + imp >= 8 ? "Red" : like + imp >= 6 ? "Amber" : "Green";
    return {
      Risk: desc, Likelihood: like, Impact: imp, RAG: rag,
      Status: m.isClosed ? "Closed" : r.weighted([["Open", 4], ["Mitigated", 2]]),
      Mitigation: "Monitored by the responsible practitioner; reviewed at each matter update.",
      Category: m.cat.group, Owner: m.lawyer.name, Created_By_AI: r.bool(0.3), Job: [jobId],
    };
  });
}

export function commsRows(m, jobId) {
  const r = rng(SEED ^ 0x77 ^ (m.i * 3266489917));
  const opts = [
    ["Matter status update to client", "Status Update", "Owner"],
    ["Upcoming court/filing deadline", "Action Required", "Regulatory"],
    ["Request for further instructions/documents", "Action Required", "Owner"],
    ["Settlement / offer to be considered", "Approval Request", "Owner"],
  ];
  return r.picks(opts, r.int(1, 2)).map(([topic, type, role]) => {
    const due = addDays(TODAY, r.int(-20, 25));
    return {
      Comms_Name: `${m.ref} · ${topic}`, Topic: `${topic} — ${m.subject}`, Message_Type: type,
      Stakeholder_Role: role, Status: due < TODAY ? "Sent" : "Pending",
      Due_Date: isoDate(due), Job: [jobId],
    };
  });
}

export function documentRows(m, jobId) {
  const r = rng(SEED ^ 0x88 ^ (m.i * 668265263));
  const byGroup = {
    "Litigation & Dispute Resolution": ["Statement of Claim", "Advice on prospects", "Affidavit in support"],
    "Property & Conveyancing": ["Contract for Sale", "Section 149 certificate", "Settlement statement"],
    "Corporate & Commercial": ["Share sale agreement", "Due diligence report", "Shareholders agreement"],
    "Family Law": ["Financial statement", "Consent orders", "Parenting plan"],
    "Wills, Estates & Probate": ["Will", "Grant of probate", "Estate inventory"],
    "Employment & Workplace": ["Employment advice", "Investigation report", "Settlement deed"],
    "Criminal Law": ["Brief of evidence", "Character references", "Sentencing submissions"],
    "Personal Injury & Insurance": ["Medico-legal report", "Statement of particulars", "Settlement offer"],
  };
  const docs = byGroup[m.cat.group] ?? ["Advice"];
  return r.picks(docs, r.int(1, 2)).map((name) => ({
    Document_Name: `${m.ref} · ${name}`, Document_Type: name.match(/Contract|agreement|deed|Will/) ? "Contract" : name.match(/report|advice|submission/i) ? "Report" : "Legal",
    Doc_Status: "Active", Uploaded_By: m.lawyer.name, Upload_Date: new Date(m.openDate.getTime() + 3 * 86400000).toISOString(),
    Text_Content: `${name} for matter ${m.ref} (${m.subject}).`, Job: [jobId],
  }));
}

// ── orchestration (resumable) ─────────────────────────────────────────────────
async function main() {
  const state = loadState();
  const baseId = state.baseId;
  if (!baseId) throw new Error("No baseId in state.json — run 01-provision.mjs first.");

  const clients = buildClients();
  const matters = buildMatters(clients);
  // Rich subset = a spread that actually has billing history: the most recent
  // ACTIVE matters (dashboard/approvals) + recently CLOSED matters (full fee
  // lifecycle). Brand-new matters have few past invoices, so we favour ones aged
  // enough to have some.
  const activeRich = matters.filter((m) => !m.isClosed && m.ageDays >= 21).sort((a, b) => b.openDate - a.openDate);
  const closedRich = matters.filter((m) => m.isClosed && m.ageDays <= 540).sort((a, b) => b.completed - a.completed);
  const rich = [...activeRich.slice(0, Math.round(RICH_COUNT * 0.68)), ...closedRich.slice(0, RICH_COUNT)].slice(0, RICH_COUNT);
  const richSet = new Set(rich.map((m) => m.i));

  const counts = { open: matters.filter((m) => !m.isClosed).length, closed: matters.filter((m) => m.isClosed).length };
  log(`Firm: ${FIRM.name}  |  ${matters.length} matters (${counts.open} open, ${counts.closed} closed)  |  rich: ${richSet.size}`);

  // Phase 1 — clients.
  if (!state.contactsDone) {
    log("→ clients (CONTACTS)…");
    await createAll(baseId, "CONTACTS", clients.map((c) => ({
      Contact_Name: c.name, Email: c.email, Phone: c.phone, Role: c.role, Notes: c.notes,
    })), { onProgress: (d, t) => (d % 100 === 0 || d === t) && log(`   contacts ${d}/${t}`) });
    state.contactsDone = true; saveState(state);
  } else log("= clients already seeded");

  // Phase 2 — matters (JOBS). jobIds[i] aligns to matters[i].
  state.jobIds = state.jobIds ?? [];
  if (state.jobIds.length < matters.length) {
    log(`→ matters (JOBS) from ${state.jobIds.length}…`);
    for (let i = state.jobIds.length; i < matters.length; i += 50) {
      const slice = matters.slice(i, i + 50);
      const created = await createAll(baseId, "JOBS", slice.map(jobFields));
      state.jobIds.push(...created.map((r) => r.id));
      saveState(state);
      if (i % 500 === 0 || i + 50 >= matters.length) log(`   matters ${state.jobIds.length}/${matters.length}`);
    }
  } else log("= matters already seeded");

  // Phase 3 — stages (PHASES) for ALL matters.
  state.phasesUpTo = state.phasesUpTo ?? 0;
  if (state.phasesUpTo < matters.length) {
    log(`→ stages (PHASES) from matter ${state.phasesUpTo}…`);
    for (let i = state.phasesUpTo; i < matters.length; i++) {
      await createAll(baseId, "PHASES", phaseRows(matters[i], state.jobIds[i]));
      state.phasesUpTo = i + 1;
      if (i % 200 === 0 || i + 1 === matters.length) { saveState(state); log(`   phases: matter ${state.phasesUpTo}/${matters.length}`); }
    }
    saveState(state);
  } else log("= phases already seeded");

  // Phase 4 — rich related records for the recent subset.
  const richList = matters.filter((m) => richSet.has(m.i));
  state.richUpTo = state.richUpTo ?? 0;
  if (state.richUpTo < richList.length) {
    log(`→ rich records (CASHFLOWS/BUDGET/RISKS/COMMS/DOCUMENTS) from ${state.richUpTo}/${richList.length}…`);
    for (let k = state.richUpTo; k < richList.length; k++) {
      const m = richList[k];
      const jobId = state.jobIds[m.i];
      await createAll(baseId, "CASHFLOWS", cashflowRows(m, jobId));
      await createAll(baseId, "BUDGET", budgetRows(m, jobId));
      await createAll(baseId, "RISKS", riskRows(m, jobId));
      await createAll(baseId, "COMMS", commsRows(m, jobId));
      await createAll(baseId, "DOCUMENTS", documentRows(m, jobId));
      state.richUpTo = k + 1;
      if (k % 25 === 0 || k + 1 === richList.length) { saveState(state); log(`   rich: ${state.richUpTo}/${richList.length}`); }
    }
    saveState(state);
  } else log("= rich records already seeded");

  // Phase 5 — org-level strategic decisions.
  if (!state.decisionsDone) {
    log("→ decisions…");
    const r = rng(SEED ^ 0x99);
    await createAll(baseId, "DECISIONS", DECISIONS_POOL.map(([name, type, desc]) => {
      const d = addDays(TODAY, -r.int(20, 900));
      return {
        Decision_Name: name, Decision_Description: desc, Decision_Type: type,
        Decision_Date: d.toISOString(), Status: r.weighted([["Made", 5], ["Pending", 2]]),
        Rationale: desc, Notes: "Partner meeting.",
      };
    }));
    state.decisionsDone = true; saveState(state);
  } else log("= decisions already seeded");

  // Phase 6 — a few AI-proposed writes for the approvals inbox.
  if (!state.pendingDone) {
    log("→ approvals inbox (PENDING_WRITES)…");
    const r = rng(SEED ^ 0xaa);
    const openMatters = matters.filter((m) => !m.isClosed && richSet.has(m.i)).slice(0, 6);
    const now = TODAY.toISOString();
    const expires = addDays(TODAY, 7).toISOString();
    await createAll(baseId, "PENDING_WRITES", openMatters.map((m) => ({
      Table_Key: "risk", Op: "create", Payload: JSON.stringify({
        description: `AI-suggested risk for ${m.ref}: ${r.pick(RISK_POOL[m.cat.group] ?? RISK_POOL["Litigation & Dispute Resolution"])}`,
        likelihood: r.int(2, 5), impact: r.int(2, 5), jobId: state.jobIds[m.i],
      }),
      Actor_Type: "ai", Actor_Name: "Themis", Status: "proposed",
      Created_At: now, Expires_At: expires, Job_Id: state.jobIds[m.i],
    })));
    state.pendingDone = true; saveState(state);
  } else log("= approvals already seeded");

  log(`\nDONE. Seed complete for ${FIRM.name} (base ${baseId}).`);
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMain) {
  main().catch((e) => { console.error("\nSEED FAILED:", e.message); saveState(loadState()); process.exit(1); });
}
