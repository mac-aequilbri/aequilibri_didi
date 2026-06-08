import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

async function setTenantAction(formData: FormData) {
  "use server";
  const tenantId = formData.get("tenantId") as string;
  if (tenantId) {
    const cookieStore = await cookies();
    cookieStore.set("uc3_tenant_id", tenantId, { path: "/" });
  }
  redirect("/uc3");
}

export default async function SelectTenantPage() {
  let tenants: { id: number; name: string }[] = [];
  try {
    tenants = await prisma.uc3Tenant.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  } catch {
    // empty state on error
  }

  return (
    <div className="p-6">
      <PageHeader title="Select Tenant" />

      {tenants.length === 0 ? (
        <p className="text-neutral-500 mt-4">No active tenants found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
          {tenants.map((tenant) => (
            <div key={tenant.id} className="ae-card p-4 flex flex-col gap-3">
              <span className="font-medium text-neutral-800 dark:text-neutral-100">{tenant.name}</span>
              <form action={setTenantAction}>
                <input type="hidden" name="tenantId" value={tenant.id} />
                <button type="submit" className="btn-ae w-full">
                  Select
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
