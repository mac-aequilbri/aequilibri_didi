// Email reader interface (Platform Architecture doc utility layer) with a
// fixture-based demo implementation. A real IMAP/Graph adapter slots in
// behind the same interface.

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

let reader: EmailReader | null = null;

export function getEmailReader(): EmailReader {
  if (!reader) reader = new DemoEmailReader();
  return reader;
}
