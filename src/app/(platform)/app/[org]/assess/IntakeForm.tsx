// Assessment intake form. Choosing a job category from the industry catalog
// pre-fills the engagement type and a scope template (both still editable),
// and the chosen category drives the phase plan (catalog default / learnings)
// downstream. Submits to runAssessmentAction.
"use client";

import { useState } from "react";
import { catalogByGroup, getCategory } from "@/lib/platform/jobCatalog";
import { runAssessmentAction } from "./actions";
import { RunAssessmentButton } from "./SubmitButtons";

export function IntakeForm({
  orgSlug,
  allowedEngagementTypes,
  defaultEngagementType,
}: {
  orgSlug: string;
  allowedEngagementTypes: string[];
  defaultEngagementType: string;
}) {
  const groups = catalogByGroup();
  const [category, setCategory] = useState("");
  const [engagementType, setEngagementType] = useState(defaultEngagementType);
  const [scope, setScope] = useState("");
  // Track whether the user has hand-edited scope, so we don't clobber it.
  const [scopeTouched, setScopeTouched] = useState(false);

  const onCategory = (key: string) => {
    setCategory(key);
    const cat = getCategory(key);
    if (!cat) return;
    if (allowedEngagementTypes.includes(cat.engagementType)) {
      setEngagementType(cat.engagementType);
    }
    if (!scopeTouched) setScope(cat.scopeHint);
  };

  const cat = getCategory(category);

  return (
    <form action={runAssessmentAction} className="ae-card p-5 space-y-4 relative">
      <input type="hidden" name="org" value={orgSlug} />

      <label className="block text-sm">
        <span className="text-neutral-600">Job category</span>
        <select
          name="category"
          value={category}
          onChange={(e) => onCategory(e.target.value)}
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        >
          <option value="">— Select a category (optional) —</option>
          {groups.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {cat && (
          <span className="mt-1 block text-xs text-neutral-500">
            Standard plan: {cat.phases.length} phases · runs as{" "}
            {cat.engagementType.replace("_", " ")}. Phases adapt to this job, and to your
            past {cat.label.toLowerCase()} jobs as you complete them.
          </span>
        )}
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600">Job name *</span>
        <input
          name="name"
          required
          placeholder="Seaview Duplex"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-neutral-600">Address</span>
          <input
            name="address"
            placeholder="12 Ocean Parade"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Suburb</span>
          <input
            name="suburb"
            placeholder="Maroochydore"
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Engagement type</span>
          <select
            name="engagementType"
            value={engagementType}
            onChange={(e) => setEngagementType(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          >
            {allowedEngagementTypes.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-neutral-600">Approx. size (m²)</span>
          <input
            type="number"
            name="sizeSqm"
            min={1}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-neutral-600">Scope description *</span>
        <textarea
          name="scope"
          required
          rows={4}
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setScopeTouched(true);
          }}
          placeholder="Two-storey duplex, concrete slab, timber frame, mid-range finishes, sloping coastal block…"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <RunAssessmentButton />
    </form>
  );
}
