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
      { source: "/uc3/:path*", headers: [bimxCsp] },
      { source: "/app/:path*", headers: [bimxCsp] },
      { source: "/portal/:path*", headers: [bimxCsp] },
    ];
  },
};

export default nextConfig;
