import { NextRequest, NextResponse } from "next/server";
import { initSession } from "@/services/uc1/session";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const address = searchParams.get("address") ?? undefined;
  const suburb = searchParams.get("suburb") ?? undefined;
  try {
    const ctx = await initSession(address, suburb);
    return NextResponse.json(ctx);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
