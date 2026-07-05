// Assessment intake form. Choosing a job category from the industry catalog
// pre-fills the engagement type and a scope template (both still editable),
// and the chosen category drives the phase plan (catalog default / learnings)
// downstream. Submits to runAssessmentAction.
"use client";

import { useState } from "react";
import { findCategory, groupCatalog, type JobCategory } from "@/lib/platform/jobCatalog";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { runAssessmentAction } from "./actions";
import { RunAssessmentButton } from "./SubmitButtons";

export function IntakeForm({
  orgSlug,
  categories,
  allowedEngagementTypes,
  defaultEngagementType,
  mapsApiKey = "",
}: {
  orgSlug: string;
  /** Data-driven job categories for this org's vertical (may be empty). */
  categories: JobCategory[];
  allowedEngagementTypes: string[];
  defaultEngagementType: string;
  mapsApiKey?: string;
}) {
  const groups = groupCatalog(categories);
  const [category, setCategory] = useState("");
  const [engagementType, setEngagementType] = useState(defaultEngagementType);
  const [scope, setScope] = useState("");
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  // Precise rooftop point from a Google Places selection — submitted so the
  // roof check locates the right building. Cleared whenever the address text
  // changes by hand (the point no longer matches what's typed).
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // New builds / subdivisions may have an address Google doesn't list yet —
  // let the user opt out of suggestions and type it freely.
  const [manualAddress, setManualAddress] = useState(false);
  // Track whether the user has hand-edited scope, so we don't clobber it.
  const [scopeTouched, setScopeTouched] = useState(false);

  const onCategory = (key: string) => {
    setCategory(key);
    const cat = findCategory(categories, key);
    if (!cat) return;
    if (allowedEngagementTypes.includes(cat.engagementType)) {
      setEngagementType(cat.engagementType);
    }
    if (!scopeTouched) setScope(cat.scopeHint);
  };

  const cat = findCategory(categories, category);

  return (
    <form action={runAssessmentAction} className="ae-card p-5 space-y-4 relative">
      <input type="hidden" name="org" value={orgSlug} />
      <input type="hidden" name="lat" value={coords?.lat ?? ""} />
      <input type="hidden" name="lng" value={coords?.lng ?? ""} />

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
        {groups.length === 0 && (
          <span className="mt-1 block text-xs text-neutral-500">
            No job categories are set up for this industry yet — the AI will suggest a phase plan
            from your scope description. Categories are drafted automatically for new industries at
            onboarding.
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
        <div className="block text-sm">
          <span className="text-neutral-600">Address</span>
          {manualAddress ? (
            <input
              name="address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setCoords(null);
              }}
              placeholder="e.g. Lot 42, Seaview Estate"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            />
          ) : (
            <AddressAutocomplete
              apiKey={mapsApiKey}
              name="address"
              defaultValue={address}
              placeholder="Start typing — e.g. 12 Ocean Parade"
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              onTextChange={(v) => {
                setAddress(v);
                setCoords(null);
              }}
              onSelect={({ address: a, suburb: s, lat, lng }) => {
                setAddress(a);
                if (s) setSuburb(s);
                setCoords(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null);
              }}
            />
          )}
          <label className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
            <input
              type="checkbox"
              checked={manualAddress}
              onChange={(e) => {
                setManualAddress(e.target.checked);
                setCoords(null);
              }}
            />
            New or unlisted address — enter manually (no suggestions)
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-neutral-600">Suburb</span>
          <input
            name="suburb"
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
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
