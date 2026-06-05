import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { materialDisplay } from "@/services/uc1/constants";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// GET /api/uc1/vendor-prices — active vendor prices for the monitor table.
export async function GET() {
  try {
    const items = await prisma.uc1VendorMaterialPrice.findMany({
      where: { isAvailable: true, vendor: { isActive: true } },
      include: { vendor: true },
      orderBy: [{ vendor: { name: "asc" } }, { material: "asc" }],
    });
    return NextResponse.json({
      prices: items.map((item) => ({
        vendor: item.vendor.name,
        material: materialDisplay(item.material),
        item_code: item.itemCode,
        price: item.unitPriceExGst.toString(),
        unit: item.unit,
        lead_days: item.leadDays,
        last_verified: item.lastVerified ? formatDate(item.lastVerified) : null,
        source_url: item.priceSourceUrl || null,
      })),
    });
  } catch {
    return NextResponse.json({ prices: [] });
  }
}
