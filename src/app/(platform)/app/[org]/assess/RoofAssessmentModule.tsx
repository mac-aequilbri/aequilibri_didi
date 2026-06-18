// Mini UC1 module on the assessment review screen for roof-replacement jobs.
// It confirms the building the way UC1 does — the authoritative Geoscape /
// Microsoft building FOOTPRINT (from /api/uc1/building) drawn on a Google
// satellite map — rather than the AI roof trace, which UC1 itself treats as
// unreliable. Click or search to re-locate the building; the measured footprint
// area can be pushed into the assessment to inform budget & duration. The
// optional AI roof editor (RoofPlanDialog) is available for section/pitch detail.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import GoogleMap, { type LatLng } from "@/components/GoogleMap";
import RoofPlanDialog, { type RoofPlan } from "@/app/(uc1)/uc1/quotes/new/RoofPlanDialog";
import { reestimateWithRoofAreaAction } from "./actions";

function ReestimateButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className="btn-ae text-sm disabled:opacity-40">
      {pending ? "Re-estimating…" : "Apply roof area & re-estimate"}
    </button>
  );
}

interface BuildingInfo {
  outline: LatLng[];
  areaM2: number;
  source: string;
  sourceLabel: string;
}

const DEFAULT_CENTER: LatLng = [-27.47, 153.02]; // QLD fallback when no coords

export function RoofAssessmentModule({
  orgSlug,
  assessmentId,
  address,
  mapsApiKey,
  geocode,
}: {
  orgSlug: string;
  assessmentId: number;
  address: string;
  mapsApiKey: string;
  geocode: { lat?: number; lng?: number; formatted?: string; suburb?: string; source: string; confidence: number };
}) {
  const hasCoords = typeof geocode.lat === "number" && typeof geocode.lng === "number";

  const [center, setCenter] = useState<LatLng>(hasCoords ? [geocode.lat!, geocode.lng!] : DEFAULT_CENTER);
  const [clickPoint, setClickPoint] = useState<LatLng | null>(hasCoords ? [geocode.lat!, geocode.lng!] : null);
  const [building, setBuilding] = useState<BuildingInfo | null>(null);
  const [loading, setLoading] = useState(hasCoords);
  const [error, setError] = useState<string | null>(null);

  // Optional AI roof detail (sections + pitch), fetched lazily like UC1.
  const [roofPlan, setRoofPlan] = useState<RoofPlan | null>(null);
  const [editing, setEditing] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [reviewedArea, setReviewedArea] = useState<number | null>(null);

  // Fetch only — no state writes — so it's safe to await from the mount effect
  // and from handlers without tripping the set-state-in-effect rule.
  // NB: point-based lookup ONLY (no address). Passing a street-only address
  // sends Geoscape down its address→building path, which mis-geocodes an
  // incomplete address to the wrong town (e.g. "11 Ahern Street" → a 12.5 m²
  // building in Brisbane). The Places coordinate is trustworthy, so findByPoint
  // is both correct and unambiguous.
  const fetchBuilding = useCallback(async (lat: number, lng: number) => {
    return fetch(`/api/uc1/building?lat=${lat}&lon=${lng}`)
      .then((r) => r.json())
      .catch(() => ({}));
  }, []);

  const applyBuilding = useCallback((b: { geometry?: unknown; area_sqm?: number; source?: string; source_label?: string }) => {
    const outline = Array.isArray(b?.geometry) ? (b.geometry as LatLng[]) : [];
    if (outline.length < 3) {
      setBuilding(null);
      setError("No building footprint found here — click the roof on the map to locate it.");
      return;
    }
    setError(null);
    setBuilding({
      outline,
      areaM2: Math.round((b.area_sqm || 0) * 10) / 10,
      source: b.source ?? "none",
      sourceLabel: b.source_label || (b.source === "geoscape" ? "Geoscape" : b.source === "microsoft" ? "Microsoft ML" : "estimate"),
    });
  }, []);

  // Re-locate from a map click or in-map search (event handlers — sync setState ok).
  const analyze = useCallback(
    async (lat: number, lng: number) => {
      setClickPoint([lat, lng]);
      setCenter([lat, lng]);
      setReviewedArea(null);
      setRoofPlan(null);
      setLoading(true);
      setError(null);
      try {
        applyBuilding(await fetchBuilding(lat, lng));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [fetchBuilding, applyBuilding],
  );

  // Mount auto-detect at the geocoded point. First statement awaits, so no
  // setState fires synchronously inside the effect body.
  useEffect(() => {
    if (!hasCoords) return;
    let cancelled = false;
    (async () => {
      try {
        const b = await fetchBuilding(geocode.lat!, geocode.lng!);
        if (!cancelled) applyBuilding(b);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasCoords, geocode.lat, geocode.lng, fetchBuilding, applyBuilding]);

  const openEditor = useCallback(async () => {
    if (!clickPoint) return;
    if (roofPlan) {
      setEditing(true);
      return;
    }
    setAiBusy(true);
    try {
      const roof = await fetch("/api/uc1/roof-drawing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: clickPoint[0], lng: clickPoint[1] }),
      })
        .then((r) => r.json())
        .catch(() => null);
      if (roof?.ok) {
        setRoofPlan(roof as RoofPlan);
        setEditing(true);
      } else {
        setError(roof?.error || "Detailed roof view is unavailable (check Google Maps API key).");
      }
    } finally {
      setAiBusy(false);
    }
  }, [clickPoint, roofPlan]);

  const appliedArea = reviewedArea ?? building?.areaM2 ?? 0;

  return (
    <section className="ae-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="font-semibold text-sm">Roof check</h3>
          <p className="text-xs text-neutral-500">
            Confirm the building before accepting. If the pin is on the wrong building,
            click the correct roof on the map.
          </p>
        </div>
        {building && (
          <span className="text-[11px] text-neutral-500">
            Footprint via {building.sourceLabel}
          </span>
        )}
      </div>

      {/* Validated address */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm mb-3">
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
      </div>

      {/* Map with authoritative building footprint */}
      <GoogleMap
        apiKey={mapsApiKey}
        center={center}
        zoom={20}
        clickPoint={clickPoint}
        outline={building?.outline ?? []}
        onMapClick={(lat, lng) => void analyze(lat, lng)}
        height={380}
      >
        {building && (
          <div className="absolute top-2 right-2 rounded-lg bg-black/70 text-white px-3 py-1.5 text-sm font-bold">
            {building.areaM2} m²
          </div>
        )}
      </GoogleMap>

      {loading && <p className="text-sm text-neutral-500 mt-2">Locating building…</p>}
      {error && !loading && (
        <p className="text-sm text-amber-700 mt-2">{error}</p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={() => void openEditor()}
          disabled={!clickPoint || aiBusy}
          className="btn-ae-outline text-sm disabled:opacity-40"
        >
          {aiBusy ? "Loading roof detail…" : "Open roof editor (sections & pitch)"}
        </button>
        <form action={reestimateWithRoofAreaAction}>
          <input type="hidden" name="org" value={orgSlug} />
          <input type="hidden" name="assessmentId" value={assessmentId} />
          <input type="hidden" name="areaSqm" value={appliedArea || ""} />
          <ReestimateButton disabled={!appliedArea} />
        </form>
      </div>
      {appliedArea > 0 && (
        <p className="text-[11px] text-neutral-500 mt-2">
          Re-estimating regenerates the budget, duration and phases from the measured roof
          footprint ({appliedArea} m²).
        </p>
      )}

      {editing && roofPlan && (
        <RoofPlanDialog
          plan={roofPlan}
          onClose={() => setEditing(false)}
          onApply={(m) => {
            setReviewedArea(m.footprint_m2 || m.area_m2 || null);
            setEditing(false);
          }}
        />
      )}
    </section>
  );
}
