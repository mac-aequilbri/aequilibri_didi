"use client";

// Toolbar shown on screen only (hidden when printing) — triggers the browser
// print dialog so the user can "Save as PDF".
export default function PrintButton() {
  return (
    <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px", background: "#16172a" }}>
      <button onClick={() => window.print()} className="btn-ae" style={{ background: "#b06a4a" }}>🖨 Print / Save as PDF</button>
    </div>
  );
}
