## What & why

<!-- One or two sentences. Link the audit finding ID (e.g. SEC-3) or doc/plan if applicable. -->

## Checklist

- [ ] `npm run typecheck` / `lint` / `test` pass locally
- [ ] Airtable schema changes are additive-only (rollback stays code-only)
- [ ] New env vars declared in `render.yaml` and documented
- [ ] Writes go through `recordWriter` (not raw Prisma/Airtable calls)
- [ ] UI follows the design-system window checklist (`docs/design-system.md`)
