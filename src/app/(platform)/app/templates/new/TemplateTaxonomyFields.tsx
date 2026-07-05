"use client";

// Industry / sub-industry pickers for the New mapping form. Both are dropdowns
// seeded from the curated taxonomy (plus industries already in the registry).
// Each offers "Other (not in the list)…" which reveals a free-text input, so an
// admin is never blocked from entering a value that isn't pre-listed. The
// component emits plain `industry` / `subIndustry` fields — the server action is
// unchanged, it can't tell whether a value came from the list or was typed.

import { useState } from "react";

const OTHER = "__other__";
const inputCls = "mt-1 w-full rounded border border-neutral-300 px-3 py-2";

export function TemplateTaxonomyFields({
  taxonomy,
  industries,
}: {
  taxonomy: Record<string, string[]>;
  industries: string[];
}) {
  const [industry, setIndustry] = useState(industries[0] ?? OTHER);
  const [sub, setSub] = useState("");

  const industryOther = industry === OTHER;
  const subOptions = industryOther ? [] : taxonomy[industry] ?? [];
  const subOther = sub === OTHER;

  return (
    <>
      <label className="block text-sm">
        <span className="text-neutral-600">Industry *</span>
        <select
          value={industry}
          onChange={(e) => {
            setIndustry(e.target.value);
            setSub(""); // sub-industry list depends on the industry — reset it
          }}
          className={inputCls}
        >
          {industries.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
          <option value={OTHER}>Other (not in the list)…</option>
        </select>
        {industryOther ? (
          <input key="industry-text" name="industry" required autoFocus placeholder="e.g. Legal" className={`${inputCls} mt-2`} />
        ) : (
          <input key="industry-hidden" type="hidden" name="industry" value={industry} />
        )}
      </label>

      <label className="block text-sm">
        <span className="text-neutral-600">Sub-industry</span>
        {industryOther || subOptions.length === 0 ? (
          // Custom or unlisted industry has no predefined sub-industries — free text.
          <input key="sub-freetext" name="subIndustry" placeholder="e.g. Litigation" className={inputCls} />
        ) : (
          <>
            <select value={sub} onChange={(e) => setSub(e.target.value)} className={inputCls}>
              <option value="">— none —</option>
              {subOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value={OTHER}>Other (not in the list)…</option>
            </select>
            {subOther ? (
              <input key="sub-text" name="subIndustry" required autoFocus placeholder="e.g. Litigation" className={`${inputCls} mt-2`} />
            ) : (
              <input key="sub-hidden" type="hidden" name="subIndustry" value={sub} />
            )}
          </>
        )}
      </label>
    </>
  );
}
