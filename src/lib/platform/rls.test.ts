import { afterEach, describe, expect, it } from "vitest";
import { inScope, resolveJobScope, scopeRows } from "./rls";
import type { OrgCtx } from "./types";

const ctx = { orgId: 1, orgSlug: "test-org" } as OrgCtx;

describe("scopeRows", () => {
  const rows = [
    { id: "a", jobId: "j1" },
    { id: "b", jobId: "j2" },
    { id: "c", jobId: null }, // org-global / orphan (no job link)
  ];
  const jobIdOf = (r: { jobId: string | null }) => r.jobId;

  it("mode=all passes everything through", () => {
    expect(scopeRows(rows, jobIdOf, { mode: "all" })).toEqual(rows);
  });

  it("mode=some keeps assigned jobs AND org-global rows", () => {
    const out = scopeRows(rows, jobIdOf, { mode: "some", jobIds: new Set(["j1"]) });
    expect(out.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("mode=none keeps only org-global (no-job) rows", () => {
    const out = scopeRows(rows, jobIdOf, { mode: "none" });
    expect(out.map((r) => r.id)).toEqual(["c"]);
  });
});

describe("inScope (single-record guard for write/detail/approval seams)", () => {
  it("all admits everything", () => {
    expect(inScope({ mode: "all" }, "j1")).toBe(true);
    expect(inScope({ mode: "all" }, null)).toBe(true);
  });
  it("org-global (no job) is always admitted", () => {
    expect(inScope({ mode: "none" }, null)).toBe(true);
    expect(inScope({ mode: "some", jobIds: new Set(["j1"]) }, null)).toBe(true);
  });
  it("some admits only assigned jobs", () => {
    const s = { mode: "some", jobIds: new Set(["j1"]) } as const;
    expect(inScope(s, "j1")).toBe(true);
    expect(inScope(s, "j2")).toBe(false);
  });
  it("none rejects any real job", () => {
    expect(inScope({ mode: "none" }, "j1")).toBe(false);
  });
});

describe("resolveJobScope", () => {
  afterEach(() => {
    delete process.env.PROJECT_RLS_ENFORCE;
  });

  it("exempts Administrator / Auditor / Business Owner (mode=all)", async () => {
    for (const role of ["owner", "broker+auditor", "builder+business_owner"]) {
      expect((await resolveJobScope(ctx, { email: "u@x.io", role })).mode).toBe("all");
    }
  });

  it("fail-open: an unresolved non-exempt viewer sees all while not enforcing", async () => {
    // Airtable is disabled in the test env, so assignedJobRecIds resolves to null.
    expect((await resolveJobScope(ctx, { email: "u@x.io", role: "broker" })).mode).toBe("all");
  });

  it("fail-closed: an unresolved non-exempt viewer sees nothing once enforcing (global env)", async () => {
    process.env.PROJECT_RLS_ENFORCE = "true";
    expect((await resolveJobScope(ctx, { email: "u@x.io", role: "broker" })).mode).toBe("none");
  });

  it("fail-closed per-org: features.project_rls_enforce flips one org, others stay open", async () => {
    const enforced = { ...ctx, config: { features: { project_rls_enforce: true } } } as unknown as OrgCtx;
    expect((await resolveJobScope(enforced, { email: "u@x.io", role: "broker" })).mode).toBe("none");
    // A different org with no flag (and no global env) stays fail-open.
    expect((await resolveJobScope(ctx, { email: "u@x.io", role: "broker" })).mode).toBe("all");
  });
});
