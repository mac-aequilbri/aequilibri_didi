import { NextRequest, NextResponse } from "next/server";
import { errMeta, logger } from "@/lib/logger";
import { initSession } from "@/services/uc1/session";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const address = searchParams.get("address") ?? undefined;
  const suburb = searchParams.get("suburb") ?? undefined;
  try {
    const ctx = await initSession(address, suburb);
    return NextResponse.json(ctx);
  } catch (err) {
    logger.error("uc1 session-init failed", errMeta(err));
    return NextResponse.json({ error: "Session initialisation failed" }, { status: 500 });
  }
}
