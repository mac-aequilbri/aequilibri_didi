// Register export (Spec 12 Module 8: "exportable as XLSX snapshot at any
// time", lock plan §8.5) — emitted as Excel-compatible CSV (UTF-8 BOM so
// Excel opens it correctly); a true .xlsx writer is a dependency the platform
// doesn't carry, and CSV round-trips into Excel/Sheets losslessly for these
// flat registers. Documented as the one deliberate deviation from the spec's
// file-format naming.

export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const cell = (v: unknown): string => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))];
  return "﻿" + lines.join("\r\n");
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]+/g, "-")}"`,
      "Cache-Control": "no-store",
    },
  });
}
