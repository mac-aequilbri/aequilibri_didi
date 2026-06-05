import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
try {
  const quotes = await p.uc1Quote.count();
  const rateCards = await p.uc1RateCard.count();
  const vendors = await p.uc1Vendor.count();
  console.log("uc1Quote:", quotes, "| uc1RateCard:", rateCards, "| uc1Vendor:", vendors);
  const recent = await p.uc1Quote.findMany({ take: 3, orderBy: { createdAt: "desc" }, include: { items: true } });
  for (const q of recent) console.log(" -", q.refNumber, "|", q.propertyAddress.slice(0,40), "| items:", q.items.length);
} catch (e) {
  console.error("QUERY ERROR:", e.message);
} finally {
  await p.$disconnect();
}
