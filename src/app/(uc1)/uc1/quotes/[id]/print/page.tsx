import { notFound } from "next/navigation";
import { currency, toNum, formatDate } from "@/lib/format";
import { gst as gstOf, incGst } from "@/lib/money";
import { materialDisplay } from "@/services/uc1/constants";
import { buildScopeOfWorks } from "@/services/uc1/pricing";
import { loadUc1Quote } from "@/lib/platform/uc1Source";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

const COMPANY = {
  name: "æquilibri Platform Pty Ltd",
  tagline: "ROOFING ESTIMATOR · COMMERCIAL & RESIDENTIAL",
  location: "Townsville, QLD, Australia",
  phone: "1300 000 000",
  email: "hello@aequilibri.com.au",
  abn: "00 000 000 000",
  qbcc: "0000000",
};
const VALID_DAYS = 90;

const PITCH_LABEL: Record<string, string> = { flat: "Flat 0°", low: "Low 10°", standard: "Standard 22°", steep: "Steep 35°", very_steep: "Very Steep 45°" };

// Parse "11 Ahern St, Ayr QLD 4807, Australia" → suburb + postcode.
function parseAddress(addr: string): { suburb: string; postcode: string } {
  const postcode = addr.match(/\b(\d{4})\b/)?.[1] ?? "";
  const state = addr.match(/\b(QLD|NSW|VIC|SA|WA|TAS|NT|ACT)\b/)?.[1] ?? "";
  let suburb = "";
  if (state) {
    const before = addr.split(state)[0];                       // "11 Ahern St, Ayr "
    suburb = before.split(",").map((p) => p.trim()).filter(Boolean).pop() ?? "";
  }
  return { suburb, postcode };
}

// Lat/lng polygon → footprint width (E–W) and height (N–S) in metres.
function footprintDims(coords: number[][]): { wM: number; hM: number } | null {
  if (coords.length < 3) return null;
  const lats = coords.map((c) => c[0]);
  const lngs = coords.map((c) => c[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const wM = Math.round((maxLng - minLng) * 111320 * Math.cos((midLat * Math.PI) / 180));
  const hM = Math.round((maxLat - minLat) * 110540);
  return { wM, hM };
}

export default async function QuotePrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = await loadUc1Quote(id);
  if (!quote) notFound();

  const subtotal = quote.items.reduce((s, i) => s + toNum(i.quantity) * toNum(i.unitPriceExGst), 0);
  const gst = gstOf(subtotal);
  const total = incGst(subtotal);

  const material = materialDisplay(quote.material);
  const area = toNum(quote.flatAreaSqm).toFixed(2);
  const pitchLabel = PITCH_LABEL[quote.pitchType] ?? quote.pitchType;
  const pitchDeg = toNum(quote.pitchDegActual);
  const { suburb, postcode } = parseAddress(quote.propertyAddress);

  // Derive customer-facing scope inputs from what was actually quoted.
  const itemText = (quote.items.map((i) => i.description).join(" ") + " " + quote.notes).toLowerCase();
  const scopeRows = [
    `${material} full roof replacement (as per scope of works below)`,
    ...buildScopeOfWorks({
      isAsbestos: /asbestos/.test(itemText),
      isDecromastic: /decromastic/.test(itemText),
      includeGutters: /gutter/.test(itemText),
      solarPanelsRr: Number(itemText.match(/(\d+)\s*solar panel/)?.[1] ?? 0),
      skylightCount: Number(itemText.match(/(\d+)\s*skylight/)?.[1] ?? 0),
    }),
  ];

  // Job notes may carry an internal pricing breakdown — never show that to the customer.
  // The marker is decorated with box-drawing chars (═══), so strip those trailing too.
  const customerNotes = (quote.notes || "")
    .split(/Internal pricing breakdown/i)[0]
    .replace(/[=═─\s-]+$/u, "")
    .trim();

  let polygon: number[][] = [];
  try { polygon = quote.roofPolygonJson ? JSON.parse(quote.roofPolygonJson) : []; } catch { polygon = []; }
  const dims = footprintDims(polygon);
  const dash = "—";

  return (
    <>
      <PrintButton />
      <style>{`
        @page { size: A4; margin: 14mm; }
        .q-page { page-break-after: always; }
        .q-page:last-child { page-break-after: auto; }
        .q-spec b { color: #1a1a2e; }
        @media print {
          /* Isolate the quote document — hide all app chrome (header/sidebar/toolbar). */
          body * { visibility: hidden !important; }
          .q-print, .q-print * { visibility: visible !important; }
          .q-print { position: absolute; left: 0; top: 0; width: 100%; background: #fff !important; padding: 0 !important; }
          .q-page { box-shadow: none !important; width: auto !important; margin: 0 auto !important; padding: 0 !important; }
        }
      `}</style>

      <main className="q-print" style={{ background: "#e9eaef", padding: "16px 0", color: "#2c2c2c", fontSize: 12.5, lineHeight: 1.45 }}>
        {/* ───────────── PAGE 1 ───────────── */}
        <section className="q-page" style={{ width: 794, maxWidth: "100%", margin: "0 auto", background: "#fff", padding: 40, boxShadow: "0 2px 12px rgba(0,0,0,.12)" }}>
          {/* Letterhead */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #b06a4a", paddingBottom: 14 }}>
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "#b06a4a", fontFamily: "Georgia, serif", lineHeight: 1 }}>æquilibri</div>
              <div style={{ fontSize: 10, letterSpacing: ".12em", color: "#6b6b6b", marginTop: 4 }}>{COMPANY.tagline}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: "#555" }}>
              <div style={{ fontWeight: 700, color: "#2c2c2c" }}>{COMPANY.name}</div>
              <div>{COMPANY.location}</div>
              <div>Ph: {COMPANY.phone} &nbsp; E: {COMPANY.email}</div>
              <div>ABN: {COMPANY.abn} &nbsp; QBCC Licence: {COMPANY.qbcc}</div>
            </div>
          </div>

          {/* Title + quote meta */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", margin: "18px 0 14px" }}>
            <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: "#1a1a2e" }}>Quote for {material} Roof Replacement</h1>
            <div style={{ textAlign: "right", fontSize: 11 }}>
              <div style={{ display: "inline-block", background: "#f6f1ea", border: "1px solid #e2d6c8", borderRadius: 6, padding: "4px 10px", fontWeight: 700, color: "#b06a4a", marginBottom: 4 }}>QUOTE VALID FOR {VALID_DAYS} DAYS</div>
              <div><span style={{ color: "#888" }}>Quote No</span> <b>{quote.refNumber}</b></div>
              <div><span style={{ color: "#888" }}>Quote date</span> <b>{formatDate(quote.createdAt)}</b></div>
            </div>
          </div>

          {/* Customer block */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 28px", border: "1px solid #e6e0d6", borderRadius: 6, padding: "10px 14px", marginBottom: 14 }}>
            <Row label="Name" value={quote.contact?.name || dash} />
            <Row label="Suburb" value={suburb || dash} />
            <Row label="Address" value={quote.propertyAddress} />
            <Row label="P/Code" value={postcode || dash} />
            <Row label="Email" value={quote.contact?.email || dash} />
            <Row label="Ph/Mob" value={quote.contact?.phone || dash} />
          </div>

          {/* Job description */}
          <SectionTitle>JOB DESCRIPTION: {quote.propertyAddress}</SectionTitle>
          <p style={{ margin: "4px 0 14px" }}>{material} full roof replacement &nbsp;·&nbsp; Roof area: {area} m² ({pitchLabel})</p>

          {/* Roof specifications */}
          <SectionTitle>ROOF SPECIFICATIONS</SectionTitle>
          <div className="q-spec" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 18px", border: "1px solid #e6e0d6", borderRadius: 6, padding: "10px 14px", margin: "4px 0 14px" }}>
            <Spec label="Total area" value={`${area} m²`} />
            <Spec label="Ridge" value={toNum(quote.ridgeLm) ? `${toNum(quote.ridgeLm)} lm` : dash} />
            <Spec label="Pitch" value={`${pitchDeg ? `${pitchDeg}° ` : ""}(${pitchLabel})`} />
            <Spec label="Eave" value={toNum(quote.eaveLm) ? `${toNum(quote.eaveLm)} lm` : dash} />
            <Spec label="Valley" value={toNum(quote.valleyLm) ? `${toNum(quote.valleyLm)} lm` : dash} />
            <Spec label="Storeys" value={String(quote.storeys)} />
            <Spec label="Hip" value={toNum(quote.hipLm) ? `${toNum(quote.hipLm)} lm` : dash} />
            <Spec label="Rake" value={toNum(quote.rakeLm) ? `${toNum(quote.rakeLm)} lm` : dash} />
            <Spec label="Material / Colour" value={`${material}${quote.roofColour ? ` · ${quote.roofColour}` : ""}`} />
          </div>

          {/* Scope of works */}
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "4px 0 14px" }}>
            <thead>
              <tr style={{ background: "#1a1a2e", color: "#fff" }}>
                <th style={{ textAlign: "left", padding: "6px 10px", width: 44 }}>Item</th>
                <th style={{ textAlign: "left", padding: "6px 10px" }}>Scope of Works</th>
              </tr>
            </thead>
            <tbody>
              {scopeRows.map((s, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #ece7df" }}>
                  <td style={{ padding: "6px 10px", verticalAlign: "top", color: "#888" }}>{i + 1}</td>
                  <td style={{ padding: "6px 10px" }}>{s}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Job notes + total tender */}
          <div style={{ display: "flex", gap: 16, alignItems: "stretch", marginBottom: 14 }}>
            <div style={{ flex: 1, fontSize: 11.5 }}>
              <div style={{ fontWeight: 700, color: "#888", fontSize: 10, letterSpacing: ".08em" }}>JOB NOTES</div>
              <div style={{ whiteSpace: "pre-line", color: "#444" }}>{customerNotes || dash}</div>
              <div style={{ marginTop: 8, fontSize: 11 }}>
                <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 220 }}><span style={{ color: "#888" }}>Subtotal</span><span>{currency(subtotal)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 220 }}><span style={{ color: "#888" }}>GST (10%)</span><span>{currency(gst)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 220, fontWeight: 700 }}><span>Total</span><span>{currency(total)}</span></div>
              </div>
            </div>
            <div style={{ width: 230, background: "#1a1a2e", color: "#fff", borderRadius: 8, padding: "12px 16px", textAlign: "right" }}>
              <div style={{ fontSize: 10, letterSpacing: ".1em", color: "#cbb8a8" }}>TOTAL TENDER PRICE</div>
              <div style={{ fontSize: 10, color: "#8a93a8" }}>GST INCLUDED</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{currency(total)}</div>
            </div>
          </div>

          {/* Terms */}
          <SectionTitle>TERMS AND CONDITIONS</SectionTitle>
          <p style={{ fontSize: 10, color: "#666", margin: "4px 0 14px", lineHeight: 1.5 }}>
            This quotation is given without obligation and is good for {VALID_DAYS} days from the issue date. If accepted, the work will be
            performed subject to the General Conditions. All work carried out in accordance with Australian Standards and NCC requirements.
            It is the responsibility of the homeowner to declare if Asbestos is present; additional costs may apply. GST is included in the
            total at 10%. This quote excludes guttering and downpipes unless explicitly stated.
          </p>

          {/* Acceptance */}
          <p style={{ fontStyle: "italic", margin: "0 0 18px" }}>I, the customer, agree that the roofing work described above is satisfactory and is hereby accepted.</p>
          <Signature />
        </section>

        {/* ───────────── PAGE 2 ───────────── */}
        <section className="q-page" style={{ width: 794, maxWidth: "100%", margin: "16px auto 0", background: "#fff", padding: 40, boxShadow: "0 2px 12px rgba(0,0,0,.12)" }}>
          <SectionTitle>ROOF PLAN · BUILDING FOOTPRINT</SectionTitle>
          {dims && <p style={{ margin: "4px 0 12px", color: "#444" }}>{dims.wM} m (E–W) · {dims.hM} m (N–S)</p>}
          {polygon.length >= 3 ? (
            <FootprintSvg coords={polygon} />
          ) : (
            <div style={{ height: 360, display: "grid", placeItems: "center", background: "#f6f1ea", borderRadius: 8, color: "#9a9a9a" }}>No saved roof outline</div>
          )}
          <div style={{ marginTop: 28 }}><Signature /></div>
        </section>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, padding: "2px 0" }}>
      <span style={{ color: "#888", minWidth: 64 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "#888" }}>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".06em", color: "#1a1a2e", margin: "0 0 2px", borderBottom: "2px solid #e2d6c8", paddingBottom: 3 }}>{children}</h2>;
}

function Signature() {
  return (
    <div style={{ display: "flex", gap: 40, marginTop: 18 }}>
      <div style={{ flex: 1, borderTop: "1px solid #999", paddingTop: 4, fontSize: 10, color: "#888" }}>Print Name &amp; Signature</div>
      <div style={{ width: 180, borderTop: "1px solid #999", paddingTop: 4, fontSize: 10, color: "#888" }}>Date</div>
    </div>
  );
}

function FootprintSvg({ coords }: { coords: number[][] }) {
  const lats = coords.map((c) => c[0]);
  const lngs = coords.map((c) => c[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const w = maxLng - minLng || 1, h = maxLat - minLat || 1;
  const pts = coords.map((c) => `${5 + ((c[1] - minLng) / w) * 90},${5 + ((maxLat - c[0]) / h) * 90}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: 380, background: "#f6f1ea", borderRadius: 8 }}>
      <polygon points={pts} fill="#27ae60" fillOpacity={0.22} stroke="#1e8e4e" strokeWidth={0.7} strokeLinejoin="round" />
      <text x="93" y="9" fontSize="5" textAnchor="middle" fill="#1a1a2e" fontWeight="800">N</text>
      <text x="93" y="14" fontSize="5" textAnchor="middle" fill="#1a1a2e">↑</text>
    </svg>
  );
}
