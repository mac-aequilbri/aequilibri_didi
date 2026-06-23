// Customer Onboarding Engine (module 1) — provisions a configured,
// ready-to-learn customer instance in one transaction. Covers both
// sub-processes from the architecture doc:
//   Instance Setup: org row (the "clone" — Core schema is shared, so a new
//     instance is configuration, not new tables), customer-config defaults,
//     first admin.
//   Domain Knowledge Initialisation: the customer's rules of thumb encoded
//     as guidance learning rules before any jobs run, so the assistant
//     starts with something to work from.

import { airtableEnabled, core } from "@/lib/airtable";
import { airtableMapFor, toFields } from "@/lib/airtable/fieldMaps";
import { provisionClientBase } from "@/lib/airtable/provision";
import { prisma } from "@/lib/db";
import { logger, errMeta } from "@/lib/logger";
import { DEFAULT_FEATURES, EngagementType, AiAuthority } from "@/lib/platform/types";

/** The learning-engine threshold settings seeded for every new org. */
const SEED_SETTINGS: Array<{ key: string; value: string }> = [
  { key: "learning.hypothesis_min_samples", value: "3" },
  { key: "learning.rule_min_samples", value: "5" },
  { key: "learning.auto_apply_min_confidence", value: "85" },
  { key: "learning.auto_apply_min_triggers", value: "50" },
];

/** Mirror the org's Customer Config (budget categories + learning settings)
 *  into its Airtable base, so the Airtable-backed reads (configSource,
 *  getLearningSettings) see the same data the Postgres txn just wrote. Best
 *  effort: a mirror failure must not fail onboarding (Postgres remains the
 *  fallback during the cutover), so callers swallow errors. */
async function mirrorConfigToBase(
  orgSlug: string,
  categories: string[],
  rules: string[],
): Promise<void> {
  for (let i = 0; i < categories.length; i++) {
    const name = categories[i];
    await core.create(orgSlug, "PLAT_CFG_REFERENCE", {
      Name: name,
      Ref_Type: "budget_category",
      Code: name.toLowerCase().replace(/\s+/g, "_").slice(0, 100),
      Sort_Order: i,
      Is_Active: true,
    });
  }
  for (const s of SEED_SETTINGS) {
    await core.create(orgSlug, "PLAT_CFG_SETTING", { Setting_Key: s.key, Value: s.value });
  }
  // Seed guidance rules — through the learning_rule field map so they read back
  // identically to engine/promotion-created rules.
  const ruleMap = airtableMapFor("learning_rule")!;
  let seq = 0;
  for (const description of rules) {
    seq += 1;
    const fields = toFields(
      ruleMap,
      {
        ruleCode: `LRN-${String(seq).padStart(4, "0")}`,
        kind: "guidance",
        description,
        confidence: 80,
        isActive: true,
        autoApply: false,
        cannotOverride: false,
      },
      "create",
    );
    await core.create(orgSlug, "LEARNING_RULES", fields);
  }
}

export interface ProvisionInput {
  slug: string;
  name: string;
  vertical?: string;
  defaultEngagementType: EngagementType;
  allowedEngagementTypes: EngagementType[];
  aiAuthority: AiAuthority;
  assistantName: string;
  assistantPersona: string;
  features: Record<string, boolean>;
  adminName: string;
  adminEmail: string;
  /** One per line from the form: budget categories for the cfg reference tier. */
  budgetCategories: string[];
  /** Domain knowledge init: expert rules of thumb, one per line. */
  initialRules: string[];
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,98}$/;
/** Slugs that collide with static routes or would be confusing. */
const RESERVED_SLUGS = new Set(["new", "app", "portal", "api", "uc1", "uc2", "uc3"]);

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type ProvisionResult =
  | { ok: true; orgId: number; slug: string }
  | { ok: false; error: string };

export async function provisionOrganisation(input: ProvisionInput): Promise<ProvisionResult> {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "Slug must be lowercase letters/numbers/hyphens (and not a reserved word)." };
  }
  if (!input.name.trim()) return { ok: false, error: "Organisation name is required." };
  if (await prisma.platOrganisation.findFirst({ where: { slug } })) {
    return { ok: false, error: `An organisation with slug "${slug}" already exists.` };
  }
  const allowed = input.allowedEngagementTypes.length
    ? input.allowedEngagementTypes
    : [input.defaultEngagementType];

  // Airtable mode: provision the customer's own base BEFORE the DB transaction
  // (it's a slow external call — don't hold a txn open across it). The base is
  // the org in Airtable terms, so a provisioning failure fails onboarding
  // rather than leaving a half-created org with no base. Org identity/team stay
  // in Postgres (auth + tenancy); Customer Config + seed rules are written to
  // Postgres in the txn AND mirrored into the base afterwards (the Airtable
  // reads prefer the base, falling back to Postgres during the cutover).
  let airtableBaseId: string | null = null;
  if (airtableEnabled()) {
    try {
      airtableBaseId = await provisionClientBase(input.name.trim());
    } catch (err) {
      logger.error("Airtable base provisioning failed", { slug, ...errMeta(err) });
      return {
        ok: false,
        error: `Could not provision the Airtable base: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const categories = input.budgetCategories.map((c) => c.trim()).filter(Boolean);
  const rules = input.initialRules.map((r) => r.trim()).filter(Boolean);

  const orgId = await prisma.$transaction(async (tx) => {
    // ── Instance Setup ──────────────────────────────────────────────
    const org = await tx.platOrganisation.create({
      data: {
        slug,
        name: input.name.trim(),
        vertical: input.vertical ?? "construction",
        defaultEngagementType: input.defaultEngagementType,
        allowedEngagementTypes: JSON.stringify(allowed),
        aiAuthority: input.aiAuthority,
        settings: JSON.stringify({
          assistant: {
            name: input.assistantName.trim() || "Assistant",
            persona:
              input.assistantPersona.trim() ||
              `You are the AI project coordinator for ${input.name.trim()}. Be precise, data-driven, and flag risks proactively.`,
          },
          features: { ...DEFAULT_FEATURES, ...input.features },
        }),
        airtableBaseId,
      },
    });

    if (input.adminName.trim()) {
      await tx.platCfgTeamMember.create({
        data: {
          orgId: org.id,
          name: input.adminName.trim(),
          role: "admin",
          email: input.adminEmail.trim(),
        },
      });
    }

    if (categories.length) {
      await tx.platCfgReference.createMany({
        data: categories.map((name, i) => ({
          orgId: org.id,
          type: "budget_category",
          code: name.toLowerCase().replace(/\s+/g, "_").slice(0, 100),
          name,
          sortOrder: i,
        })),
      });
    }

    await tx.platCfgSetting.createMany({
      data: SEED_SETTINGS.map((s) => ({ orgId: org.id, key: s.key, value: s.value })),
    });

    // ── Domain Knowledge Initialisation ─────────────────────────────
    let seq = 0;
    for (const description of rules) {
      seq += 1;
      await tx.platLearningRule.create({
        data: {
          orgId: org.id,
          ruleCode: `LRN-${String(seq).padStart(4, "0")}`,
          kind: "guidance",
          description,
          category: "Onboarding",
          confidence: 80, // taught directly by the customer's expert
          isActive: true,
          notes: "Captured during domain knowledge initialisation.",
          dateActivated: new Date(),
        },
      });
    }

    await tx.platExecutionLog.create({
      data: {
        orgId: org.id,
        actorType: "human",
        actorName: input.adminName.trim() || "onboarding",
        operation: "create",
        targetTable: "plat_core_organisation",
        targetId: org.id,
        payload: JSON.stringify({
          slug,
          engagementTypes: allowed,
          aiAuthority: input.aiAuthority,
          initialRules: rules.length,
          budgetCategories: categories.length,
        }),
        status: "executed",
        executedAt: new Date(),
        result: "Organisation provisioned (instance setup + domain knowledge init)",
      },
    });

    return org.id;
  });

  // Mirror Customer Config into the org's Airtable base (best effort — the
  // Postgres txn already succeeded, and configSource falls back to Postgres if
  // the base isn't seeded). Seed learning rules are mirrored separately.
  if (airtableEnabled()) {
    try {
      await mirrorConfigToBase(slug, categories, rules);
    } catch (err) {
      logger.warn("Airtable config mirror skipped", { slug, ...errMeta(err) });
    }
  }

  return { ok: true, orgId, slug };
}
