// §4 overlay invariants: labels key on the Airtable Core field (translated
// from the app key via the write field map), misses fall back to the
// hardcoded label, and an empty label set is a strict no-op.

import { describe, expect, it } from "vitest";
import { applyDomainLabels, type DomainLabel } from "./domainLabels";
import type { RecordEditorConfig } from "./recordEditor";

const cfg: RecordEditorConfig = {
  table: "action",
  noun: "action",
  listPath: "/actions",
  aiRole: "test",
  fields: [
    { name: "status", label: "Status", type: "select" },
    { name: "title", label: "Title", type: "text", help: "existing help" },
  ],
};

describe("applyDomainLabels", () => {
  it("overlays the matching Core field label + context note", () => {
    const labels = new Map<string, DomainLabel>([
      ["ISSUES.Status", { label: "Site Action Status", contextNote: "Roofing site vocabulary" }],
    ]);
    const out = applyDomainLabels(cfg, labels);
    expect(out.fields[0]).toMatchObject({ label: "Site Action Status", help: "Roofing site vocabulary" });
    expect(out.fields[1].label).toBe("Title"); // no ISSUES.Action_Name row → fallback
    expect(out.fields[1].help).toBe("existing help"); // never clobbers explicit help
  });

  it("is a strict no-op with no labels or an unmapped table", () => {
    expect(applyDomainLabels(cfg, new Map())).toBe(cfg);
    const labels = new Map<string, DomainLabel>([["ISSUES.Status", { label: "X", contextNote: "" }]]);
    const unmapped = { ...cfg, table: "quote_line" as const, fields: cfg.fields };
    expect(applyDomainLabels(unmapped, labels).fields[0].label).toBe("Status");
  });
});
