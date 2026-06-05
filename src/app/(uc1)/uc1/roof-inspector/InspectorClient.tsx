"use client";

import { useCallback, useState } from "react";
import GoogleMap, { type LatLng } from "@/components/GoogleMap";

export function InspectorClient({ apiKey }: { apiKey: string }) {
  const [center, setCenter] = useState<LatLng>([-19.2576, 146.8178]);
  const [zoom, setZoom] = useState(13);
  const [clickPoint, setClickPoint] = useState<LatLng | null>(null);
  const [outline, setOutline] = useState<LatLng[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const onPlace = (lat: number, lng: number) => {
    setCenter([lat, lng]);
    setZoom(20);
  };

  const analyze = useCallback(async (lat: number, lng: number) => {
    setClickPoint([lat, lng]);
    setBusy(true);
    setResult(null);
    try {
      const [building, roof, solar] = await Promise.all([
        fetch(`/api/uc1/building?lat=${lat}&lon=${lng}`).then((r) => r.json()).catch(() => ({})),
        fetch("/api/uc1/roof-drawing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng }) }).then((r) => r.json()).catch(() => ({})),
        fetch("/api/uc1/solar-analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng }) }).then((r) => r.json()).catch(() => ({})),
      ]);
      const ol = (Array.isArray(roof.ai_footprint) && roof.ai_footprint.length >= 3 && roof.ai_footprint) || (Array.isArray(building.geometry) && building.geometry) || [];
      setOutline(ol);
      const sections = Array.isArray(roof.sections) ? roof.sections : [];
      setResult({
        roof_type: roof.roof_type, confidence: roof.confidence, sections: sections.length,
        area_m2: Math.round((sections.reduce((s: number, x: { area_m2?: number }) => s + (x.area_m2 ?? 0), 0) || building.area_sqm || 0) * 10) / 10,
        ridge_lm: roof.ridge_lm, hip_lm: roof.hip_lm, quality: roof.quality?.quality_score,
        solar_ok: solar.ok, solar_max_kw: solar.solar_max_cap_kw, solar_kwh_yr: solar.solar_max_kwh_yr,
        building_area: building.area_sqm, building_source: building.source,
      });
    } finally { setBusy(false); }
  }, []);

  return (
    <div className="px-8 grid gap-6 lg:grid-cols-2">
      <div className="ae-card p-4">
        <GoogleMap apiKey={apiKey} center={center} zoom={zoom} clickPoint={clickPoint} outline={outline} showSearch onMapClick={analyze} onPlaceSelected={onPlace} height={480} />
        <p className="text-xs text-neutral-500 mt-2">Click a roof to inspect measurements + solar potential.</p>
      </div>
      <div className="ae-card p-5">
        <h2 className="font-semibold mb-3">Inspection</h2>
        {busy ? <p className="text-neutral-500">Analysing…</p> : result ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Roof type" value={`${result.roof_type} (${result.confidence})`} />
            <Stat label="Sections" value={String(result.sections)} />
            <Stat label="Detected area" value={`${result.area_m2} m²`} />
            <Stat label="Building (Geoscape/MS)" value={result.building_area ? `${result.building_area} m² (${result.building_source})` : "—"} />
            <Stat label="Ridge / Hip" value={`${result.ridge_lm} / ${result.hip_lm} lm`} />
            <Stat label="Quality" value={result.quality == null ? "—" : String(result.quality)} />
            <Stat label="Solar max" value={result.solar_ok ? `${result.solar_max_kw} kW` : "no coverage"} />
            <Stat label="Solar yield" value={result.solar_ok ? `${result.solar_kwh_yr} kWh/yr` : "—"} />
          </div>
        ) : <p className="text-neutral-500">No inspection yet.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-neutral-500 text-xs uppercase tracking-wide">{label}</div><div className="font-semibold">{value}</div></div>;
}
