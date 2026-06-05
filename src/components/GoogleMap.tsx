"use client";

import { useEffect, useRef, useState } from "react";

export type LatLng = [number, number];

// Load the Google Maps JS API once (with the Places library) — same API the
// Django app used. The script is injected client-side; the key is passed in.
let loaderPromise: Promise<typeof google> | null = null;
function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (typeof window !== "undefined" && (window as { google?: typeof google }).google?.maps) {
    return Promise.resolve(google);
  }
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const cbName = "__aeGmapsInit";
    (window as unknown as Record<string, unknown>)[cbName] = () => resolve(google);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=places&callback=${cbName}`;
    s.async = true;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return loaderPromise;
}

export default function GoogleMap({
  apiKey,
  center,
  zoom = 19,
  clickPoint,
  outline,
  height = 440,
  showSearch = false,
  searchPlaceholder = "Search property address",
  onMapClick,
  onPlaceSelected,
  clickable = true,
  children,
}: {
  apiKey: string;
  center: LatLng;
  zoom?: number;
  clickPoint: LatLng | null;
  outline: LatLng[];
  height?: number;
  showSearch?: boolean;
  searchPlaceholder?: string;
  onMapClick?: (lat: number, lng: number) => void;
  onPlaceSelected?: (lat: number, lng: number, address: string) => void;
  clickable?: boolean;
  children?: React.ReactNode;
}) {
  const mapDiv = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const polyRef = useRef<google.maps.Polygon | null>(null);
  const clickCb = useRef(onMapClick);
  const placeCb = useRef(onPlaceSelected);
  const clickableRef = useRef(clickable);
  clickCb.current = onMapClick;
  placeCb.current = onPlaceSelected;
  clickableRef.current = clickable;

  const [satellite, setSatellite] = useState(true);
  const [ready, setReady] = useState(false);

  // Init map + autocomplete once the API is loaded.
  useEffect(() => {
    let cancelled = false;
    if (!apiKey) return;
    loadGoogleMaps(apiKey)
      .then((g) => {
        if (cancelled || !mapDiv.current) return;
        const map = new g.maps.Map(mapDiv.current, {
          center: { lat: center[0], lng: center[1] },
          zoom,
          mapTypeId: "satellite",
          tilt: 0,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        });
        mapRef.current = map;
        geocoderRef.current = new g.maps.Geocoder();
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (!clickableRef.current || !e.latLng) return;
          clickCb.current?.(e.latLng.lat(), e.latLng.lng());
        });
        if (showSearch && inputRef.current) {
          const ac = new g.maps.places.Autocomplete(inputRef.current, {
            componentRestrictions: { country: "au" },
            fields: ["formatted_address", "geometry"],
          });
          ac.bindTo("bounds", map);
          ac.addListener("place_changed", () => {
            const place = ac.getPlace();
            const loc = place.geometry?.location;
            if (!loc) return;
            map.setCenter(loc);
            map.setZoom(20);
            placeCb.current?.(loc.lat(), loc.lng(), place.formatted_address ?? "");
          });
        }
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Recenter when the center prop changes.
  useEffect(() => {
    if (ready && mapRef.current) {
      mapRef.current.setCenter({ lat: center[0], lng: center[1] });
      mapRef.current.setZoom(zoom);
    }
  }, [center, zoom, ready]);

  // Satellite / map toggle.
  useEffect(() => {
    if (ready && mapRef.current) mapRef.current.setMapTypeId(satellite ? "satellite" : "roadmap");
  }, [satellite, ready]);

  // Click marker.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (!clickPoint) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      return;
    }
    const pos = { lat: clickPoint[0], lng: clickPoint[1] };
    if (markerRef.current) markerRef.current.setPosition(pos);
    else markerRef.current = new google.maps.Marker({ position: pos, map: mapRef.current });
  }, [clickPoint, ready]);

  // Outline polygon.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    polyRef.current?.setMap(null);
    polyRef.current = null;
    if (outline.length >= 3) {
      polyRef.current = new google.maps.Polygon({
        paths: outline.map(([lat, lng]) => ({ lat, lng })),
        strokeColor: "#00ff96",
        strokeWeight: 3,
        fillColor: "#00ff96",
        fillOpacity: 0.08,
        map: mapRef.current,
      });
    }
  }, [outline, ready]);

  const doSearch = () => {
    const q = inputRef.current?.value?.trim();
    if (!q || !geocoderRef.current || !mapRef.current) return;
    geocoderRef.current.geocode({ address: q, componentRestrictions: { country: "au" } }, (results, status) => {
      if (status !== "OK" || !results || !results[0]) return;
      const loc = results[0].geometry.location;
      mapRef.current!.setCenter(loc);
      mapRef.current!.setZoom(20);
      placeCb.current?.(loc.lat(), loc.lng(), results[0].formatted_address);
    });
  };

  return (
    <div>
      {showSearch && (
        <div className="flex gap-2 mb-2">
          <input
            ref={inputRef}
            placeholder={searchPlaceholder}
            className="flex-1 border border-[var(--ae-earth)] rounded px-3 py-2"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSearch(); } }}
          />
          <button type="button" className="btn-ae px-4" onClick={doSearch}>Search</button>
          <button type="button" className="btn-ae-outline px-3" title="Toggle satellite/street" onClick={() => setSatellite((v) => !v)}>{satellite ? "Map" : "Satellite"}</button>
        </div>
      )}
      <div className="relative" style={{ height }}>
        <div ref={mapDiv} style={{ height: "100%", width: "100%" }} className="rounded overflow-hidden bg-neutral-200" />
        {!apiKey && <div className="absolute inset-0 grid place-items-center text-neutral-500 text-sm">Google Maps key not configured.</div>}
        {children}
      </div>
    </div>
  );
}
