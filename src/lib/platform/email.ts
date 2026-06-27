// Email reader interface (Platform Architecture doc utility layer).
//
// Two implementations behind one interface:
//   - ImapEmailReader: live IMAP mailbox (Gmail app-password, Outlook, any host)
//   - DemoEmailReader: fixtures, used when no IMAP_* env is configured
// getEmailReader() picks the live reader when IMAP is configured, else the demo
// one — so unconfigured/dev environments keep working with fixtures.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export interface InboundEmail {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
  attachments: { name: string; mimeType: string; buf: Buffer }[];
}

export interface EmailReader {
  fetchUnread(): Promise<InboundEmail[]>;
  markProcessed(id: string): Promise<void>;
  /** Release any held connection. Optional — the demo reader has none. */
  close?(): Promise<void>;
}

class DemoEmailReader implements EmailReader {
  private processed = new Set<string>();

  async fetchUnread(): Promise<InboundEmail[]> {
    const fixtures: InboundEmail[] = [
      {
        id: "demo-001",
        from: "estimating@suncoastprecast.example",
        subject: "Quote — precast panels L2 east",
        body: "Please find attached our quote for the L2 east elevation panels. Supply and install, 6 week lead time.",
        receivedAt: "2026-06-10T01:30:00Z",
        attachments: [
          {
            name: "SCP-quote-1182.txt",
            mimeType: "text/plain",
            buf: Buffer.from(
              "SunCoast Precast — Quote 1182\nL2 east elevation panels x6\nSupply and install: $86,400 ex GST\nLead time: 6 weeks from order",
            ),
          },
        ],
      },
    ];
    return fixtures.filter((f) => !this.processed.has(f.id));
  }

  async markProcessed(id: string): Promise<void> {
    this.processed.add(id);
  }
}

interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
}

/** IMAP config from env, or null when not configured. */
function imapConfig(): ImapConfig | null {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: process.env.IMAP_TLS !== "false",
    user,
    pass,
    mailbox: process.env.IMAP_MAILBOX ?? "INBOX",
  };
}

/** Live IMAP reader: fetches UNSEEN messages, marks them \Seen once processed
 *  (so they are not re-ingested). One connection per ingest run, closed at the
 *  end via close(). UID is used as the stable message id. */
class ImapEmailReader implements EmailReader {
  private client: ImapFlow | null = null;

  constructor(private cfg: ImapConfig) {}

  private async ensure(): Promise<ImapFlow> {
    if (this.client) return this.client;
    const client = new ImapFlow({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: this.cfg.secure,
      auth: { user: this.cfg.user, pass: this.cfg.pass },
      logger: false,
    });
    await client.connect();
    this.client = client;
    return client;
  }

  async fetchUnread(): Promise<InboundEmail[]> {
    const client = await this.ensure();
    const out: InboundEmail[] = [];
    const lock = await client.getMailboxLock(this.cfg.mailbox);
    try {
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        out.push({
          id: String(uid),
          from: parsed.from?.text ?? "",
          subject: parsed.subject ?? "(no subject)",
          body: parsed.text ?? "",
          receivedAt: (parsed.date ?? new Date()).toISOString(),
          attachments: (parsed.attachments ?? [])
            .filter((a) => a.content)
            .map((a) => ({
              name: a.filename ?? "attachment",
              mimeType: a.contentType ?? "application/octet-stream",
              buf: a.content as Buffer,
            })),
        });
      }
    } finally {
      lock.release();
    }
    return out;
  }

  async markProcessed(id: string): Promise<void> {
    const client = await this.ensure();
    const lock = await client.getMailboxLock(this.cfg.mailbox);
    try {
      await client.messageFlagsAdd(String(id), ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // best-effort; the socket closes when the process recycles regardless
      }
      this.client = null;
    }
  }
}

let demoReader: EmailReader | null = null;

/** Live IMAP reader when configured, otherwise the demo fixture reader. The
 *  IMAP reader is fresh per call (one connection per ingest run); the demo
 *  reader is a singleton so its in-memory "processed" set persists. */
export function getEmailReader(): EmailReader {
  const cfg = imapConfig();
  if (cfg) return new ImapEmailReader(cfg);
  if (!demoReader) demoReader = new DemoEmailReader();
  return demoReader;
}

/** Whether a live mailbox is configured (vs the demo fixtures). */
export function emailReaderIsLive(): boolean {
  return imapConfig() !== null;
}
