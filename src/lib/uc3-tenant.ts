import { cookies } from "next/headers";
import { prisma as db } from "@/lib/db";

export type ActiveTenant = { id: number; name: string };

export async function getActiveTenant(): Promise<ActiveTenant | null> {
  try {
    const cookieStore = await cookies();
    const val = cookieStore.get("uc3_tenant_id")?.value;

    if (!val) return null; // No cookie → caller must redirect to /uc3/select-tenant

    const tenant = await db.uc3Tenant.findFirst({
      where: { id: Number(val), isActive: true },
      select: { id: true, name: true },
    });

    return tenant ?? null; // Invalid or deactivated tenant → caller must redirect
  } catch {
    return null;
  }
}

export async function getTenantId(): Promise<number | null> {
  return (await getActiveTenant())?.id ?? null;
}
