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

let storer: DriveStorer | null = null;

/** Factory — switches on env when a Drive adapter exists. */
export function getStorer(): DriveStorer {
  if (!storer) storer = new LocalFsStorer();
  return storer;
}
