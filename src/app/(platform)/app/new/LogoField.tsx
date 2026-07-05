"use client";

// Company logo picker for onboarding. Shows a live preview of the chosen file
// and a client-side size guard (mirrored on the server) so the customer gets
// immediate feedback before submitting. The actual upload is the plain
// <input type="file"> — the server action reads it from FormData.

import { useRef, useState } from "react";

const MAX_BYTES = 64 * 1024;

export function LogoField() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clear = () => {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setError(null);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);
    setPreview(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, SVG, JPG…).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That file is ${(file.size / 1024).toFixed(0)} KB — keep it under 64 KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  return (
    <label className="block text-sm sm:col-span-2">
      <span className="text-neutral-600">Company logo</span>
      <div className="mt-1 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Logo preview" className="h-full w-full object-contain" />
          ) : (
            <span className="text-lg text-neutral-300" aria-hidden>
              ▦
            </span>
          )}
        </span>
        <input
          ref={inputRef}
          type="file"
          name="logo"
          accept="image/*"
          onChange={onChange}
          className="block w-full text-xs text-neutral-600 file:mr-3 file:rounded file:border-0 file:bg-[var(--ae-space,#dc9f82)] file:px-3 file:py-1.5 file:text-white file:cursor-pointer"
        />
        {preview && (
          <button type="button" onClick={clear} className="text-xs text-rose-600 hover:underline shrink-0">
            Remove
          </button>
        )}
      </div>
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : (
        <span className="mt-1 block text-xs text-neutral-500">
          Shown beside the company name after onboarding. Square SVG or PNG under 64 KB works best.
        </span>
      )}
    </label>
  );
}
