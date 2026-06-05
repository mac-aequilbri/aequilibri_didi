import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currency } from "@/lib/format";
import { PageHeader, MetricCard } from "@/components/PageHeader";
import { fullSolarAnalysis } from "@/services/uc1/solar";

export const dynamic = "force-dynamic";

function centroidFromPolygon(json: string | null): [number, number] | null {
  if (!json) return null;
  try {
    const coords: number[][] = JSON.parse(json);
    if (!Array.isArray(coords) || coords.length < 3) return null;
    let lat = 0, lng = 0;
    for (const c of coords) {
      // stored as [lat, lon]
      lat += Number(c[0]);
      lng += Number(c[1]);
    }
    return [lat / coords.length, lng / coords.length];
  } catch {
    return null;
  }
}

export default async function SolarBundle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const quote = await prisma.uc1Quote.findUnique({ where: { id: quoteId }, select: { refNumber: true, roofPolygonJson: true } }).catch(() => null);
  if (!quote) notFound();

  const point = centroidFromPolygon(quote.roofPolygonJson);
  const partner = await prisma.uc1SolarPartner.findFirst({ where: { isActive: true }, orderBy: { name: "asc" } }).catch(() => null);

  let solar: Record<string, unknown> | null = null;
  if (point) solar = await fullSolarAnalysis(point[0], point[1]).catch(() => null);

  const installValue = partner ? Number(partner.avgInstallValue) : 0;
  const feePct = partner ? Number(partner.referralFeePct) : 0;
  const referralFee = (installValue * feePct) / 100;

  return (
    <div>
      <PageHeader title="Solar Bundle" subtitle={quote.refNumber} actions={[{ href: `/uc1/quotes/${quoteId}`, label: "Back to Quote", variant: "outline" }]} />
      <div className="px-8 space-y-6">
        {!point ? (
          <div className="ae-card p-6 text-neutral-600">This quote has no roof polygon, so solar potential can&apos;t be located. Use the <strong>Roof Inspector</strong> to analyse solar potential by clicking a roof.</div>
        ) : !solar?.ok ? (
          <div className="ae-card p-6 text-neutral-600">Google Solar API has no coverage at this location ({String(solar?.error ?? "no data")}).</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <MetricCard value={`${solar.solar_max_cap_kw} kW`} label="Max system" />
              <MetricCard value={`${solar.solar_max_kwh_yr}`} label="kWh / year" />
              <MetricCard value={`${solar.solar_max_panels}`} label="Max panels" />
              <MetricCard value={`${solar.dominant_pitch_deg}°`} label="Dominant pitch" />
            </div>
            {partner && (
              <div className="ae-card p-5">
                <h2 className="font-semibold mb-2">Referral — {partner.name}</h2>
                <p className="text-sm text-neutral-600">Avg install value {currency(installValue)} · fee {String(feePct)}% → estimated referral fee <strong>{currency(referralFee)}</strong></p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
