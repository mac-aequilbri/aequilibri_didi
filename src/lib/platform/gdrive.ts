// Google Drive adapter for the DriveStorer seam (doc: "drive storer with
// taxonomy", Stage-1/2 integration). Server-to-server via a service account —
// no SDK dependency; the JWT grant is hand-rolled with node:crypto.
//
// Activation (all three required, else the local-FS storer is used):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL        sa@project.iam.gserviceaccount.com
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  the PEM key ("\n" escapes accepted)
//   GOOGLE_DRIVE_FOLDER_ID              a folder shared with the SA email
//
// Taxonomy: <root>/<orgSlug>/<top-folder>/<jobCode>/<type>/<file> — folders are
// created on demand and cached. storageRef = the Drive file id.

import { createSign } from "node:crypto";
import type { DriveStorer, StoredRef } from "./storage";

export function gdriveEnabled(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  );
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const jwt = `${unsigned}.${signer.sign(key).toString("base64url")}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive API ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res;
}

const folderCache = new Map<string, string>();

async function ensureFolder(name: string, parentId: string): Promise<string> {
  const cacheKey = `${parentId}/${name}`;
  const hit = folderCache.get(cacheKey);
  if (hit) return hit;

  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const found = (await (
    await driveFetch(`${API}/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`)
  ).json()) as { files: { id: string }[] };

  let id = found.files[0]?.id;
  if (!id) {
    const created = (await (
      await driveFetch(`${API}/files?supportsAllDrives=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId],
        }),
      })
    ).json()) as { id: string };
    id = created.id;
  }
  folderCache.set(cacheKey, id);
  return id;
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "file";

export class GoogleDriveStorer implements DriveStorer {
  provider = "gdrive";

  async put(
    parts: { orgSlug: string; jobCode?: string; docType?: string; folderSegments?: string[]; name: string },
    buf: Buffer,
  ): Promise<StoredRef> {
    let parent = process.env.GOOGLE_DRIVE_FOLDER_ID!;
    for (const segment of [
      parts.orgSlug,
      ...(parts.folderSegments?.length ? parts.folderSegments : [parts.docType || "uncategorised"]),
      parts.jobCode ?? "org",
    ]) {
      parent = await ensureFolder(safe(segment), parent);
    }

    const boundary = `aequilibri-${Date.now().toString(36)}`;
    const metadata = JSON.stringify({ name: safe(parts.name), parents: [parent] });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`,
      ),
      buf,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = (await (
      await driveFetch(`${UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id`, {
        method: "POST",
        headers: { "content-type": `multipart/related; boundary=${boundary}` },
        body: new Uint8Array(body),
      })
    ).json()) as { id: string };

    return { ref: res.id, provider: this.provider };
  }

  async get(ref: string): Promise<Buffer> {
    if (!/^[\w-]+$/.test(ref)) throw new Error("Invalid Drive file id");
    const res = await driveFetch(`${API}/files/${ref}?alt=media&supportsAllDrives=true`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Human-facing Drive URL for a stored file id. */
export function gdriveViewUrl(ref: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(ref)}/view`;
}
