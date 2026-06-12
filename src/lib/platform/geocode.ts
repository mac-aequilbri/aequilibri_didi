// Address geocoder (Platform Architecture doc utility layer): street address
// in → coordinates + locality out, via the source cascade. Providers register
// only when their keys are configured, so the cascade degrades gracefully:
//   1. Geoscape addresses geocoder (GEOSCAPE_CONSUMER_KEY) — GNAF-backed
//   2. Google Geocoding API (GOOGLE_MAPS_API_KEY)
// No keys → the cascade resolves null and the assessment flags the gap.

import type { SourceProvider } from "./sourceCascade";

export interface GeocodeResult {
  lat: number;
  lng: number;
  suburb: string;
  formatted: string;
}

function geoscapeProvider(address: string): SourceProvider<GeocodeResult> {
  return {
    name: "geoscape",
    confidence: 90,
    async fetch() {
      const qs = new URLSearchParams({ address, matchType: "address", maxResults: "1" });
      const res = await fetch(`https://api.psma.com.au/v2/addresses/geocoder?${qs}`, {
        headers: {
          Authorization: process.env.GEOSCAPE_CONSUMER_KEY!,
          Accept: "application/geo+json, application/json",
        },
        signal: AbortSignal.timeout(9_000),
      });
      if (!res.ok) throw new Error(`Geoscape ${res.status}`);
      const data = (await res.json()) as {
        features?: {
          geometry?: { coordinates?: number[] };
          properties?: { localityName?: string; formattedAddress?: string };
        }[];
      };
      const feature = data.features?.[0];
      const [lng, lat] = feature?.geometry?.coordinates ?? [];
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      return {
        lat,
        lng,
        suburb: feature?.properties?.localityName ?? "",
        formatted: feature?.properties?.formattedAddress ?? address,
      };
    },
  };
}

function googleProvider(address: string): SourceProvider<GeocodeResult> {
  return {
    name: "google_geocoding",
    confidence: 80,
    async fetch() {
      const qs = new URLSearchParams({
        address: `${address}, Australia`,
        key: process.env.GOOGLE_MAPS_API_KEY!,
      });
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`, {
        signal: AbortSignal.timeout(9_000),
      });
      if (!res.ok) throw new Error(`Google geocoding ${res.status}`);
      const data = (await res.json()) as {
        status: string;
        results?: {
          geometry?: { location?: { lat: number; lng: number } };
          formatted_address?: string;
          address_components?: { long_name: string; types: string[] }[];
        }[];
      };
      if (data.status !== "OK" || !data.results?.length) return null;
      const top = data.results[0];
      const loc = top.geometry?.location;
      if (!loc) return null;
      const suburb =
        top.address_components?.find((c) => c.types.includes("locality"))?.long_name ?? "";
      return { lat: loc.lat, lng: loc.lng, suburb, formatted: top.formatted_address ?? address };
    },
  };
}

/** Cascade providers for an address — only configured sources participate. */
export function geocodeProviders(address: string): SourceProvider<GeocodeResult>[] {
  const providers: SourceProvider<GeocodeResult>[] = [];
  if (process.env.GEOSCAPE_CONSUMER_KEY) providers.push(geoscapeProvider(address));
  if (process.env.GOOGLE_MAPS_API_KEY) providers.push(googleProvider(address));
  return providers;
}
