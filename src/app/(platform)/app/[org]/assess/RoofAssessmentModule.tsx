// Mini UC1 module surfaced on the assessment review screen for roof-replacement
// jobs. It confirms the building (validated address + map coordinates) and
// auto-detects the roof outline via the UC1 roof-drawing endpoint, so the
// estimator can verify the right roof before the plan is accepted. The detected
// roof area can be pushed back into the assessment to inform budget & duration.
"use client";

import { useCallback, useEffect, useState } from "react";
import RoofPlanDialog, {
  type RoofPlan,
  type RoofMeasurement,
} from "@/app/(uc1)/uc1/quotes/new/RoofPlanDialog";
import { reestimateWithRoofAreaAction } from "./actions";

type Pt = [number, number];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Footprint area + perimeter from a percentage-coordinate polygon. */
function polygonMetrics(pct: number[][], W: number, H: number, mpp: number): { footprint: number; perimeter: number } {
  if (!pct || pct.length < 3) return { footprint: 0, perimeter: 0 };
  const px: Pt[] = pct.map(([x, y]) => [(x / 100) * W, (y / 100) * H]);
  let area2 = 0;
  let perim = 0;
  for (let i = 0; i < px.length; i++) {
    const a = px[i];
    const b = px[(i + 1) % px.length];
    area2 += a[0] * b[1] - b[0] * a[1];
    perim += Math.hypot(b[0] - a[0], b[1] - a[1]) * mpp;
  }
  return { footprint: (Math.abs(area2) / 2) * mpp * mpp, perimeter: perim };
}

function measurementFromPlan(plan: RoofPlan): RoofMeasurement {
  const W = plan.width ?? 640;
  const H = plan.height ?? 640;
  const mpp = plan.scale?.meters_per_px ?? 0.1;
  const outline = (plan.ai_outline_pct?.length ?? 0) >= 3 ? plan.ai_outline_pct! : plan.footprint_pct ?? [];
  const pitches = (plan.sections ?? []).map((s) => s.pitch_est ?? 0).filter((p) => p > 1);
  const avgPitch = pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 20;
  const { footprint, perimeter } = polygonMetrics(outline, W, H, mpp);
  const slope = 1 / Math.max(Math.cos((avgPitch * Math.PI) / 180), 0.2);
  return {
    area_m2: round1(footprint * slope),
    footprint_m2: round1(footprint),
    perimeter_m: round1(perimeter),
    avg_pitch: Math.round(avgPitch),
    section_count: plan.sections?.length ?? 0,
    roof_type: plan.roof_type ?? "unknown",
    ridge_lm: plan.ridge_lm ?? 0,
    hip_lm: plan.hip_lm ?? 0,
  };
}

const ptsStr = (pts: number[][]) => pts.map((p) => `${p[0]},${p[1]}`).join(" ");

export function RoofAssessmentModule({
  orgSlug,
  assessmentId,
  address,
  geocode,
}: {
  orgSlug: string;
  assessmentId: number;
  address: string;
  geocode: { lat?: number; lng?: number; formatted?: string; suburb?: string; source: string; confidence: number };
}) {
  const hasCoords = typeof geocode.lat === "number" && typeof geocode.lng === "number";

  const [plan, setPlan] = useState<RoofPlan | null>(null);
  // Auto-detect on mount when we have coordinates, so start in the loading state
  // rather than flipping it on synchronously inside the effect.
  const [loading, setLoading] = useState(hasCoords);
  const [error, setError] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<RoofMeasurement | null>(null);
  const [editing, setEditing] = useState(false);

  // Fetch only — no state writes, so it's safe to await from both the mount
  // effect and the button handlers.
  const fetchRoof = useCallback(async () => {
    const res = await fetch("/api/uc1/roof-drawing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: geocode.lat, lng: geocode.lng, address }),
    });
    return res.json();
  }, [geocode.lat, geocode.lng, address]);

  const applyResult = useCallback((data: { ok?: boolean; error?: string }) => {
    if (!data?.ok) {
      setPlan(null);
      setError(data?.error || "Roof detection is unavailable (check Google Maps API key).");
      return;
    }
    setPlan(data as RoofPlan);
    setMeasurement(measurementFromPlan(data as RoofPlan));
  }, []);

  // Button-triggered (event handler) — synchronous setState here is fine.
  const detect = useCallback(async () => {
    if (!hasCoords) {
      setError("No coordinates — the address didn't geocode, so the roof can't be located.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      applyResult(await fetchRoof());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [hasCoords, fetchRoof, applyResult]);

  // Mount auto-detect. The first statement is an await, so no setState fires
  // synchronously inside the effect body.
  useEffect(() => {
    if (!hasCoords) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchRoof();
        if (!cancelled) applyResult(data);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasCoords, fetchRoof, applyResult]);

  const W = plan?.width ?? 640;
  const H = plan?.height ?? 640;
  const outline = plan ? ((plan.ai_outline_pct?.length ?? 0) >= 3 ? plan.ai_outline_pct! : plan.footprint_pct ?? []) : [];
  const conf = (plan?.confidence ?? "").toUpperCase();

  return (
    <section className="ae-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="font-semibold text-sm">Roof check</h3>
          <p className="text-xs text-neutral-500">
            Confirm the building and roof before accepting — measured from satellite imagery (UC1).
          </p>
        </div>
        {plan && conf && (
          <span
            className="text-[11px] font-semibold uppercase tracking-wide text-white px-2 py-0.5 rounded-full"
            style={{ background: conf === "HIGH" ? "#1e8e4e" : conf === "MEDIUM" ? "#e6a700" : "#b06a4a" }}
          >
            {conf[0] + conf.slice(1).toLowerCase()} confidence
          </span>
        )}
      </div>

      {/* Validated address */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            {geocode.confidence > 0 ? "✓ Validated address" : "Address"}
          </span>
          {geocode.source && (
            <span className="text-[11px] text-neutral-500">
              via {geocode.source}
              {geocode.confidence > 0 ? ` · ${geocode.confidence}% confidence` : ""}
            </span>
          )}
        </div>
        <p className="mt-1 font-medium">{geocode.formatted || address || "—"}</p>
        {hasCoords && (
          <p className="text-xs text-neutral-500">
            {geocode.lat!.toFixed(5)}, {geocode.lng!.toFixed(5)}
          </p>
        )}
      </div>

      {/* Roof preview */}
      {loading && <p className="text-sm text-neutral-500">Detecting roof…</p>}

      {error && !loading && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {error}
          {hasCoords && (
            <button type="button" onClick={() => void detect()} className="btn-ae-outline text-xs ml-3">
              Retry
            </button>
          )}
        </div>
      )}

      {plan && !loading && (
        <>
          <div className="relative w-full max-w-md mx-auto rounded overflow-hidden border border-neutral-200" style={{ aspectRatio: `${W} / ${H}` }}>
            {plan.image_b64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/png;base64,${plan.image_b64}`} alt="Roof satellite view" className="block w-full h-full" />
            ) : (
              <div className="w-full h-full bg-neutral-800" />
            )}
            {outline.length >= 3 && (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                <polygon points={ptsStr(outline)} fill="#27ae60" fillOpacity={0.28} stroke="#27ae60" strokeWidth={0.8} strokeLinejoin="round" />
              </svg>
            )}
          </div>

          {measurement && (
            <div className="grid grid-cols-4 gap-2 mt-3">
              {[
                [`${measurement.area_m2} m²`, "Roof area"],
                [`${measurement.footprint_m2} m²`, "Footprint"],
                [`${measurement.perimeter_m} m`, "Perimeter"],
                [`${measurement.avg_pitch}°`, "Avg pitch"],
              ].map(([big, label]) => (
                <div key={label} className="border border-neutral-100 rounded p-2 text-center">
                  <div className="font-bold text-sm">{big}</div>
                  <div className="text-[11px] text-neutral-500">{label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2 mt-4">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEditing(true)} className="btn-ae-outline text-sm">
                Open roof editor
              </button>
              <button type="button" onClick={() => void detect()} className="btn-ae-outline text-sm">
                Re-detect
              </button>
            </div>
            <form action={reestimateWithRoofAreaAction}>
              <input type="hidden" name="org" value={orgSlug} />
              <input type="hidden" name="assessmentId" value={assessmentId} />
              <input type="hidden" name="areaSqm" value={measurement?.area_m2 ?? ""} />
              <button type="submit" disabled={!measurement?.area_m2} className="btn-ae text-sm disabled:opacity-40">
                Apply roof area &amp; re-estimate
              </button>
            </form>
          </div>
          <p className="text-[11px] text-neutral-500 mt-2">
            Re-estimating regenerates the budget, duration and phases from the measured roof area
            ({measurement?.area_m2 ?? "—"} m²).
          </p>
        </>
      )}

      {editing && plan && (
        <RoofPlanDialog
          plan={plan}
          onClose={() => setEditing(false)}
          onApply={(m) => {
            setMeasurement(m);
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}
