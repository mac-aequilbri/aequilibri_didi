"use client";

// Root error boundary — catches errors thrown above/around the app shell. It
// replaces the whole document, so it carries its own <html>/<body> and inline
// styles (globals.css may not be in scope here). Logs through the shared logger
// so a future external sink captures it automatically.

import { useEffect } from "react";
import { logger, errMeta } from "@/lib/logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Unhandled application error", { digest: error.digest, ...errMeta(error) });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#e3ddcd",
          color: "#2c2c2c",
          fontFamily: '"Helvetica Neue", Arial, sans-serif',
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 1px 6px rgba(0,0,0,.08)",
            padding: "32px 36px",
            maxWidth: 460,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.4rem", margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#7a736a", fontSize: ".95rem", margin: "0 0 20px" }}>
            An unexpected error interrupted the page. The issue has been logged.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#dc9f82",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              padding: "9px 18px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ color: "#b4b8bd", fontSize: ".72rem", marginTop: 16 }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
