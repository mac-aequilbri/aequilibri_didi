import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currency, toNum, formatDate } from "@/lib/format";
import { gst as gstOf, incGst } from "@/lib/money";
import { PageHeader, StatusBadge } from "@/components/PageHeader";
import { PITCH_FACTORS, materialDisplay } from "@/services/uc1/constants";
import { updateQuoteStatus, addLineItem, deleteLineItem, deleteQuote, repriceQuote, autoAddGuttering } from "./actions";

export const dynamic = "force-dynamic";

const PITCH_LABEL: Record<string, string> = { flat: "Flat 0°", low: "Low 10°", standard: "Standard 22°", steep: "Steep 35°", very_steep: "Very Steep 45°" };

function pricingBadge(q: { pricingMechanism: string; pricingMode: string; packageTier: string }): { label: string; cls: string } {
  if (q.pricingMechanism === "tapered") return { label: "📉 Tapered $/m²", cls: "bg-[#e3f2fd] text-[#0d47a1]" };
  if (q.pricingMechanism === "packages") {
    if (q.packageTier === "shield") return { label: "🥈 Shield · 18%", cls: "bg-[#fff3e0] text-[#e65100]" };
    if (q.packageTier === "summit") return { label: "🥇 Summit · 30%", cls: "bg-[#f3e5f5] text-[#6a1b9a]" };
    return { label: "🥉 Essential · 10%", cls: "bg-[#e8f5e9] text-[#1b5e20]" };
  }
  if (q.pricingMode === "optimal") return { label: "💰 Optimal · 18%", cls: "bg-[#e8f5e9] text-[#1b5e20]" };
  if (q.pricingMode === "premium") return { label: "👑 Premium · 25%", cls: "bg-[#e8f5e9] text-[#1b5e20]" };
  return { label: "🎯 Port City Match · 10%", cls: "bg-[#e8f5e9] text-[#1b5e20]" };
}

export default async function QuoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const quote = await prisma.uc1Quote
    .findUnique({ where: { id: quoteId }, include: { items: { orderBy: { sortOrder: "asc" } }, contact: true } })
    .catch(() => null);
  if (!quote) notFound();

  const subtotal = quote.items.reduce((s, i) => s + toNum(i.quantity) * toNum(i.unitPriceExGst), 0);
  const gst = gstOf(subtotal);
  const total = incGst(subtotal);
  const flat = toNum(quote.flatAreaSqm);
  const pitchFactor = PITCH_FACTORS[quote.pitchType] ?? 1;
  const adjusted = Math.round(flat * pitchFactor * (1 + toNum(quote.wasteFactorPct) / 100) * 100) / 100;
  const badge = pricingBadge(quote);
  const inp = "w-full border border-[var(--ae-earth)] rounded px-3 py-2";

  return (
    <div>
      <PageHeader
        title={quote.refNumber}
        subtitle={quote.propertyAddress}
        actions={[
          { href: `/uc1/quotes/new?address=${encodeURIComponent(quote.propertyAddress)}`, label: "🗺️ Re-analyse on Map", variant: "outline" },
          { href: `/uc1/quotes/${quote.id}/purchase`, label: "📦 Purchase Materials" },
          { href: `/uc1/quotes/${quote.id}/condition-report`, label: "📋 Condition Report", variant: "outline" },
          { href: `/uc1/quotes/${quote.id}/print`, label: "🖨 Export PDF" },
          { href: "/uc1/quotes", label: "← Back", variant: "outline" },
        ]}
      />

      <div className="px-8 grid gap-6 lg:grid-cols-[7fr_5fr]">
        {/* ── LEFT ── */}
        <div className="space-y-4">
          {/* Quote Summary */}
          <div className="ae-card p-5">
            <div className="flex justify-between items-start mb-3">
              <h6 className="font-bold">Quote Summary</h6>
              <form action={updateQuoteStatus} className="flex gap-2 items-center">
                <input type="hidden" name="id" value={quote.id} />
                <select name="status" defaultValue={quote.status} className="border border-[var(--ae-earth)] rounded px-2 py-1 text-sm">
                  <option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="declined">Declined</option>
                </select>
                <button className="btn-ae text-sm">Update</button>
              </form>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
              <div>
                <div className="text-neutral-500 text-xs">Client</div>
                <div className="font-bold">{quote.contact?.name ?? "—"}</div>
                {quote.contact?.company && <div>{quote.contact.company}</div>}
                {quote.contact?.email && <div className="text-neutral-500">{quote.contact.email}</div>}
              </div>
              <div>
                <div className="text-neutral-500 text-xs">Roof Specs</div>
                <div className="font-bold">{materialDisplay(quote.material)}</div>
                <div>{PITCH_LABEL[quote.pitchType] ?? quote.pitchType} (×{pitchFactor})</div>
                <div className="text-neutral-500">Waste: {toNum(quote.wasteFactorPct)}%</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg p-3 mb-3 text-center" style={{ background: "var(--ae-cream)" }}>
              <div><div className="text-neutral-500 text-xs">Flat Area</div><div className="font-bold">{flat} m²</div></div>
              <div><div className="text-neutral-500 text-xs">→ Adjusted</div><div className="font-bold" style={{ color: "var(--ae-space)" }}>{adjusted} m²</div></div>
              <div><div className="text-neutral-500 text-xs">Status</div><StatusBadge status={quote.status} /></div>
            </div>

            {/* Change pricing mechanism */}
            <div className="border-t border-[var(--ae-earth)]/50 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-bold">💰 Pricing Mechanism</div>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
              </div>
              <form action={repriceQuote} className="grid grid-cols-3 gap-2">
                <input type="hidden" name="id" value={quote.id} />
                <select name="new_mechanism" defaultValue={quote.pricingMechanism} className="border border-[var(--ae-earth)] rounded px-2 py-1.5 text-sm">
                  <option value="cost_plus">🎯 Cost-Plus</option><option value="tapered">📉 Tapered $/m²</option><option value="packages">📦 Packages</option>
                </select>
                <select name="new_mode" defaultValue={quote.pricingMode || "match"} className="border border-[var(--ae-earth)] rounded px-2 py-1.5 text-sm">
                  <option value="match">🎯 Match · 10%</option><option value="optimal">💰 Optimal · 18%</option><option value="premium">👑 Premium · 25%</option>
                </select>
                <select name="new_tier" defaultValue={quote.packageTier || "essential"} className="border border-[var(--ae-earth)] rounded px-2 py-1.5 text-sm">
                  <option value="essential">🥉 Essential · 10%</option><option value="shield">🥈 Shield · 18%</option><option value="summit">🥇 Summit · 30%</option>
                </select>
                <button className="btn-ae-outline col-span-3 text-sm">🔄 Re-price this quote</button>
              </form>
            </div>

            {quote.notes && (
              <div className="text-sm border-t border-[var(--ae-earth)]/50 pt-2 mt-3">
                <strong>Job notes (printed on quote):</strong>
                <div className="text-neutral-500 italic whitespace-pre-line">{quote.notes}</div>
              </div>
            )}
          </div>

          {/* Roof outline */}
          <div className="ae-card p-5">
            <div className="flex items-center justify-between mb-2">
              <h6 className="font-bold">🛰️ Roof Outline</h6>
              <Link href={`/uc1/quotes/new?address=${encodeURIComponent(quote.propertyAddress)}`} className="btn-ae-outline text-sm">🗺️ Open on Map</Link>
            </div>
            <p className="text-sm text-neutral-500">Captured at quote creation. Use “Open on Map” to verify or re-draw with the AI tool.</p>
            {quote.roofPolygonJson ? <RoofPlanSvg json={quote.roofPolygonJson} /> : <div className="mt-3 h-40 grid place-items-center bg-[var(--ae-cream)] rounded text-neutral-400 text-sm">No saved roof outline</div>}
          </div>

          {/* Line items */}
          <div className="ae-card overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--ae-earth)] flex items-center justify-between">
              <h6 className="font-bold">Line Items</h6>
              <form action={autoAddGuttering}>
                <input type="hidden" name="id" value={quote.id} />
                <button className="btn-ae-outline text-xs" title="Auto-calculate guttering from LiDAR perimeter">🪣 Auto-add Guttering</button>
              </form>
            </div>
            <table className="ae-table">
              <thead><tr><th>Description</th><th className="text-right">Qty</th><th>Unit</th><th className="text-right">Unit Price</th><th className="text-right">Total ex GST</th><th></th></tr></thead>
              <tbody>
                {quote.items.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-neutral-500">No line items.</td></tr>
                ) : quote.items.map((i) => {
                  const lineTotal = toNum(i.quantity) * toNum(i.unitPriceExGst);
                  const zero = lineTotal === 0;
                  return (
                    <tr key={i.id}>
                      <td>{i.description}{zero && <div className="text-neutral-400 text-xs">Included in roof replacement above</div>}</td>
                      <td className="text-right">{zero ? "—" : toNum(i.quantity)}</td>
                      <td>{zero ? "—" : i.unit}</td>
                      <td className="text-right">{zero ? "—" : currency(i.unitPriceExGst)}</td>
                      <td className="text-right font-bold">{zero ? "—" : currency(lineTotal)}</td>
                      <td className="text-right">
                        <form action={deleteLineItem} className="inline"><input type="hidden" name="id" value={quote.id} /><input type="hidden" name="item_id" value={i.id} /><button className="text-red-700 text-sm">✕</button></form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot style={{ background: "var(--ae-cream)" }}>
                <tr><td colSpan={4} className="text-right text-neutral-500">Subtotal ex GST</td><td className="text-right font-bold">{currency(subtotal)}</td><td /></tr>
                <tr><td colSpan={4} className="text-right text-neutral-500">GST (10%)</td><td className="text-right">{currency(gst)}</td><td /></tr>
                <tr><td colSpan={4} className="text-right font-bold text-base">Total inc GST</td><td className="text-right font-bold text-lg" style={{ color: "var(--ae-space)" }}>{currency(total)}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="space-y-4">
          <div className="ae-card p-5">
            <h6 className="font-bold mb-3">＋ Add Line Item</h6>
            <form action={addLineItem} className="space-y-2">
              <input type="hidden" name="id" value={quote.id} />
              <label className="block text-sm">Description *<input name="description" required className={inp} /></label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block text-sm">Qty *<input name="quantity" type="number" step="0.01" required className={inp} /></label>
                <label className="block text-sm">Unit<select name="unit" className={inp}><option>m²</option><option>lot</option><option>lm</option><option>each</option></select></label>
                <label className="block text-sm">Price ex GST<input name="unit_price_ex_gst" type="number" step="0.01" required className={inp} /></label>
              </div>
              <button className="btn-ae w-full text-sm">Add Item</button>
            </form>
          </div>

          <div className="ae-card p-5" style={{ background: "var(--ae-cream)" }}>
            <div className="text-xs font-bold text-neutral-500 mb-2">QUOTE TOTALS</div>
            <div className="flex justify-between mb-1"><span className="text-neutral-500">Subtotal ex GST</span><strong>{currency(subtotal)}</strong></div>
            <div className="flex justify-between mb-1"><span className="text-neutral-500">GST (10%)</span><strong>{currency(gst)}</strong></div>
            <hr className="my-2 border-[var(--ae-earth)]" />
            <div className="flex justify-between items-center"><span className="font-bold">TOTAL inc GST</span><span className="font-bold text-2xl" style={{ color: "var(--ae-space)" }}>{currency(total)}</span></div>
          </div>

          <div className="ae-card p-5">
            <div className="text-xs font-bold text-neutral-500 mb-2">CREATED</div>
            <div className="text-sm">{formatDate(quote.createdAt)}</div>
            <div className="text-sm text-neutral-500">Updated {formatDate(quote.updatedAt)}</div>
          </div>

          {/* Revenue Tools */}
          <div className="rounded-lg p-5" style={{ background: "#1a1a2e", color: "#fff" }}>
            <div className="font-bold mb-3 text-xs uppercase" style={{ color: "#f1c40f", letterSpacing: ".1em" }}>⚡ Revenue Tools</div>
            <div className="grid gap-2">
              <RevTool href="/uc1/guttering-rates" icon="🪣" title="Auto-Add Guttering" note="LiDAR-derived linear metres" />
              <RevTool href={`/uc1/quotes/${quote.id}/solar`} icon="☀️" title="Solar Bundle Referral" note="Earn referral fee via Solar API" />
              <RevTool href={`/uc1/quotes/${quote.id}/finance`} icon="💳" title="Finance Options" note="Monthly payment plans" />
              <RevTool href="/uc1/condition-reports" icon="🏠" title="Condition Report" note="AI-generated + charge $350" />
            </div>
          </div>

          <form action={deleteQuote} className="text-center">
            <input type="hidden" name="id" value={quote.id} />
            <button className="text-red-700 text-sm">🗑️ Delete Quote</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function RevTool({ href, icon, title, note }: { href: string; icon: string; title: string; note: string }) {
  return (
    <Link href={href} className="block rounded px-3 py-2 text-sm" style={{ background: "#2d2d44", border: "1px solid #3d3d5c" }}>
      {icon} {title}
      <span className="block text-xs" style={{ color: "#aaa" }}>{note}</span>
    </Link>
  );
}

function RoofPlanSvg({ json }: { json: string }) {
  let coords: number[][] = [];
  try { coords = JSON.parse(json); } catch { coords = []; }
  if (coords.length < 3) return <div className="mt-3 h-40 grid place-items-center bg-[var(--ae-cream)] rounded text-neutral-400 text-sm">No saved roof outline</div>;
  const lats = coords.map((c) => c[0]);
  const lngs = coords.map((c) => c[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const w = maxLng - minLng || 1, h = maxLat - minLat || 1;
  const pts = coords.map((c) => `${((c[1] - minLng) / w) * 100},${((maxLat - c[0]) / h) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="mt-3 w-full bg-[var(--ae-cream)] rounded" style={{ height: 220 }}>
      <polygon points={pts} fill="#27ae60" fillOpacity={0.25} stroke="#1e8e4e" strokeWidth={0.8} />
    </svg>
  );
}
