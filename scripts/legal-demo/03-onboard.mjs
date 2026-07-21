// Stage 3 — register the org (control plane) + seed its config (client base).
//
// Mirrors services/platform/onboarding.ts provisionOrganisation (control-plane
// branch) but as a standalone script, so the law firm becomes a real, resolvable
// org the running app will pick up:
//   CONTROL base  → PLAT_TEMPLATE_REGISTRY (Legal row), PLAT_ORG_REGISTRY (org),
//                   PLAT_TEAM (fee-earners), PLAT_JOB_CATALOG (legal matters)
//   CLIENT base   → DOMAIN_LABELS (legal vocab), ENGAGEMENT_TYPE_CONFIG,
//                   LEARNING_RULES (starter guidance), PLAT_CFG_SETTING (learning)
// Idempotent: skips a step whose rows already exist.

import { CONTROL_BASE, listAll, createAll, updateAll, loadState, mergeState, log } from "./_lib.mjs";
import { FIRM, LAWYERS, MATTER_CATALOG } from "./data.mjs";

const CONSTRUCTION_TEMPLATE = "appXfwBLE6zBEL5Zr";

const ENGAGEMENT_OPTION = {
  short_job: "Short Job", long_project: "Long Project",
  ongoing: "Ongoing Lifecycle", seasonal: "Seasonal Cycle",
};
const ALLOWED = ["short_job", "long_project", "ongoing"];
const DEFAULT_ENGAGEMENT = "long_project";

const FEATURES = {
  dashboard: true, jobs: true, assessments: true, budget: true, cashflow: true,
  chat: true, risks: true, variations: true, quotes: true, reports: true,
  meeting_minutes: true, documents: true, portal: true, accounting: false,
  bim: false, delay_cascade: false, procurement: false, room_matrix: false,
  project_plan: true, vendors: true, learning_rules: true,
};

const SETTINGS = JSON.stringify({
  assistant: {
    name: "Themis",
    persona:
      `You are Themis, the AI practice coordinator for ${FIRM.name}, a ${FIRM.city} commercial law firm. ` +
      `You help partners and solicitors manage matters end to end: track matter status and key dates, ` +
      `flag limitation dates and court deadlines, watch WIP and disbursements against budget, and surface ` +
      `risks early. Be precise, cite the matter, and never give legal advice to clients directly.`,
  },
  features: FEATURES,
  branding: { color: "#1e3a5f" },
});

const DOMAIN_LABELS = [
  ["JOBS", "Job_Name", "Matter", "The matter/file name (client + brief description)."],
  ["JOBS", "Description", "Matter summary", "Scope, parties and responsible practitioner."],
  ["JOBS", "Estimated_Value", "Estimated fees", "Estimated professional fees for the matter."],
  ["JOBS", "Actual_Value", "Billed / WIP", "Fees billed or work in progress to date."],
  ["JOBS", "Target_Completion", "Target resolution", "Target date to resolve or close the matter."],
  ["JOBS", "Status", "Matter status", "Where the matter sits in its lifecycle."],
  ["PHASES", "Phase_Name", "Stage", "A stage in the matter's lifecycle."],
  ["CONTACTS", "Contact_Name", "Client", "The client or party."],
  ["CASHFLOWS", "Cashflow_Name", "Fee / disbursement", "A fee invoice or disbursement on the matter."],
  ["BUDGET", "Budget_Category", "Cost category", "A category of matter cost (fees, counsel, experts…)."],
  ["RISKS", "Risk", "Matter risk", "A risk to the matter (costs, limitation, evidence…)."],
];

const LEARNING_RULES = [
  { code: "LRN-0001", type: "Constraint", name: "Diarise limitation dates on every new litigation matter",
    directive: "On opening any litigation or personal-injury matter, record the limitation date and set reminders at 6, 3 and 1 months before it." },
  { code: "LRN-0002", type: "Constraint", name: "Trust reconciliation before settlement",
    directive: "Do not mark a conveyancing or estate matter ready to settle until the trust ledger is reconciled and cleared funds are confirmed." },
  { code: "LRN-0003", type: "Domain", name: "Counsel brief lead time",
    directive: "Brief counsel at least 4 weeks before any hearing; flag matters where the hearing is inside 4 weeks and counsel is unbriefed." },
  { code: "LRN-0004", type: "Preference", name: "Fee estimate variance alerts",
    directive: "Alert the responsible partner when WIP on a fixed-fee matter exceeds 80% of the estimate." },
  { code: "LRN-0005", type: "Domain", name: "Conflict check on intake",
    directive: "Every new matter requires a conflict check against existing clients and opposing parties before work commences." },
];

async function upsertOrg(base, baseId) {
  const existing = await listAll(base, "PLAT_ORG_REGISTRY", { filterByFormula: `{Slug}='${FIRM.slug}'` });
  const maxId = (await listAll(base, "PLAT_ORG_REGISTRY", { fields: ["Org_Id"] }))
    .reduce((m, r) => Math.max(m, Number(r.fields.Org_Id) || 0), 0);
  const fields = {
    Slug: FIRM.slug, Name: FIRM.name, Vertical: FIRM.vertical,
    Default_Engagement_Type: DEFAULT_ENGAGEMENT,
    Allowed_Engagement_Types: JSON.stringify(ALLOWED),
    Ai_Authority: "approve_required", Settings: SETTINGS,
    Airtable_Base_Id: baseId, Is_Active: true,
  };
  if (existing.length) {
    await updateAll(base, "PLAT_ORG_REGISTRY", [{ id: existing[0].id, fields }]);
    log(`  = org registry updated (Org_Id ${existing[0].fields.Org_Id})`);
    return Number(existing[0].fields.Org_Id) || maxId;
  }
  const orgId = maxId + 1;
  await createAll(base, "PLAT_ORG_REGISTRY", [{ ...fields, Org_Id: orgId }]);
  log(`  + org registry created (Org_Id ${orgId})`);
  return orgId;
}

async function ensureTemplateRow(base) {
  const rows = await listAll(base, "PLAT_TEMPLATE_REGISTRY", { filterByFormula: `{Vertical_Key}='legal'` });
  if (rows.length) { log("  = template registry row exists"); return; }
  await createAll(base, "PLAT_TEMPLATE_REGISTRY", [{
    Industry: FIRM.industry, Sub_Industry: FIRM.subIndustry, Vertical_Key: FIRM.vertical,
    Template_Base_Id: CONSTRUCTION_TEMPLATE, Sort_Order: 30,
    Notes: "Legal vertical — demo. Clones the construction structure (Core) until a dedicated legal template is built.",
    Is_Active: true,
  }]);
  log("  + template registry row (Legal)");
}

async function ensureTeam(base) {
  const existing = await listAll(base, "PLAT_TEAM", { filterByFormula: `{Org_Slug}='${FIRM.slug}'` });
  const have = new Set(existing.map((r) => String(r.fields.Email || "").toLowerCase()));
  const rows = LAWYERS.map((l) => {
    const email = `${l.name.toLowerCase().replace(/[^a-z]+/g, ".")}@meridianlegal.com.au`;
    const role = l.title.includes("Managing") ? "owner" : "builder";
    return { Name: l.name, Org_Slug: FIRM.slug, Email: email, Role: role, Is_Active: true };
  }).filter((r) => !have.has(r.Email.toLowerCase()));
  if (!rows.length) { log(`  = team already present (${existing.length})`); return; }
  await createAll(base, "PLAT_TEAM", rows);
  log(`  + ${rows.length} team members`);
}

async function ensureJobCatalog(base) {
  const rows = await listAll(base, "PLAT_JOB_CATALOG", { filterByFormula: `{Vertical_Key}='legal'` });
  if (rows.length) { log(`  = job catalog exists (${rows.length})`); return; }
  const recs = MATTER_CATALOG.map((c, i) => ({
    Key: c.key, Vertical_Key: "legal", Label: c.label, Category_Group: c.group,
    Engagement_Type: c.engagementType, Scope_Hint: c.scopeHint,
    Phases: JSON.stringify(c.phases), Sort_Order: i, Source: "curated", Is_Active: true,
  }));
  await createAll(base, "PLAT_JOB_CATALOG", recs);
  log(`  + ${recs.length} legal matter categories`);
}

async function seedClientConfig(baseId) {
  // DOMAIN_LABELS (legal vocab)
  const existingLabels = await listAll(baseId, "DOMAIN_LABELS", { filterByFormula: `{Domain}='Legal'` });
  if (existingLabels.length) {
    log(`  = domain labels exist (${existingLabels.length})`);
  } else {
    const rows = DOMAIN_LABELS.map(([table, field, label, note], i) => ({
      Label_ID: `legal-${table}-${field}`.toLowerCase(), Core_Table: table, Core_Field_Label: field,
      Domain_Label: label, Domain: "Legal", Context_Note: note, Active: true,
    }));
    await createAll(baseId, "DOMAIN_LABELS", rows);
    log(`  + ${rows.length} domain labels`);
  }
  // ENGAGEMENT_TYPE_CONFIG
  const existingEng = await listAll(baseId, "ENGAGEMENT_TYPE_CONFIG");
  if (existingEng.length) {
    log(`  = engagement config exists (${existingEng.length})`);
  } else {
    const rows = ALLOWED.map((t) => ({
      Config_Name: `${ENGAGEMENT_OPTION[t]}${t === DEFAULT_ENGAGEMENT ? " (default)" : ""}`,
      Engagement_Type: ENGAGEMENT_OPTION[t], Active: true,
      Notes: "Seeded at onboarding (legal demo).",
    }));
    await createAll(baseId, "ENGAGEMENT_TYPE_CONFIG", rows);
    log(`  + ${rows.length} engagement types`);
  }
  // LEARNING_RULES (starter guidance)
  const existingRules = await listAll(baseId, "LEARNING_RULES");
  if (existingRules.length) {
    log(`  = learning rules exist (${existingRules.length})`);
  } else {
    const rows = LEARNING_RULES.map((r) => ({
      Instance: r.code, Rule_Name: r.name, Rule_Description: r.directive,
      Rule_Type: r.type, Rule_Status: "Published", Applies_To: "Owner Only",
      Operational_Directive: r.directive, Confidence_Level: 80,
      Taught_By: FIRM.admin.name, Override_Permission: true,
    }));
    await createAll(baseId, "LEARNING_RULES", rows);
    log(`  + ${rows.length} starter learning rules`);
  }
  // learning-engine settings
  const existingSettings = await listAll(baseId, "PLAT_CFG_SETTING");
  const haveKeys = new Set(existingSettings.map((r) => String(r.fields.Setting_Key || "")));
  const SETTINGS_ROWS = [
    ["learning.hypothesis_min_samples", "3"], ["learning.rule_min_samples", "5"],
    ["learning.auto_apply_min_confidence", "85"], ["learning.auto_apply_min_triggers", "50"],
  ].filter(([k]) => !haveKeys.has(k)).map(([Setting_Key, Value]) => ({ Setting_Key, Value }));
  if (SETTINGS_ROWS.length) { await createAll(baseId, "PLAT_CFG_SETTING", SETTINGS_ROWS); log(`  + ${SETTINGS_ROWS.length} learning settings`); }
}

async function main() {
  const { baseId } = loadState();
  if (!baseId) throw new Error("No baseId in state.json — run 01-provision.mjs first.");
  const control = CONTROL_BASE();
  log(`Onboarding "${FIRM.name}" (slug ${FIRM.slug}) → base ${baseId}, control ${control}`);

  log("Control plane:");
  await ensureTemplateRow(control);
  const orgId = await upsertOrg(control, baseId);
  await ensureTeam(control);
  await ensureJobCatalog(control);

  log("Client base config:");
  await seedClientConfig(baseId);

  mergeState({ orgId, slug: FIRM.slug });
  log(`\nDONE. Org ${FIRM.slug} (id ${orgId}) is registered and resolvable.`);
}

main().catch((e) => { console.error("\nONBOARD FAILED:", e.message); process.exit(1); });
