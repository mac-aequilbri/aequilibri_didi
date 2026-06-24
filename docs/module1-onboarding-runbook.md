# Module 1 onboarding + propagation runbook

1. **Provision org** from `/app/new` with initial role (`owner`, `builder`, `architect`, `broker`) and domain seed inputs.
2. **Validate core schema parity** for the new base:
   - `node scripts/airtable-module1-audit-core.mjs <baseId>`
3. **Reconcile LEARNING_RULES schema** (if audit reports drift):
   - `node scripts/airtable-sync-learning-rules-schema.mjs <baseId>`
4. **Run onboarding data load in strict order**:
   1. Project phases
   2. Room/zone matrix
   3. Vendor list
   4. Reference data
   5. Opening budget
   6. Ongoing operational data
5. **Confirm governance metadata** in diagnostics:
   - Core schema version
   - Project delivery schema version
   - Module 1 migration status
6. **Stamp governance metadata for existing orgs** (one-time):
   - `node scripts/airtable-module1-stamp-registry.mjs`
7. **Track propagation across all orgs**:
   - `node scripts/airtable-module1-propagation-status.mjs`

Domain split used by onboarding:
- **Domain extension tables (core app behavior):** project delivery entities (phases, procurement, cashflow, vendors, room matrix, etc.)
- **Customer configuration values:** customer-specific vendors, categories, zone names, budgets, pricing overrides
