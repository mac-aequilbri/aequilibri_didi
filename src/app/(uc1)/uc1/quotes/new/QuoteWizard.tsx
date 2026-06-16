"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GoogleMap, { type LatLng } from "@/components/GoogleMap";
import RoofPlanDialog, { type RoofPlan, type RoofMeasurement } from "./RoofPlanDialog";
import { createQuote, recordRoofCorrectionAction } from "./actions";
import { buildQuoteInputs, buildQuoteFromMechanism } from "./pricing-inputs";
import { ROOF_RATE_PER_M2 } from "@/services/uc1/pricing";
import { currency } from "@/lib/format";

interface Analysis {
  outline: LatLng[]; roofType: string; confidence: string; sectionCount: number;
  areaM2: number; perimeterM: number; ridgeLm: number; hipLm: number;
  qualityScore: number | null; needsReview: boolean; source: string; sourceLabel: string;
}

const PITCH_OPTIONS = [["flat", "Flat 0°"], ["low", "Low 10°"], ["standard", "Standard 22°"], ["steep", "Steep 35°"], ["very_steep", "Very Steep 45°"]];
const MATERIAL_OPTIONS = [["colorbond", "Colorbond Steel"], ["terracotta", "Terracotta Tiles"], ["concrete", "Concrete Tiles"], ["zincalume", "Zincalume"], ["slate", "Natural Slate"], ["asphalt", "Asphalt Shingles"]];
const AREA_PRESETS = [["", "Select only if needed"], ["90", "Small unit — 90 m²"], ["140", "Small house — 140 m²"], ["180", "Medium house — 180 m²"], ["240", "Large house — 240 m²"], ["320", "XL / acreage — 320 m²"]];
const STEPS = [
  { n: 1, title: "Find Property", note: "Address and satellite view" },
  { n: 2, title: "Confirm Roof Area", note: "Approve measurement" },
  { n: 3, title: "Quote Options", note: "Client, roof type, inclusions" },
  { n: 4, title: "Generate Quote", note: "Review price and save" },
];

function haversine(a: LatLng, b: LatLng): number {
  const R = 6_371_000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function ringPerimeter(ring: LatLng[]): number {
  if (ring.length < 3) return 0;
  let t = 0;
  for (let i = 0; i < ring.length; i++) t += haversine(ring[i], ring[(i + 1) % ring.length]);
  return Math.round(t * 10) / 10;
}

export function QuoteWizard({ apiKey }: { apiKey: string }) {
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState("");
  const [center, setCenter] = useState<LatLng>([-19.2576, 146.8178]);
  const [zoom, setZoom] = useState(13);
  const [clickPoint, setClickPoint] = useState<LatLng | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [areaOverride, setAreaOverride] = useState<number | null>(null);

  const [pitch, setPitch] = useState("standard");
  const [material, setMaterial] = useState("colorbond");
  const [waste, setWaste] = useState("10");

  // Quote-options state (Step 3).
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [roofTypeSel, setRoofTypeSel] = useState("gable");
  const [storeys, setStoreys] = useState("1");
  const [notes, setNotes] = useState("");
  const [opts, setOpts] = useState({
    gutter: true, asbestos: false, decromastic: false, solar_rr: false, solar_hw: false,
    fuse_pull: true, bins: false, batten: false, fascia: false,
  });
  const [gutterLm, setGutterLm] = useState("");
  const [downpipe90, setDownpipe90] = useState("0");
  const [solarPanelCount, setSolarPanelCount] = useState("10");
  const [mechanism, setMechanism] = useState("cost_plus");
  const [packageTier, setPackageTier] = useState("essential");
  const [mode, setMode] = useState("match");
  const toggleOpt = (k: keyof typeof opts) => setOpts((o) => ({ ...o, [k]: !o[k] }));

  const effectiveArea = areaOverride ?? analysis?.areaM2 ?? 0;

  const onPlaceSelected = (lat: number, lng: number, addr: string) => {
    setAddress(addr);
    setCenter([lat, lng]);
    setZoom(20);
    analyze(lat, lng); // auto-measure + draw the roof outline on search
  };

  const [aiBusy, setAiBusy] = useState(false);
  const [roofPlan, setRoofPlan] = useState<RoofPlan | null>(null);
  // Last reviewed/edited plan, kept so reopening shows the user's edits (not a fresh AI fetch).
  const [savedPlan, setSavedPlan] = useState<RoofPlan | null>(null);

  // Map click → fast building-footprint measurement (instant), like the Python app.
  const analyze = useCallback(async (lat: number, lng: number) => {
    setClickPoint([lat, lng]);
    setAnalyzing(true);
    setAnalysis(null);
    setAreaOverride(null);
    try {
      const building = await fetch(`/api/uc1/building?lat=${lat}&lon=${lng}&address=${encodeURIComponent(address)}`).then((r) => r.json()).catch(() => ({}));
      const outline: LatLng[] = Array.isArray(building.geometry) ? building.geometry : [];
      const areaM2 = Math.round((building.area_sqm || 0) * 10) / 10;
      setAnalysis({
        outline, roofType: "unknown", confidence: "low", sectionCount: 0,
        areaM2, perimeterM: ringPerimeter(outline), ridgeLm: 0, hipLm: 0,
        qualityScore: null, needsReview: false,
        source: building.source ?? "none",
        sourceLabel: building.source === "geoscape" ? "Geoscape Buildings" : building.source === "microsoft" ? "Microsoft ML" : "estimate",
      });
    } finally { setAnalyzing(false); }
  }, [address]);

  // Optional, explicit AI roof analysis (Claude Vision) — "Roof Plan Review" in Python.
  // Opens a dialog showing the satellite image with the AI-drawn outline + sections.
  const runAiRoof = useCallback(async () => {
    if (!clickPoint) return;
    // Reopen the user's reviewed/edited plan rather than re-fetching a fresh AI read.
    if (savedPlan) { setRoofPlan(savedPlan); return; }
    setAiBusy(true);
    try {
      const roof = await fetch("/api/uc1/roof-drawing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: clickPoint[0], lng: clickPoint[1], address }) }).then((r) => r.json()).catch(() => null);
      if (roof?.ok) { setRoofPlan(roof as RoofPlan); setSavedPlan(roof as RoofPlan); }
    } finally { setAiBusy(false); }
  }, [clickPoint, address, savedPlan]);

  // A new map pin invalidates the saved plan so the next review fetches fresh.
  useEffect(() => { setSavedPlan(null); }, [clickPoint]);

  // Apply the reviewed/edited AI roof measurement to the working quote.
  const applyRoofPlan = (rp: RoofPlan, m: RoofMeasurement, edited: { outline: number[][]; sections: RoofPlan["sections"] }) => {
    // Keep the user's edited outline/sections so reopening the review shows them.
    setSavedPlan({ ...rp, ai_outline_pct: edited.outline, sections: edited.sections });
    // Keep the trusted building footprint already on the map — the AI draw only
    // contributes measurements/sections, it must NOT replace the map outline
    // (the AI footprint is re-derived independently and can be wrong).
    setAnalysis((prev) => prev && ({
      ...prev,
      roofType: m.roof_type, confidence: rp.confidence ?? prev.confidence,
      sectionCount: m.section_count, areaM2: m.area_m2,
      perimeterM: m.perimeter_m, ridgeLm: m.ridge_lm, hipLm: m.hip_lm,
      qualityScore: rp.quality?.quality_score ?? null, needsReview: Boolean(rp.quality?.needs_review),
      sourceLabel: "AI Vision (reviewed)",
    }));
    // Feed the learning loop: estimator override of the AI area = a correction.
    const aiArea = analysis?.areaM2 ?? 0;
    if (aiArea > 0 && m.area_m2 > 0) recordRoofCorrectionAction({ aiArea, humanArea: m.area_m2, address, suburb }).catch(() => {});
    setAreaOverride(m.area_m2);
    setRoofPlan(null);
  };

  const suburb = useMemo(() => {
    const parts = address.split(",").map((p) => p.trim());
    return parts.length >= 2 ? parts[1] : "";
  }, [address]);

  // Live pricing — same Port City engine the server uses, so preview == saved price.
  const priced = useMemo(() => {
    const inputs = buildQuoteInputs({
      address, suburb, roofType: roofTypeSel, roofAreaM2: effectiveArea,
      eaveLm: analysis?.perimeterM ?? 0, perimeterM: analysis?.perimeterM ?? 0, storeys: Number(storeys),
      includeGutters: opts.gutter, gutterLm: Number(gutterLm) || 0, downpipe90mm: Number(downpipe90) || 0,
      isAsbestos: opts.asbestos, isDecromastic: opts.decromastic,
      solarPanelsRr: opts.solar_rr ? Number(solarPanelCount) || 0 : 0, solarHwRr: opts.solar_hw,
      includeFusePull: opts.fuse_pull, includeBins: opts.bins,
      battenReplaceLm: opts.batten ? effectiveArea * 2 : 0, includeFascia: opts.fascia,
      markupMode: mode,
    });
    try { return buildQuoteFromMechanism(mechanism, packageTier, inputs).toDict(); } catch { return null; }
  }, [address, suburb, roofTypeSel, effectiveArea, analysis?.perimeterM, storeys, opts, gutterLm, downpipe90, solarPanelCount, mechanism, packageTier, mode]);

  const ratePerM2 = ROOF_RATE_PER_M2[roofTypeSel] ?? ROOF_RATE_PER_M2.hip;

  const stepState = (n: number): "complete" | "active" | "" => (n < step ? "complete" : n === step ? "active" : "");
  const statusLabel = (n: number) => (n < step ? "Done" : n === step ? "You are here" : n === step + 1 ? "Next up" : "Later");

  const action = (() => {
    if (step === 1) return { title: "Step 1: find the property", note: "Search an address and pick the match.", cta: "Confirm property", enabled: address.trim().length > 0, run: () => setStep(2) };
    if (step === 2) return { title: "Step 2: confirm roof measurement", note: "Click the roof on the map to measure, then confirm.", cta: "Confirm roof measurement", enabled: Boolean(analysis) && effectiveArea > 0, run: () => setStep(3) };
    if (step === 3) return { title: "Step 3: quote options", note: "Set pitch, material and inclusions.", cta: "Review quote", enabled: effectiveArea > 0, run: () => setStep(4) };
    return { title: "Step 4: generate quote", note: "Review and save the quote.", cta: "", enabled: false, run: () => {} };
  })();

  return (
    <div className="px-3 sm:px-8">
      <div className="journey-shell">
        <div className="journey-shell-head">
          <div>
            <div className="journey-eyebrow">Quote journey</div>
            <div className="journey-shell-title">Step {step} of 4: {STEPS[step - 1].title}</div>
          </div>
          <div className="journey-progress-copy">Step {step} of 4</div>
        </div>
        <div className="journey-progress-track"><div className="journey-progress-fill" style={{ width: `${step * 25}%` }} /></div>
        <div className="quote-journey">
          {STEPS.map((s) => (
            <div key={s.n} className={`qj-step ${stepState(s.n)}`} data-step={s.n}>
              <div className="qj-kicker">Step {s.n}</div>
              <div className="qj-title">{s.title}</div>
              <div className="qj-note">{s.note}</div>
              <div className="qj-status">{statusLabel(s.n)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="journey-action flex-col items-stretch sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="journey-action-title">{action.title}</div>
          <div className="journey-action-note">{action.note}</div>
        </div>
        {action.cta && <button type="button" className="btn-ae disabled:opacity-40 w-full sm:w-auto shrink-0" disabled={!action.enabled} onClick={action.run}>{action.cta}</button>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {step <= 2 && (
            <div className="ae-card p-4">
              <GoogleMap apiKey={apiKey} center={center} zoom={zoom} clickPoint={clickPoint} outline={analysis?.outline ?? []} showSearch clickable onMapClick={analyze} onPlaceSelected={onPlaceSelected} height={440}>
                {!analysis && !analyzing && <div className="mode-overlay">👆 Search an address or click the roof to measure</div>}
                {effectiveArea > 0 && <div className="area-badge"><span className="est-area-big" style={{ fontSize: "1.3rem" }}>{effectiveArea}</span> m²</div>}
              </GoogleMap>
              {step === 1 && <p className="text-xs text-neutral-500 mt-2">Find the property, then press <strong>Confirm property</strong>.</p>}

              {step === 2 && (analysis || analyzing) && (
                <div className="est-panel">
                  {analyzing ? <p className="text-neutral-500">Analysing roof… (satellite + AI vision)</p> : analysis && (
                    <>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="text-neutral-500 text-xs font-bold mb-1">ESTIMATED ROOF AREA</div>
                          <div className="flex items-end gap-2"><span className="est-area-big">{effectiveArea}</span><span className="text-neutral-500 mb-1">m²</span></div>
                          <div className="mt-2"><span className={`det-badge ${analysis.source === "geoscape" ? "det-geoscape" : "det-solar"}`}>{analysis.sourceLabel}</span></div>
                        </div>
                        <div className="text-right text-sm text-neutral-500">
                          <div>{analysis.roofType} · {analysis.confidence}</div>
                          <div>{analysis.sectionCount} section(s)</div>
                          <div>perimeter {analysis.perimeterM} m</div>
                          <div>quality {analysis.qualityScore ?? "—"}{analysis.needsReview ? " ⚠" : ""}</div>
                        </div>
                      </div>
                      <label className="block text-sm font-bold mb-1">Adjust Area: <strong style={{ color: "var(--ae-space)" }}>{effectiveArea}</strong> m²</label>
                      <input type="range" min={30} max={600} step={5} value={effectiveArea} onChange={(e) => setAreaOverride(Number(e.target.value))} className="w-full" />
                      <label className="block text-sm font-bold mt-3 mb-1">Area preset</label>
                      <select onChange={(e) => { if (e.target.value) setAreaOverride(Number(e.target.value)); e.target.value = ""; }} className="w-full border border-[var(--ae-earth)] rounded px-3 py-2">
                        {AREA_PRESETS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
                      </select>
                      <button type="button" onClick={runAiRoof} disabled={aiBusy} className="btn-ae w-full mt-3 disabled:opacity-50">
                        {aiBusy ? "Running AI roof analysis…" : "Open Roof Plan Review (AI)"}
                      </button>
                      {analysis.sectionCount > 0 && <p className="text-xs text-neutral-500 mt-2">AI: {analysis.roofType} · {analysis.sectionCount} sections · ridge {analysis.ridgeLm} lm · quality {analysis.qualityScore ?? "—"}</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {/* Client Details */}
              <div className="ae-card p-5">
                <h6 className="font-bold mb-3">Client Details</h6>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Client Name *"><input value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" /></Field>
                  <Field label="Company"><input value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" /></Field>
                  <Field label="Email"><input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" /></Field>
                  <Field label="Phone"><input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" /></Field>
                </div>
              </div>

              {/* Roof Setup */}
              <div className="ae-card p-5">
                <div className="flex items-center justify-between mb-2"><h6 className="font-bold">Roof Setup</h6><span className="det-badge det-geoscape">ROOF INPUT</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Roof Type">
                    <select value={roofTypeSel} onChange={(e) => setRoofTypeSel(e.target.value)} className="w-full border border-[var(--ae-earth)] rounded px-3 py-2">
                      <option value="gable">Gable — $120/m² (simple, single ridge)</option>
                      <option value="hip">Hip — $130/m² (standard QLD residential)</option>
                      <option value="ultra">Ultra — $140/m² (complex multi-wing)</option>
                    </select>
                  </Field>
                  <Field label="Storeys">
                    <select value={storeys} onChange={(e) => setStoreys(e.target.value)} className="w-full border border-[var(--ae-earth)] rounded px-3 py-2">
                      <option value="1">Single storey</option><option value="2">Double storey</option><option value="3">3+ storeys</option>
                    </select>
                  </Field>
                  <Field label="Roof area (m²)"><input type="number" step="0.01" value={effectiveArea} onChange={(e) => setAreaOverride(Number(e.target.value))} className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" /></Field>
                  <Field label="Average Pitch"><select value={pitch} onChange={(e) => setPitch(e.target.value)} className="w-full border border-[var(--ae-earth)] rounded px-3 py-2">{PITCH_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                </div>
                {Number(storeys) >= 2 && <p className="text-xs text-neutral-500 mt-2">Double/3+ storey → highset allowance applies to asbestos/solar items.</p>}
              </div>

              {/* Roof measurements (from analysis) */}
              {analysis && (
                <details className="ae-card p-5" open>
                  <summary className="font-bold cursor-pointer">Roof measurements</summary>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 text-sm">
                    <Stat label="Perimeter" value={`${analysis.perimeterM} m`} />
                    <Stat label="Sections" value={String(analysis.sectionCount)} />
                    <Stat label="Roof type (AI)" value={analysis.roofType} />
                    <Stat label="Ridge" value={`${analysis.ridgeLm} lm`} />
                    <Stat label="Hip" value={`${analysis.hipLm} lm`} />
                    <Stat label="Quality" value={analysis.qualityScore == null ? "—" : String(analysis.qualityScore)} />
                  </div>
                </details>
              )}

              {/* Material / Colour */}
              <div className="ae-card p-5">
                <div className="flex items-center justify-between mb-2"><h6 className="font-bold">Material / Colour</h6><span className="det-badge det-solar">SCOPE WORDING ONLY</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Material"><select value={material} onChange={(e) => setMaterial(e.target.value)} className="w-full border border-[var(--ae-earth)] rounded px-3 py-2">{MATERIAL_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  <Field label="Waste factor (%)"><input type="number" step="0.1" value={waste} onChange={(e) => setWaste(e.target.value)} className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" /></Field>
                </div>
              </div>

              {/* Cost Options */}
              <div className="ae-card p-5">
                <div className="flex items-center justify-between mb-3"><h6 className="font-bold">Cost Options</h6><span className="det-badge det-geoscape">AFFECTS PRICE</span></div>
                <div className="divide-y divide-[var(--ae-earth)]/40">
                  <ToggleRow title="Guttering & downpipes" note="$100/lm + $250/downpipe (separate sub-quote)" on={opts.gutter} onToggle={() => toggleOpt("gutter")} />
                  {opts.gutter && (
                    <div className="flex gap-4 items-center py-2 pl-2 text-sm">
                      <label className="flex items-center gap-2">Gutter LM <input type="number" min="0" step="0.5" placeholder="auto" value={gutterLm} onChange={(e) => setGutterLm(e.target.value)} className="w-20 border border-[var(--ae-earth)] rounded px-2 py-1" /></label>
                      <label className="flex items-center gap-2">Downpipes (90mm) <input type="number" min="0" value={downpipe90} onChange={(e) => setDownpipe90(e.target.value)} className="w-16 border border-[var(--ae-earth)] rounded px-2 py-1" /></label>
                    </div>
                  )}
                  <ToggleRow title="Asbestos roof removal" note="$252 base + $1,485 highset" on={opts.asbestos} onToggle={() => toggleOpt("asbestos")} />
                  <ToggleRow title="Decromastic tile removal" note="$110/m² premium" on={opts.decromastic} onToggle={() => toggleOpt("decromastic")} />
                  <ToggleRow title="Solar panels — Remove & Reinstall" note="$126/panel (+$250 if highset)" on={opts.solar_rr} onToggle={() => toggleOpt("solar_rr")} />
                  {opts.solar_rr && (
                    <div className="py-2 pl-2 text-sm"><label className="flex items-center gap-2">Panel count <input type="number" min="0" value={solarPanelCount} onChange={(e) => setSolarPanelCount(e.target.value)} className="w-20 border border-[var(--ae-earth)] rounded px-2 py-1" /></label></div>
                  )}
                  <ToggleRow title="Solar Hot Water — R&R" note="$1,800" on={opts.solar_hw} onToggle={() => toggleOpt("solar_hw")} />
                  <ToggleRow title="Fuse Pull (Ergon disconnect)" note="$500 (almost always required)" on={opts.fuse_pull} onToggle={() => toggleOpt("fuse_pull")} />
                  <ToggleRow title="Skip Bins" note="$1,600 each; 1 bin per 200 m²" on={opts.bins} onToggle={() => toggleOpt("bins")} />
                  <ToggleRow title="Batten Replacement" note="$16.50/lm; 2 lm per m² of roof" on={opts.batten} onToggle={() => toggleOpt("batten")} />
                  <ToggleRow title="Fascia Covers" note="$65/lm of eave" on={opts.fascia} onToggle={() => toggleOpt("fascia")} />
                </div>
                <details className="mt-3 text-sm text-neutral-500">
                  <summary className="cursor-pointer font-semibold">Included automatically</summary>
                  <div className="mt-2 leading-relaxed">• Edge protection / safety rail — $19/lm of eave<br />• Travel allowance — auto-detected from suburb/postcode<br />• 10% markup on internal cost, then 10% GST</div>
                </details>
              </div>

              {/* Notes */}
              <div className="ae-card p-5">
                <h6 className="font-bold mb-2">📝 Notes</h6>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Access notes, inclusions, exclusions…" className="w-full border border-[var(--ae-earth)] rounded px-3 py-2" />
              </div>
            </div>
          )}

          {step === 4 && (
            <form action={createQuote} className="ae-card p-5 space-y-3">
              <h2 className="font-semibold">Review &amp; generate</h2>
              <dl className="text-sm grid grid-cols-2 gap-2">
                <Row k="Property" v={address} />
                <Row k="Client" v={clientName || "—"} />
                <Row k="Roof area" v={`${effectiveArea} m²`} />
                <Row k="Roof type" v={roofTypeSel} />
                <Row k="Material" v={material} />
                <Row k="Pricing" v={mechanism === "packages" ? `Packages · ${packageTier}` : mechanism === "tapered" ? "Tapered $/m²" : `Cost-plus · ${mode}`} />
                {priced && <Row k="Total inc GST" v={currency(priced.total_inc_gst)} />}
              </dl>

              {/* All fields posted to the server action */}
              <input type="hidden" name="address" value={address} />
              <input type="hidden" name="suburb" value={suburb} />
              <input type="hidden" name="flat_area_sqm" value={effectiveArea} />
              <input type="hidden" name="roof_area_m2" value={effectiveArea} />
              <input type="hidden" name="perimeter_m" value={analysis?.perimeterM ?? ""} />
              <input type="hidden" name="eave_lm" value={analysis?.perimeterM ?? ""} />
              <input type="hidden" name="roof_polygon_json" value={analysis?.outline?.length ? JSON.stringify(analysis.outline) : ""} />
              <input type="hidden" name="roof_type" value={roofTypeSel} />
              <input type="hidden" name="storeys" value={storeys} />
              <input type="hidden" name="pitch_type" value={pitch} />
              <input type="hidden" name="material" value={material} />
              <input type="hidden" name="waste_factor_pct" value={waste} />
              <input type="hidden" name="client_name" value={clientName} />
              <input type="hidden" name="client_company" value={clientCompany} />
              <input type="hidden" name="client_email" value={clientEmail} />
              <input type="hidden" name="client_phone" value={clientPhone} />
              <input type="hidden" name="notes" value={notes} />
              <input type="hidden" name="pricing_mechanism" value={mechanism} />
              <input type="hidden" name="package_tier" value={packageTier} />
              <input type="hidden" name="pricing_mode" value={mode} />
              <input type="hidden" name="gutter_lm" value={gutterLm} />
              <input type="hidden" name="downpipe_90mm" value={downpipe90} />
              <input type="hidden" name="solar_panel_count" value={solarPanelCount} />
              {opts.gutter && <input type="hidden" name="inc_gutter" value="on" />}
              {opts.asbestos && <input type="hidden" name="inc_asbestos" value="on" />}
              {opts.decromastic && <input type="hidden" name="inc_decromastic" value="on" />}
              {opts.solar_rr && <input type="hidden" name="inc_solar_rr" value="on" />}
              {opts.solar_hw && <input type="hidden" name="inc_solar_hw" value="on" />}
              {opts.fuse_pull && <input type="hidden" name="inc_fuse_pull" value="on" />}
              {opts.bins && <input type="hidden" name="inc_bins" value="on" />}
              {opts.batten && <input type="hidden" name="inc_batten" value="on" />}
              {opts.fascia && <input type="hidden" name="inc_fascia" value="on" />}

              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(3)} className="btn-ae-outline">Back</button>
                <button type="submit" disabled={!address.trim() || effectiveArea <= 0} className="btn-ae flex-1 disabled:opacity-40">Create Quote</button>
              </div>
            </form>
          )}
        </div>

        <div className="space-y-4">
          {step >= 3 && priced ? (
            <div className="ae-card p-5 sticky top-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">Pricing Estimate</div>
                <span className="det-badge det-geoscape">PORT CITY MATCH</span>
              </div>
              <div className="mb-3">
                <label className="text-xs text-neutral-500 uppercase">Pricing mechanism</label>
                <select value={mechanism} onChange={(e) => setMechanism(e.target.value)} className="w-full border border-[var(--ae-earth)] rounded px-2 py-1.5 text-sm mt-1">
                  <option value="cost_plus">🎯 Cost-Plus (Port City) — line items × markup</option>
                  <option value="tapered">📉 Tapered $/m² — lower rate on bigger jobs</option>
                  <option value="packages">📦 Good / Better / Best — package tiers</option>
                </select>
                {mechanism === "packages" ? (
                  <div className="grid grid-cols-3 gap-1 mt-2">
                    {[["essential", "🥉 Essential", "10%"], ["shield", "🥈 Shield", "18%"], ["summit", "🥇 Summit", "30%"]].map(([v, l, p]) => (
                      <button key={v} type="button" onClick={() => setPackageTier(v)} className={`text-xs py-1.5 rounded border ${packageTier === v ? "bg-[var(--ae-space)] text-white border-[var(--ae-space)]" : "border-[var(--ae-earth)]"}`}>{l}<br /><span className="opacity-70">{p}</span></button>
                    ))}
                  </div>
                ) : mechanism === "cost_plus" ? (
                  <div className="grid grid-cols-3 gap-1 mt-2">
                    {[["match", "🎯 Match", "10%"], ["optimal", "💰 Optimal", "18%"], ["premium", "👑 Premium", "25%"]].map(([v, l, p]) => (
                      <button key={v} type="button" onClick={() => setMode(v)} className={`text-xs py-1.5 rounded border ${mode === v ? "bg-[#1b5e20] text-white border-[#1b5e20]" : "border-[var(--ae-earth)]"}`}>{l}<br /><span className="opacity-70">{p}</span></button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="text-center mb-3 p-3 rounded" style={{ background: "rgba(220,159,130,.15)", border: "1px solid rgba(220,159,130,.4)" }}>
                <div className="text-xs text-neutral-500 uppercase tracking-wide">Total Tender Price (incl. GST)</div>
                <div className="est-area-big" style={{ fontSize: "2rem" }}>{currency(priced.total_inc_gst)}</div>
                <div className="text-xs text-neutral-500">incl. {currency(priced.gst)} GST</div>
              </div>
              <Line k="Roof area (slope)" v={`${effectiveArea} m²`} />
              <Line k="Roof type" v={`${roofTypeSel} @ ${currency(ratePerM2)}/m²`} />
              <hr className="my-2 border-[var(--ae-earth)]/50" />
              <div className="font-mono text-[0.66rem] leading-relaxed text-neutral-600 max-h-48 overflow-auto">
                {priced.items.map((i, idx) => (
                  <div key={idx} className="flex justify-between gap-2"><span className="truncate">{i.description}</span><span>{currency(i.amount)}</span></div>
                ))}
                {priced.gutter_items.map((i, idx) => (
                  <div key={`g${idx}`} className="flex justify-between gap-2 text-[#1b5e20]"><span className="truncate">{i.description}</span><span>{currency(i.amount)}</span></div>
                ))}
              </div>
              <hr className="my-2 border-[var(--ae-earth)]/50" />
              <Line k="Internal subtotal" v={currency(priced.internal_subtotal)} />
              <Line k={`× ${(1 + priced.markup_pct).toFixed(2)} markup`} v={currency(priced.quoted_ex_gst)} />
              <Line k="+ Gutter sub-quote" v={currency(priced.gutter_subtotal)} />
              <div className="flex justify-between text-sm font-bold"><span>Subtotal ex GST</span><span>{currency(priced.grand_total_ex_gst)}</span></div>
              <Line k="+ GST (10%)" v={currency(priced.gst)} />
            </div>
          ) : (
            <div className="quote-side-panel">
              <div className="qj-kicker mb-2">Quote output</div>
              <div className={`quote-side-row ${address ? "ready" : ""}`}><div className="quote-side-dot" /><div><strong>Property</strong><span>{address || "Waiting for address"}</span></div></div>
              <div className={`quote-side-row ${analysis ? "ready" : ""}`}><div className="quote-side-dot" /><div><strong>Roof measurement</strong><span>{analysis ? `${effectiveArea} m² · ${analysis.sourceLabel}` : "Area not selected"}</span></div></div>
              <div className="quote-side-row"><div className="quote-side-dot" /><div><strong>Quote</strong><span>Client details and options appear after measurement.</span></div></div>
            </div>
          )}
        </div>
      </div>

      {roofPlan && <RoofPlanDialog plan={roofPlan} onClose={() => setRoofPlan(null)} onApply={(m, edited) => applyRoofPlan(roofPlan, m, edited)} />}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <><dt className="text-neutral-500">{k}</dt><dd className="font-medium">{v}</dd></>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs text-neutral-500 uppercase tracking-wide">{label}</span><div className="mt-1">{children}</div></label>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-neutral-500 text-xs uppercase tracking-wide">{label}</div><div className="font-semibold">{value}</div></div>;
}

function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between text-sm mb-1"><span className="text-neutral-500">{k}</span><span>{v}</span></div>;
}

function ToggleRow({ title, note, on, onToggle }: { title: string; note: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 gap-3">
      <div><strong className="text-sm">{title}</strong> <span className="text-neutral-500 text-xs">— {note}</span></div>
      <button type="button" onClick={onToggle} aria-pressed={on} className={`shrink-0 w-10 h-6 rounded-full relative transition ${on ? "bg-[var(--ae-space)]" : "bg-[var(--ae-earth)]"}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
