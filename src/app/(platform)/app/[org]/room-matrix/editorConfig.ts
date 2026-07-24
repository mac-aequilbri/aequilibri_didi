// Shared editor/detail config for a single room — consumed by both the
// read-only detail view ([id]/page.tsx) and the edit form ([id]/edit/page.tsx).

import type { RecordEditorConfig } from "@/lib/platform/recordEditor";

export const roomEditorConfig: RecordEditorConfig = {
  table: "room",
  jobScoped: true,
  noun: "room",
  listPath: "/room-matrix",
  aiRole:
    "You are an operations assistant helping a construction manager keep a room/finishes matrix tidy — sensible zone groupings.",
  fields: [
    { name: "name", label: "Room name", type: "text", required: true },
    { name: "zone", label: "Zone", type: "text", aiFillable: true },
    { name: "areaSqm", label: "Area (m²)", type: "number", min: 0, step: 0.01 },
    { name: "ceilingHeight", label: "Ceiling height", type: "text" },
  ],
};
