-- Per-customer Airtable base id (the spec's "bases are clones"). Nullable:
-- existing orgs have no base yet and fall back to AIRTABLE_BASES / demo base.
ALTER TABLE "plat_core_organisation" ADD COLUMN "airtable_base_id" VARCHAR(20);
