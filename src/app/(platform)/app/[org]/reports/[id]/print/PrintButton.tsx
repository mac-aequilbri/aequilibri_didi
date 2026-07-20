// Tiny client button so the print view can trigger the browser's print
// dialog directly (Ctrl+P is not discoverable). Hidden on paper via
// print:hidden.
"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-ae print:hidden">
      Print
    </button>
  );
}
