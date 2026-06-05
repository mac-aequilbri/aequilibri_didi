// Minimal type surface for the `geotiff` package (no bundled types) — only the
// API used by src/services/uc1/lidar.ts.
declare module "geotiff" {
  interface GeoTIFFImage {
    getWidth(): number;
    getHeight(): number;
    readRasters(options?: { interleave?: boolean }): Promise<ArrayLike<number> | ArrayLike<number>[]>;
  }
  interface GeoTIFF {
    getImage(index?: number): Promise<GeoTIFFImage>;
  }
  export function fromArrayBuffer(buffer: ArrayBuffer): Promise<GeoTIFF>;
}
