import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native modules must not be bundled — load them from node_modules at runtime.
  serverExternalPackages: ["@napi-rs/canvas", "geotiff"],

  // Defense-in-depth for the BIMx embed (UC3): restrict which origins UC3 pages
  // may frame. This backstops the graphisoft.com URL allowlist in
  // src/lib/uc3-bimx.ts — even a stored bad URL cannot be framed. Scoped to
  // /uc3/* so UC1 (Google Maps) is unaffected. Only `frame-src` is set, so no
  // other resource type is constrained.
  async headers() {
    return [
      {
        source: "/uc3/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-src 'self' https://graphisoft.com https://*.graphisoft.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
