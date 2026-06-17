// Google Places address autocomplete bound to a plain form input. As the user
// types, Google suggests AU addresses; on selection we parse the street + suburb
// and report lat/lng. Degrades to a normal text input when no key is configured
// (the field still submits, just without suggestions). Reuses the shared Maps JS
// loader from GoogleMap so the script is injected once.
"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "./GoogleMap";

export interface AddressParts {
  /** Street line (number + route), or the formatted address if no street parts. */
  address: string;
  suburb: string;
  formatted: string;
  lat: number;
  lng: number;
}

export function AddressAutocomplete({
  apiKey,
  name,
  defaultValue,
  placeholder,
  className,
  onSelect,
  onTextChange,
}: {
  apiKey: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  onSelect?: (parts: AddressParts) => void;
  /** Fires on each keystroke so the parent can mirror the value (e.g. to keep
   *  it when switching to a manual-entry input). */
  onTextChange?: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    if (!apiKey || !inputRef.current) return;
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then((g) => {
        if (cancelled || !inputRef.current) return;
        const ac = new g.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "au" },
          fields: ["formatted_address", "geometry", "address_components"],
          types: ["address"],
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const comps = place.address_components ?? [];
          const get = (type: string) =>
            comps.find((c) => c.types.includes(type))?.long_name ?? "";
          const street = [get("street_number"), get("route")].filter(Boolean).join(" ").trim();
          const suburb = get("locality") || get("postal_town") || get("sublocality") || "";
          const loc = place.geometry?.location;
          const address = street || place.formatted_address || "";
          // Show just the street line in the field; suburb lands in its own input.
          if (inputRef.current && street) inputRef.current.value = street;
          onSelectRef.current?.({
            address,
            suburb,
            formatted: place.formatted_address ?? "",
            lat: loc ? loc.lat() : NaN,
            lng: loc ? loc.lng() : NaN,
          });
        });
      })
      .catch(() => {
        /* no suggestions — the plain input still works */
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return (
    <input
      ref={inputRef}
      name={name}
      defaultValue={defaultValue}
      placeholder={placeholder}
      autoComplete="off"
      className={className}
      onChange={(e) => onTextChange?.(e.target.value)}
    />
  );
}
