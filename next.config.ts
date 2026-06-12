import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native modules must not be bundled — load them from node_modules at runtime.
  serverExternalPackages: ["@napi-rs/canvas", "geotiff"],

  // Defense-in-depth for the BIMx embed: restrict which origins these pages
  // may frame. This backstops the graphisoft.com URL allowlist in
  // src/lib/platform/bimx.ts — even a stored bad URL cannot be framed. Scoped
  // to the routes that render BimxViewer (legacy /uc3 until cutover, platform
  // /app, public /portal) so UC1 (Google Maps) is unaffected. Only `frame-src`
  // is set, so no other resource type is constrained.
  async headers() {
    const bimxCsp = {
      key: "Content-Security-Policy",
      value: "frame-src 'self' https://graphisoft.com https://*.graphisoft.com",
    };
    return [
      { source: "/app/:path*", headers: [bimxCsp] },
      { source: "/portal/:path*", headers: [bimxCsp] },
    ];
  },

  // Cutover: UC2/UC3 were rebuilt onto the shared platform core under
  // /app/[org]. Old URLs redirect — UC2 was the single Dulong Downs
  // instance (1:1 path mapping); UC3 was cookie-tenant based, so its deep
  // links land on the org picker. Old public portal links keep working.
  async redirects() {
    return [
      { source: "/uc2/chat", destination: "/app/dulong-downs/assistant", permanent: false },
      { source: "/uc2/change-log", destination: "/app/dulong-downs/exec-log", permanent: false },
      { source: "/uc2", destination: "/app/dulong-downs", permanent: false },
      { source: "/uc2/:path*", destination: "/app/dulong-downs/:path*", permanent: false },
      { source: "/uc3/portal/public/:token", destination: "/portal/:token", permanent: false },
      { source: "/uc3", destination: "/app", permanent: false },
      { source: "/uc3/:path*", destination: "/app", permanent: false },
    ];
  },
};

export default nextConfig;
