import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native modules must not be bundled — load them from node_modules at runtime.
  serverExternalPackages: ["@napi-rs/canvas", "geotiff"],
};

export default nextConfig;
