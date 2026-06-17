"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const RoofModel3D = dynamic(() => import("./RoofModel3D"), {
  ssr: false,
  loading: () => <div className="text-neutral-400 text-sm p-8">Loading 3D model…</div>,
});

export interface RoofSection { polygon?: number[][]; color?: string; facing?: string; area_m2?: number; label?: string; pitch_est?: number }
export interface RoofPlan {
  ok: boolean; image_b64: string; ai_outline_pct?: number[][]; footprint_pct?: number[][];
  sections?: RoofSection[]; roof_type?: string; confidence?: string; ridge_lm?: number; hip_lm?: number;
  valley_lm?: number; rake_lm?: number; ai_footprint?: number[][]; width?: number; height?: number;
  center?: { lat: number; lng: number };
  scale?: { meters_per_px?: number; zoom?: number };
  quality?: { quality_score?: number | null; needs_review?: boolean }; notes?: string;
}

export interface RoofMeasurement {
  area_m2: number; footprint_m2: number; perimeter_m: number; avg_pitch: number;
  section_count: number; roof_type: string; ridge_lm: number; hip_lm: number;
}

type Pt = [number, number];

export default function RoofPlanDialog({ plan, onClose, onApply }: { plan: RoofPlan; onClose: () => void; onApply: (m: RoofMeasurement, edited: { outline: number[][]; sections: RoofSection[]; outlineChanged: boolean }) => void }) {
  const W = plan.width ?? 640;
  const H = plan.height ?? 640;
  const mpp = plan.scale?.meters_per_px ?? 0.1;
  const initial = (plan.ai_outline_pct?.length ?? 0) >= 3 ? plan.ai_outline_pct! : plan.footprint_pct ?? [];

  type Snapshot = { outline: Pt[]; sections: RoofSection[] };
  const [outline, setOutline] = useState<Pt[]>(initial.map((p) => [p[0], p[1]]));
  const [sections, setSections] = useState<RoofSection[]>((plan.sections ?? []).map((s) => ({ ...s, polygon: s.polygon?.map((p) => [...p]) })));
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [redo, setRedo] = useState<Snapshot[]>([]);
  const [zoom, setZoom] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [view, setView] = useState<"edit" | "plan" | "3d">("edit");
  // drag.si === null → an outline vertex; otherwise the vi-th vertex of section si.
  const [drag, setDrag] = useState<{ si: number | null; vi: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const avgPitch = useMemo(() => {
    const ps = sections.map((s) => s.pitch_est ?? 0).filter((p) => p > 1);
    return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 20;
  }, [sections]);

  // Live geometry from the current outline.
  const geom = useMemo(() => {
    const px: Pt[] = outline.map(([x, y]) => [(x / 100) * W, (y / 100) * H]);
    let area2 = 0, perim = 0;
    const edges: { mid: Pt; len: number }[] = [];
    for (let i = 0; i < px.length; i++) {
      const a = px[i], b = px[(i + 1) % px.length];
      area2 += a[0] * b[1] - b[0] * a[1];
      const segM = Math.hypot(b[0] - a[0], b[1] - a[1]) * mpp;
      perim += segM;
      edges.push({ mid: [(outline[i][0] + outline[(i + 1) % outline.length][0]) / 2, (outline[i][1] + outline[(i + 1) % outline.length][1]) / 2], len: segM });
    }
    const footprint = (Math.abs(area2) / 2) * mpp * mpp;
    const slope = 1 / Math.max(Math.cos((avgPitch * Math.PI) / 180), 0.2);
    const total = footprint * slope;
    const cx = outline.reduce((s, p) => s + p[0], 0) / (outline.length || 1);
    const cy = outline.reduce((s, p) => s + p[1], 0) / (outline.length || 1);
    return { footprint: Math.round(footprint * 10) / 10, total: Math.round(total * 10) / 10, perim: Math.round(perim * 10) / 10, edges, centroid: [cx, cy] as Pt };
  }, [outline, W, H, mpp, avgPitch]);

  const snapshot = (): Snapshot => ({ outline: outline.map((p) => [...p] as Pt), sections: sections.map((s) => ({ ...s, polygon: s.polygon?.map((p) => [...p]) })) });
  const pushHistory = () => { setHistory((h) => [...h, snapshot()]); setRedo([]); };

  // Drag handling — outline vertices and section vertices share one path.
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)) * 100) / 100;
      const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)) * 100) / 100;
      if (drag.si === null) {
        setOutline((o) => o.map((p, i) => (i === drag.vi ? [x, y] : p)));
      } else {
        setSections((ss) => ss.map((s, si) => (si === drag.si ? { ...s, polygon: s.polygon?.map((p, vi) => (vi === drag.vi ? [x, y] : p)) } : s)));
      }
    };
    const up = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [drag]);

  const undo = () => setHistory((h) => { if (!h.length) return h; const prev = h[h.length - 1]; setRedo((r) => [...r, snapshot()]); setOutline(prev.outline); setSections(prev.sections); return h.slice(0, -1); });
  const redoFn = () => setRedo((r) => { if (!r.length) return r; const next = r[r.length - 1]; setHistory((hh) => [...hh, snapshot()]); setOutline(next.outline); setSections(next.sections); return r.slice(0, -1); });

  const apply = () => {
    // Did the estimator actually move/delete an outline vertex? Only then should
    // the corrected outline replace the trusted map outline.
    const outlineChanged = JSON.stringify(outline) !== JSON.stringify(initial.map((p) => [p[0], p[1]]));
    onApply({
      area_m2: geom.total, footprint_m2: geom.footprint, perimeter_m: geom.perim, avg_pitch: Math.round(avgPitch),
      section_count: sections.length, roof_type: plan.roof_type ?? "unknown", ridge_lm: plan.ridge_lm ?? 0, hip_lm: plan.hip_lm ?? 0,
    }, { outline: outline.map((p) => [...p]), sections, outlineChanged });
  };

  const conf = (plan.confidence ?? "low").toUpperCase();
  const ptsStr = (pts: number[][]) => pts.map((p) => `${p[0]},${p[1]}`).join(" ");

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col" style={{ background: "#1f2030" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: "#16172a" }}>
        <span className="grid place-items-center w-9 h-9 rounded font-bold text-sm" style={{ background: "#3a3b52" }}>RM</span>
        <div className="flex-1">
          <div className="font-bold leading-tight">Roof Measurements</div>
          <div className="text-xs text-neutral-400">Review outline, sections and pitch</div>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: conf === "HIGH" ? "#27ae60" : conf === "MEDIUM" ? "#e6a700" : "#b06a4a", color: "#fff" }}>{conf[0] + conf.slice(1).toLowerCase()}</span>
        <div className="flex rounded-lg overflow-hidden" style={{ background: "#2a2b40" }}>
          {(["edit", "plan", "3d"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className="px-3 py-1.5 text-sm font-semibold" style={{ background: view === v ? "var(--ae-space)" : "transparent", color: view === v ? "#fff" : "#cbd5e1" }}>
              {v === "edit" ? "Edit" : v === "plan" ? "2D Plan" : "3D Model"}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="btn-ae">Back to Quote</button>
      </div>
      <div className="px-4 py-2 text-sm" style={{ background: "#e8eef5", color: "#33415c" }}>Roof measurements ready for this address.</div>

      <div className="flex-1 flex min-h-0">
        {/* Left panel */}
        <aside className="w-80 shrink-0 overflow-auto p-4 space-y-5" style={{ background: "#fff" }}>
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Drawing summary</div>
            <div className="grid grid-cols-2 gap-2">
              <Mini big={`${geom.total} m2`} label="Total roof area" />
              <Mini big={`${geom.footprint} m2`} label="Footprint area" />
              <Mini big={`${geom.perim} m`} label="Perimeter" />
              <Mini big={`${Math.round(avgPitch)} deg`} label="Avg pitch" />
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">View</div>
            <div className="ae-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <button className="btn-ae-outline px-3" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>-</button>
                <input type="range" min={50} max={300} step={25} value={zoom * 100} onChange={(e) => setZoom(Number(e.target.value) / 100)} className="flex-1" />
                <button className="btn-ae-outline px-3" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>+</button>
                <button className="btn-ae-outline px-3" onClick={() => setZoom(1)}>Fit</button>
              </div>
              <div className="text-center text-xs text-neutral-500">Zoom: {Math.round(zoom * 100)}%</div>
              <button className="btn-ae-outline w-full text-sm" onClick={() => setShowLabels((s) => !s)}>{showLabels ? "🏷️ Hide Area Labels" : "🏷️ Show Area Labels"}</button>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Review measurements</div>
            <div className="ae-card p-3" style={{ background: "#f3fbf6", border: "1px solid #bfe6cc" }}>
              <strong className="block text-[#155724]">Touch what looks wrong</strong>
              <span className="block text-sm text-neutral-600 mt-1 mb-3">Drag a green point to reshape the outline, or a coloured point to adjust a section. Areas, perimeter and pitch recalculate live.</span>
              <button onClick={apply} className="btn-ae w-full mb-2" style={{ background: "#1e8e4e" }}>Use these measurements</button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={undo} disabled={!history.length} className="btn-ae-outline text-sm disabled:opacity-40">Undo</button>
                <button onClick={redoFn} disabled={!redo.length} className="btn-ae-outline text-sm disabled:opacity-40">Redo</button>
              </div>
              <button onClick={() => { pushHistory(); setSections([]); }} disabled={!sections.length} className="btn-ae-outline w-full text-sm mt-2 disabled:opacity-40" style={{ color: "#b91c1c", borderColor: "#f0c5c5" }}>Delete all sections</button>
            </div>
          </div>
        </aside>

        {/* Canvas */}
        <div className="flex-1 min-w-0 overflow-auto grid place-items-center" style={{ background: view === "3d" ? "#0c0c12" : view === "plan" ? "#f4f5f7" : "#0c0c12" }}>
          {view === "3d" ? (
            <div className="w-full h-full min-h-[400px]">
              <RoofModel3D outline={outline} W={W} H={H} mpp={mpp} avgPitch={avgPitch} />
            </div>
          ) : view === "plan" ? (
            <div className="p-6 w-full max-w-2xl">
              <svg viewBox="0 0 100 100" className="w-full bg-white rounded shadow" style={{ aspectRatio: "1 / 1" }}>
                <defs>
                  <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
                    <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#e6e8ec" strokeWidth="0.2" />
                  </pattern>
                </defs>
                <rect x="0" y="0" width="100" height="100" fill="url(#grid)" />
                {sections.map((s, i) => ((s.polygon?.length ?? 0) >= 3 ? <polygon key={i} points={ptsStr(s.polygon!)} fill={s.color ?? "#cfe8d6"} fillOpacity={0.55} stroke={s.color ?? "#27ae60"} strokeWidth={0.3} /> : null))}
                {outline.length >= 3 && <polygon points={ptsStr(outline)} fill="none" stroke="#1e8e4e" strokeWidth={0.8} strokeLinejoin="round" />}
                {showLabels && geom.edges.map((e, i) => (
                  <g key={i}>
                    <rect x={e.mid[0] - 4} y={e.mid[1] - 2} width={8} height={4} rx={1} fill="#fff" stroke="#cbd5d0" strokeWidth={0.15} />
                    <text x={e.mid[0]} y={e.mid[1] + 1.2} fontSize={2.6} textAnchor="middle" fill="#155724" fontWeight="700">{e.len.toFixed(1)} m</text>
                  </g>
                ))}
                {outline.length >= 3 && (
                  <g>
                    <text x={geom.centroid[0]} y={geom.centroid[1] - 0.5} fontSize={3} textAnchor="middle" fill="#1a1a2e" fontWeight="800">S1 · {geom.total} m²</text>
                    <text x={geom.centroid[0]} y={geom.centroid[1] + 3.2} fontSize={2.6} textAnchor="middle" fill="#666">{Math.round(avgPitch)}° pitch</text>
                  </g>
                )}
                <g><text x="94" y="8" fontSize="4" textAnchor="middle" fill="#1a1a2e" fontWeight="800">N</text><text x="94" y="12" fontSize="4" textAnchor="middle" fill="#1a1a2e">↑</text></g>
              </svg>
              <div className="text-center text-sm text-neutral-500 mt-3">2D roof plan · {geom.total} m² total · {geom.perim} m perimeter · {Math.round(avgPitch)}° pitch</div>
            </div>
          ) : (
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform .1s" }}>
              <div className="relative" style={{ width: Math.min(W, 700), height: Math.min(W, 700) * (H / W) }}>
                {plan.image_b64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`data:image/png;base64,${plan.image_b64}`} alt="Roof" className="block w-full h-full rounded" />
                ) : <div className="w-full h-full bg-neutral-800" />}
                <svg ref={svgRef} viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ touchAction: "none" }}>
                  {sections.map((s, i) => ((s.polygon?.length ?? 0) >= 3 ? <polygon key={i} points={ptsStr(s.polygon!)} fill={s.color ?? "#27ae60"} fillOpacity={0.25} stroke={s.color ?? "#27ae60"} strokeWidth={0.3} /> : null))}
                  {outline.length >= 3 && <polygon points={ptsStr(outline)} fill="#27ae60" fillOpacity={0.28} stroke="#27ae60" strokeWidth={0.8} strokeLinejoin="round" />}
                  {showLabels && geom.edges.map((e, i) => (
                    <g key={i}>
                      <rect x={e.mid[0] - 4} y={e.mid[1] - 2} width={8} height={4} rx={1} fill="#fff" opacity={0.92} />
                      <text x={e.mid[0]} y={e.mid[1] + 1.2} fontSize={2.6} textAnchor="middle" fill="#155724" fontWeight="700">{e.len.toFixed(1)} m</text>
                    </g>
                  ))}
                  {showLabels && outline.length >= 3 && (
                    <g>
                      <rect x={geom.centroid[0] - 9} y={geom.centroid[1] - 4} width={18} height={9} rx={1.5} fill="#1e8e4e" opacity={0.92} />
                      <text x={geom.centroid[0]} y={geom.centroid[1] - 0.5} fontSize={2.6} textAnchor="middle" fill="#fff" fontWeight="800">S1 · {geom.total} m2</text>
                      <text x={geom.centroid[0]} y={geom.centroid[1] + 3} fontSize={2.4} textAnchor="middle" fill="#dff4e7">{Math.round(avgPitch)} deg</text>
                    </g>
                  )}
                  {sections.map((s, si) => (s.polygon ?? []).map((p, vi) => (
                    <circle key={`s${si}-${vi}`} cx={p[0]} cy={p[1]} r={1.3} fill="#fff" stroke={s.color ?? "#2563eb"} strokeWidth={0.6} style={{ cursor: "grab" }} onPointerDown={(e) => { e.preventDefault(); pushHistory(); setDrag({ si, vi }); }} />
                  )))}
                  {outline.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={1.6} fill="#fff" stroke="#1e8e4e" strokeWidth={0.7} style={{ cursor: "grab" }} onPointerDown={(e) => { e.preventDefault(); pushHistory(); setDrag({ si: null, vi: i }); }} />
                  ))}
                </svg>
                {/* North arrow + scale + legend overlays */}
                <div className="absolute top-2 right-2 text-white text-xs font-bold">N ↑</div>
                <div className="absolute bottom-2 right-2 bg-white/90 rounded px-2 py-1 text-[11px]"><span className="inline-block w-3 h-3 align-middle mr-1" style={{ background: "#27ae60" }} />S1 · {geom.total} m2</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3" style={{ background: "#16172a", color: "#cbd5e1" }}>
        <span className="text-sm">Review the outline and sections, then use the measurements for the quote.</span>
        <button onClick={apply} className="btn-ae">Use These Measurements</button>
      </div>
    </div>
  );
}

function Mini({ big, label }: { big: string; label: string }) {
  return (
    <div className="ae-card p-3">
      <div className="text-xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>{big}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}
