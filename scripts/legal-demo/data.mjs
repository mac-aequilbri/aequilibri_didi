// Domain data + generators for the law-firm demo. All content is hand-authored
// pools; volume comes from combining them with the seeded PRNG in _lib.mjs, so a
// given SEED always produces the same firm. Australian commercial law firm.

export const FIRM = {
  name: "Meridian Legal Group",
  slug: "meridian-legal",
  vertical: "legal",
  industry: "Legal",
  subIndustry: "Commercial & Litigation",
  city: "Sydney",
  admin: { name: "Priya Nair", email: "priya.nair@meridianlegal.com.au", role: "owner" },
};

// Fee-earners (partners, senior associates, solicitors). Used in matter
// descriptions ("Responsible: …"), risk owners, comms senders, and the PLAT_TEAM.
export const LAWYERS = [
  { name: "Priya Nair", title: "Managing Partner", area: "Corporate & Commercial" },
  { name: "Daniel Okafor", title: "Partner", area: "Litigation & Dispute Resolution" },
  { name: "Sophie Laurent", title: "Partner", area: "Property & Conveyancing" },
  { name: "Marcus Webb", title: "Partner", area: "Family Law" },
  { name: "Aisha Rahman", title: "Senior Associate", area: "Employment & Workplace" },
  { name: "Tom Callaghan", title: "Senior Associate", area: "Litigation & Dispute Resolution" },
  { name: "Grace Lim", title: "Senior Associate", area: "Wills, Estates & Probate" },
  { name: "Hugo Ferreira", title: "Associate", area: "Corporate & Commercial" },
  { name: "Elena Petrova", title: "Associate", area: "Criminal Law" },
  { name: "James Whitfield", title: "Associate", area: "Personal Injury & Insurance" },
  { name: "Nadia Haddad", title: "Solicitor", area: "Property & Conveyancing" },
  { name: "Oliver Chen", title: "Solicitor", area: "Litigation & Dispute Resolution" },
];

const FIRST = [
  "James", "Olivia", "William", "Charlotte", "Jack", "Amelia", "Noah", "Isla", "Thomas",
  "Mia", "Henry", "Grace", "Lucas", "Chloe", "Oliver", "Sophia", "Ethan", "Ava", "Liam",
  "Ella", "Alexander", "Zoe", "Benjamin", "Lily", "Samuel", "Ruby", "Daniel", "Evelyn",
  "Nathan", "Harper", "Ryan", "Sofia", "Rahul", "Priya", "Wei", "Mei", "Ahmed", "Fatima",
  "Kai", "Anika", "Diego", "Lucia", "Sione", "Aroha", "Marco", "Elena",
];
const LAST = [
  "Smith", "Nguyen", "Williams", "Brown", "Wilson", "Taylor", "Johnson", "Martin", "Lee",
  "Walker", "Kelly", "Ryan", "Robinson", "Anderson", "Thompson", "White", "Harris", "Patel",
  "Singh", "Chen", "Wang", "Kumar", "Murphy", "O'Brien", "Campbell", "Clarke", "Edwards",
  "Fletcher", "Grant", "Hughes", "Ivanov", "Jensen", "Khan", "Lombardi", "Mercer", "Novak",
  "Osei", "Petersen", "Quinn", "Reyes", "Santos", "Tanaka", "Ur", "Vasquez", "Webb", "Xu",
];
const COMPANY_HEAD = [
  "Harbourline", "Redgum", "Blue Mountains", "Coastwise", "Meridian", "Pinnacle", "Southern Cross",
  "Ironbark", "Kestrel", "Wattle", "Sandstone", "Northshore", "Vantage", "Clearwater", "Brightwater",
  "Summit", "Anchor", "Beacon", "Cedar", "Delta", "Everest", "Fairhaven", "Granite", "Horizon",
];
const COMPANY_TAIL = [
  "Holdings", "Group", "Developments", "Industries", "Partners", "Logistics", "Capital", "Retail",
  "Constructions", "Property", "Ventures", "Enterprises", "Trading", "Foods", "Technologies",
  "Civil", "Hospitality", "Health", "Manufacturing", "Pty Ltd",
];
export const SUBURBS = [
  "Parramatta", "Chatswood", "Bondi Junction", "Newtown", "Manly", "Cronulla", "Penrith",
  "Liverpool", "Hornsby", "Sutherland", "North Sydney", "Surry Hills", "Ryde", "Bankstown",
  "Blacktown", "Hurstville", "Randwick", "Mosman", "Castle Hill", "Dee Why",
];

export function personName(r) {
  return `${r.pick(FIRST)} ${r.pick(LAST)}`;
}
export function companyName(r) {
  return `${r.pick(COMPANY_HEAD)} ${r.pick(COMPANY_TAIL)}`;
}

// ── Matter catalog (PLAT_JOB_CATALOG rows, vertical "legal") ──────────────────
// key, label, group (practice area), engagementType, scopeHint, phases[] +
// fee band [min,max] used to size Estimated_Value, and a matter-title verb.
export const MATTER_CATALOG = [
  {
    key: "commercial_litigation", label: "Commercial litigation", group: "Litigation & Dispute Resolution",
    engagementType: "long_project", fee: [35000, 320000],
    scopeHint: "Complex commercial dispute in the Supreme/Federal Court — pleadings through to judgment.",
    phases: ["Instructions & merits assessment", "Pleadings", "Discovery & interrogatories", "Evidence & expert reports", "Mediation", "Hearing", "Judgment & enforcement"],
  },
  {
    key: "contract_dispute", label: "Contract dispute", group: "Litigation & Dispute Resolution",
    engagementType: "long_project", fee: [18000, 140000],
    scopeHint: "Breach of contract claim — recovery of loss and damages.",
    phases: ["Instructions & advice", "Letter of demand", "Pleadings", "Discovery", "Mediation / negotiation", "Hearing", "Orders & recovery"],
  },
  {
    key: "debt_recovery", label: "Debt recovery", group: "Litigation & Dispute Resolution",
    engagementType: "short_job", fee: [2500, 22000],
    scopeHint: "Recovery of an outstanding commercial debt.",
    phases: ["Letter of demand", "Statement of claim", "Default judgment", "Enforcement"],
  },
  {
    key: "conveyancing_purchase", label: "Conveyancing — purchase", group: "Property & Conveyancing",
    engagementType: "short_job", fee: [1800, 6500],
    scopeHint: "Acting for the purchaser on a residential/commercial property acquisition.",
    phases: ["Contract review & advice", "Searches & enquiries", "Finance & exchange", "Pre-settlement inspection", "Settlement"],
  },
  {
    key: "conveyancing_sale", label: "Conveyancing — sale", group: "Property & Conveyancing",
    engagementType: "short_job", fee: [1600, 6000],
    scopeHint: "Acting for the vendor on a property sale.",
    phases: ["Contract preparation", "Vendor disclosure & searches", "Exchange", "Pre-settlement", "Settlement"],
  },
  {
    key: "commercial_lease", label: "Commercial lease", group: "Property & Conveyancing",
    engagementType: "short_job", fee: [3500, 28000],
    scopeHint: "Negotiation and registration of a commercial lease.",
    phases: ["Heads of agreement", "Lease drafting", "Negotiation", "Execution & registration"],
  },
  {
    key: "company_formation", label: "Company formation & structuring", group: "Corporate & Commercial",
    engagementType: "short_job", fee: [2200, 18000],
    scopeHint: "Incorporation and structuring advice for a new business.",
    phases: ["Structuring advice", "Incorporation & registrations", "Constitution & agreements", "Completion & handover"],
  },
  {
    key: "m_and_a", label: "Mergers & acquisitions", group: "Corporate & Commercial",
    engagementType: "long_project", fee: [60000, 750000],
    scopeHint: "Acquisition/sale of a business or company — due diligence to completion.",
    phases: ["Term sheet & structuring", "Due diligence", "Transaction documents", "Negotiation", "Completion", "Post-completion & integration"],
  },
  {
    key: "shareholder_agreement", label: "Shareholder / partnership agreement", group: "Corporate & Commercial",
    engagementType: "short_job", fee: [4500, 35000],
    scopeHint: "Drafting and negotiating shareholder or partnership arrangements.",
    phases: ["Instructions & structuring", "Drafting", "Negotiation", "Execution"],
  },
  {
    key: "divorce_settlement", label: "Property settlement (family)", group: "Family Law",
    engagementType: "long_project", fee: [12000, 120000],
    scopeHint: "Financial/property settlement following separation.",
    phases: ["Initial advice", "Financial disclosure", "Negotiation / mediation", "Consent orders or hearing", "Finalisation"],
  },
  {
    key: "parenting_orders", label: "Parenting arrangements", group: "Family Law",
    engagementType: "long_project", fee: [9000, 95000],
    scopeHint: "Parenting orders and care arrangements for children.",
    phases: ["Initial advice", "Family dispute resolution", "Application to court", "Interim & final hearing", "Orders & review"],
  },
  {
    key: "will_drafting", label: "Wills & powers of attorney", group: "Wills, Estates & Probate",
    engagementType: "short_job", fee: [900, 5500],
    scopeHint: "Preparation of a will, power of attorney and enduring guardianship.",
    phases: ["Instructions", "Drafting", "Review with client", "Execution"],
  },
  {
    key: "probate_administration", label: "Probate & estate administration", group: "Wills, Estates & Probate",
    engagementType: "long_project", fee: [6000, 65000],
    scopeHint: "Obtaining probate and administering a deceased estate.",
    phases: ["Instructions & asset review", "Probate application", "Grant of probate", "Asset collection & debts", "Distribution & finalisation"],
  },
  {
    key: "estate_dispute", label: "Estate dispute / family provision", group: "Wills, Estates & Probate",
    engagementType: "long_project", fee: [15000, 130000],
    scopeHint: "Family provision claim or estate litigation.",
    phases: ["Instructions & merits", "Notice of claim", "Mediation", "Hearing", "Orders"],
  },
  {
    key: "unfair_dismissal", label: "Unfair dismissal", group: "Employment & Workplace",
    engagementType: "short_job", fee: [3500, 30000],
    scopeHint: "Unfair dismissal application (Fair Work Commission).",
    phases: ["Instructions & merits", "FWC application", "Conciliation", "Hearing & determination"],
  },
  {
    key: "employment_advice", label: "Employment & workplace retainer", group: "Employment & Workplace",
    engagementType: "ongoing", fee: [8000, 90000],
    scopeHint: "Ongoing workplace advice — contracts, policies, investigations.",
    phases: ["Onboarding & audit", "Contracts & policies", "Ongoing advice", "Quarterly review"],
  },
  {
    key: "workplace_investigation", label: "Workplace investigation", group: "Employment & Workplace",
    engagementType: "short_job", fee: [6000, 45000],
    scopeHint: "Independent investigation of workplace misconduct complaints.",
    phases: ["Scope & terms of reference", "Evidence gathering", "Interviews", "Findings & report"],
  },
  {
    key: "criminal_defence", label: "Criminal defence", group: "Criminal Law",
    engagementType: "long_project", fee: [5000, 110000],
    scopeHint: "Defence of criminal charges — Local or District Court.",
    phases: ["Instructions & bail", "Brief & committal", "Plea / trial preparation", "Hearing / trial", "Sentencing"],
  },
  {
    key: "personal_injury", label: "Personal injury claim", group: "Personal Injury & Insurance",
    engagementType: "long_project", fee: [8000, 180000],
    scopeHint: "Compensation claim for a personal injury (motor/workers/public liability).",
    phases: ["Instructions & investigation", "Medical assessment", "Liability & quantum", "Negotiation", "Settlement or trial"],
  },
  {
    key: "insurance_dispute", label: "Insurance dispute", group: "Personal Injury & Insurance",
    engagementType: "long_project", fee: [12000, 150000],
    scopeHint: "Dispute over declined or underpaid insurance claim.",
    phases: ["Instructions & policy review", "Internal dispute resolution", "AFCA / litigation", "Resolution"],
  },
];

// Matter status vocabulary. `open` flags whether it counts as live work.
export const STATUSES_OPEN = [
  "Intake", "Active", "In Discovery", "Awaiting Court", "In Mediation", "On Hold",
];
export const STATUSES_CLOSED = [
  "Closed – Won", "Closed – Settled", "Closed – Completed", "Closed – Discontinued", "Closed – Lost",
];

export const RAG = ["Green", "Amber", "Red"];

// Realistic annual mix for a mid-size general practice firm (~1000 matters/yr):
// high-volume transactional work dominates; litigation/M&A rarer but high-value.
export const MATTER_WEIGHTS = {
  conveyancing_purchase: 230, conveyancing_sale: 190, will_drafting: 150,
  debt_recovery: 85, probate_administration: 70, company_formation: 55,
  commercial_lease: 50, divorce_settlement: 48, contract_dispute: 40,
  personal_injury: 36, criminal_defence: 32, parenting_orders: 30,
  unfair_dismissal: 26, commercial_litigation: 24, shareholder_agreement: 20,
  insurance_dispute: 18, estate_dispute: 15, employment_advice: 14,
  workplace_investigation: 12, m_and_a: 12,
};

// Risk pools keyed by practice-area group.
export const RISK_POOL = {
  "Litigation & Dispute Resolution": [
    "Adverse costs order if the claim is unsuccessful",
    "Limitation date approaching — proceedings must be filed",
    "Key witness availability is uncertain",
    "Opposing party may be impecunious — recovery risk",
    "Discovery volume larger than estimated — cost overrun",
  ],
  "Property & Conveyancing": [
    "Purchaser finance approval delayed",
    "Building & pest report reveals defects",
    "Settlement date at risk — chain dependency",
    "Undisclosed easement / caveat on title",
  ],
  "Corporate & Commercial": [
    "Due diligence uncovers undisclosed liabilities",
    "Warranty & indemnity exposure post-completion",
    "Regulatory (FIRB/ACCC) approval delay",
    "Key employee retention not secured",
  ],
  "Family Law": [
    "Non-disclosure of assets by other party",
    "Urgent parenting risk — interim orders needed",
    "Valuation dispute over matrimonial property",
  ],
  "Wills, Estates & Probate": [
    "Family provision claim against the estate",
    "Missing or contested asset in the estate",
    "Executor conflict of interest",
  ],
  "Employment & Workplace": [
    "General protections claim risk",
    "Investigation confidentiality breach",
    "Reinstatement order exposure",
  ],
  "Criminal Law": [
    "Brief served late — trial preparation compressed",
    "Bail conditions breach",
    "Prosecution disclosure incomplete",
  ],
  "Personal Injury & Insurance": [
    "Quantum uncertain pending final medical assessment",
    "Insurer denies liability",
    "Statutory time limit for claim approaching",
  ],
};

// Disbursement kinds by area (Type "Out" cashflow lines).
export const DISBURSEMENTS = {
  litigation: [["Court filing fee", 600, 4500], ["Counsel's fees", 3500, 45000], ["Expert report", 2500, 12000], ["Process server", 120, 600], ["Mediation venue & mediator", 1500, 6000]],
  property: [["Title & planning searches", 180, 900], ["Settlement agent fee", 150, 450], ["Registration fees", 140, 1200], ["PEXA transaction fee", 60, 140]],
  corporate: [["ASIC fees", 90, 1200], ["Due diligence data room", 800, 6000], ["Independent valuation", 3000, 15000]],
  family: [["Court filing fee", 400, 1300], ["Family report writer", 2500, 6000], ["Valuation", 800, 3500]],
  estate: [["Probate filing fee", 800, 2500], ["Property valuation", 600, 2500], ["Newspaper notice", 150, 400]],
  employment: [["FWC application fee", 80, 800], ["Counsel's advice", 1500, 8000]],
  criminal: [["Counsel's fees", 2500, 30000], ["Expert / forensic report", 1500, 8000]],
  pi: [["Medical assessment", 700, 4000], ["Medico-legal report", 1500, 6000], ["Court filing fee", 500, 1300]],
};
export function disbursementBucket(group) {
  if (group.startsWith("Litigation")) return "litigation";
  if (group.startsWith("Property")) return "property";
  if (group.startsWith("Corporate")) return "corporate";
  if (group.startsWith("Family")) return "family";
  if (group.startsWith("Wills")) return "estate";
  if (group.startsWith("Employment")) return "employment";
  if (group.startsWith("Criminal")) return "criminal";
  return "pi";
}

// Org-level strategic decisions (not matter-linked in the schema).
export const DECISIONS_POOL = [
  ["Adopt fixed-fee pricing for standard conveyancing", "Strategic", "Move standard residential conveyancing to fixed fees to improve competitiveness and predictability."],
  ["Brief senior counsel on the Harbourline appeal", "Strategic", "Retain senior counsel given the quantum and precedent value of the appeal."],
  ["Settle the Redgum contract dispute at mediation", "Commercial", "Commercial settlement recommended over trial risk and cost exposure."],
  ["Open a dedicated wills & estates practice group", "Strategic", "Demand and referral volume justify a standalone estates team."],
  ["Engage a costs consultant for large litigation files", "Operational", "Improve costs recovery and budgeting on matters over $100k."],
  ["Standardise the client intake & conflict-check workflow", "Operational", "Reduce conflict risk and onboarding time across all practice groups."],
  ["Decline the Pinnacle Developments retainer (conflict)", "Commercial", "Conflict with an existing development client; decline to preserve relationships."],
  ["Invest in matter-management automation", "Strategic", "Automate deadlines, disbursement capture and status reporting."],
];

// Matter-title subject builders per practice-area style.
export function matterTitleSubject(r, cat, clientLabel) {
  const opp = r.bool(0.5) ? companyName(r) : personName(r);
  switch (cat.group) {
    case "Litigation & Dispute Resolution":
    case "Personal Injury & Insurance":
      return `${clientLabel} v ${opp}`;
    case "Property & Conveyancing": {
      const num = r.int(1, 240);
      return `${clientLabel} — ${num} ${r.pick(["High St", "Beach Rd", "Station St", "Park Ave", "George St", "Victoria Rd"])}, ${r.pick(SUBURBS)}`;
    }
    case "Wills, Estates & Probate":
      return cat.key === "will_drafting" ? `${clientLabel} — estate planning` : `Estate of the late ${personName(r)}`;
    case "Family Law":
      return `${clientLabel} — family law matter`;
    case "Criminal Law":
      return `R v ${clientLabel}`;
    default:
      return `${clientLabel} — ${cat.label.toLowerCase()}`;
  }
}
