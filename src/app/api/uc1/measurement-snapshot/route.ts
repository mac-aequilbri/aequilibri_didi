import { NextResponse } from "next/server";
import { createMeasurementSnapshot } from "@/services/uc1/measurementMemory";

export const dynamic = "force-dynamic";

// POST — persist one structured measurement snapshot from the quote review flow.
// Mirrors Django uc1_roofing/api_views.measurement_snapshot_save.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const quoteIdRaw = body?.quote_id ?? body?.quoteId;
    const quoteId = quoteIdRaw != null && quoteIdRaw !== "" ? Number(quoteIdRaw) : null;
    const { snapshotId, updateId } = await createMeasurementSnapshot(body, {
      quoteId: Number.isFinite(quoteId as number) ? (quoteId as number) : null,
    });
    return NextResponse.json({ ok: true, snapshot_id: snapshotId, update_id: updateId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bad request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
