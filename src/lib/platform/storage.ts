// DriveStorer interface (Platform Architecture doc: "drive storer with
// taxonomy"). Local filesystem implementation for dev/demo; a Google Drive
// adapter slots in behind the same interface later. Files live under
// var/storage/<orgSlug>/<jobCode|org>/<docType>/<name> (gitignored).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredRef {
  /** Provider-relative reference persisted on PlatDocument.storageRef. */
  ref: string;
  provider: string;
}

export interface DriveStorer {
  provider: string;
  put(parts: { orgSlug: string; jobCode?: string; docType?: string; name: string }, buf: Buffer): Promise<StoredRef>;
  get(ref: string): Promise<Buffer>;
}

const ROOT = path.join(process.cwd(), "var", "storage");

function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9._ -]+/g, "_").slice(0, 120) || "file";
}

class LocalFsStorer implements DriveStorer {
  provider = "local";

  async put(
    parts: { orgSlug: string; jobCode?: string; docType?: string; name: string },
    buf: Buffer,
  ): Promise<StoredRef> {
    const rel = path.posix.join(
      safe(parts.orgSlug),
      safe(parts.jobCode ?? "org"),
      safe(parts.docType || "uncategorised"),
      `${Date.now()}-${safe(parts.name)}`,
    );
    const abs = path.join(ROOT, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, buf);
    return { ref: rel, provider: this.provider };
  }

  async get(ref: string): Promise<Buffer> {
    const abs = path.join(ROOT, ref);
    // Containment check — refs come from the DB, but never trust path joins.
    if (!abs.startsWith(ROOT)) throw new Error("Invalid storage ref");
    return readFile(abs);
  }
}

let localStorer: DriveStorer | null = null;
let driveStorer: DriveStorer | null = null;

function local(): DriveStorer {
  if (!localStorer) localStorer = new LocalFsStorer();
  return localStorer;
}

/** Factory — Google Drive when the service-account env is configured
 *  (lib/platform/gdrive.ts), local filesystem otherwise. */
export function getStorer(): DriveStorer {
  // Lazy require avoids a cycle (gdrive imports the interface from here).
  /* eslint-disable-next-line @typescript-eslint/no-require-imports */
  const gdrive = require("./gdrive") as typeof import("./gdrive");
  if (gdrive.gdriveEnabled()) {
    if (!driveStorer) driveStorer = new gdrive.GoogleDriveStorer();
    return driveStorer;
  }
  return local();
}

/** Resolve the storer that wrote a given document (downloads must work even
 *  after the default provider changes). */
export function getStorerFor(provider: string): DriveStorer {
  if (provider === "gdrive") {
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const gdrive = require("./gdrive") as typeof import("./gdrive");
    if (!driveStorer) driveStorer = new gdrive.GoogleDriveStorer();
    return driveStorer;
  }
  return local();
}
