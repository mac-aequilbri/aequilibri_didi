"use client";

import { useRef, useState } from "react";

/**
 * Sandboxed embed of a BIMx Web Viewer hyper-model.
 *
 * `src` is expected to already be validated against the graphisoft.com
 * allowlist (see src/lib/uc3-bimx.ts) before it ever reaches this component.
 * The iframe is sandboxed defensively regardless.
 */
export function BimxViewer({
  src,
  title,
  height = 480,
}: {
  src: string;
  title: string;
  height?: number;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  function goFullscreen() {
    frameRef.current?.requestFullscreen?.();
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
          Loading 3D model…
        </div>
      )}
      <iframe
        ref={frameRef}
        src={src}
        title={title}
        onLoad={() => setLoaded(true)}
        className="w-full block"
        style={{ height }}
        loading="lazy"
        allow="fullscreen; xr-spatial-tracking"
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
      <button
        type="button"
        onClick={goFullscreen}
        className="absolute top-2 right-2 text-xs px-2 py-1 rounded-md bg-black/60 text-white hover:bg-black/80"
      >
        Fullscreen
      </button>
    </div>
  );
}
