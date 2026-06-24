import { TextEncoder } from "node:util";

export type ManagedDocFormat = "pdf" | "docx" | "md";

interface RenderInput {
  brandLabel: string;
  title: string;
  outputType: string;
  body: string;
  generatedAtIso: string;
  traceLines: string[];
  format: ManagedDocFormat;
}

const encoder = new TextEncoder();

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapePdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLines(text: string, max = 90): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) {
      out.push("");
      continue;
    }
    if (line.length <= max) {
      out.push(line);
      continue;
    }
    let i = 0;
    while (i < line.length) {
      out.push(line.slice(i, i + max));
      i += max;
    }
  }
  return out;
}

function renderMarkdown(input: RenderInput): Buffer {
  const md = [
    `# ${input.brandLabel}`,
    "",
    `## ${input.title}`,
    "",
    `Document type: ${input.outputType}`,
    `Generated at: ${input.generatedAtIso}`,
    "Snapshot policy: immutable",
    ...(input.traceLines.length ? ["", "Traceability", ...input.traceLines] : []),
    "",
    "---",
    "",
    input.body.trim(),
    "",
  ].join("\n");
  return Buffer.from(md, "utf8");
}

function renderPdf(input: RenderInput): Buffer {
  const lines = wrapLines(
    [
      input.brandLabel,
      "",
      input.title,
      "",
      `Document type: ${input.outputType}`,
      `Generated at: ${input.generatedAtIso}`,
      "Snapshot policy: immutable",
      ...(input.traceLines.length ? ["", "Traceability", ...input.traceLines] : []),
      "",
      input.body.trim(),
    ].join("\n"),
    92,
  ).slice(0, 80);

  const contentStream = [
    "BT",
    "/F1 11 Tf",
    "40 800 Td",
    "14 TL",
    ...lines.map((line, i) => `${i === 0 ? "" : "T* " }(${escapePdf(line)}) Tj`),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function le16(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff];
}

function le32(v: number): number[] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

function zipStore(entries: Array<{ name: string; data: Uint8Array }>): Buffer {
  const localParts: number[] = [];
  const centralParts: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = [
      ...le32(0x04034b50),
      ...le16(20),
      ...le16(0),
      ...le16(0),
      ...le16(0),
      ...le16(0),
      ...le32(crc),
      ...le32(data.length),
      ...le32(data.length),
      ...le16(nameBytes.length),
      ...le16(0),
      ...nameBytes,
    ];
    localParts.push(...localHeader, ...data);

    const centralHeader = [
      ...le32(0x02014b50),
      ...le16(20),
      ...le16(20),
      ...le16(0),
      ...le16(0),
      ...le16(0),
      ...le16(0),
      ...le32(crc),
      ...le32(data.length),
      ...le32(data.length),
      ...le16(nameBytes.length),
      ...le16(0),
      ...le16(0),
      ...le16(0),
      ...le16(0),
      ...le32(0),
      ...le32(offset),
      ...nameBytes,
    ];
    centralParts.push(...centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralStart = localParts.length;
  const centralSize = centralParts.length;
  const end = [
    ...le32(0x06054b50),
    ...le16(0),
    ...le16(0),
    ...le16(entries.length),
    ...le16(entries.length),
    ...le32(centralSize),
    ...le32(centralStart),
    ...le16(0),
  ];

  return Buffer.from([...localParts, ...centralParts, ...end]);
}

function renderDocx(input: RenderInput): Buffer {
  const lines = wrapLines(
    [
      input.brandLabel,
      "",
      input.title,
      "",
      `Document type: ${input.outputType}`,
      `Generated at: ${input.generatedAtIso}`,
      "Snapshot policy: immutable",
      ...(input.traceLines.length ? ["", "Traceability", ...input.traceLines] : []),
      "",
      input.body.trim(),
    ].join("\n"),
    120,
  );

  const paragraphs = lines
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line || " ")}</w:t></w:r></w:p>`)
    .join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr/>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  return zipStore([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rels) },
    { name: "word/document.xml", data: encoder.encode(documentXml) },
  ]);
}

export function renderManagedDocument(input: RenderInput): {
  buf: Buffer;
  extension: string;
  mimeType: string;
} {
  if (input.format === "pdf") {
    return { buf: renderPdf(input), extension: "pdf", mimeType: "application/pdf" };
  }
  if (input.format === "docx") {
    return {
      buf: renderDocx(input),
      extension: "docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }
  return { buf: renderMarkdown(input), extension: "md", mimeType: "text/markdown" };
}
