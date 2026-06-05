import { PageHeader } from "@/components/PageHeader";
import { createProcurement } from "../../actions";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "ordered", "delivered", "invoiced", "paid"] as const;

export default async function NewProcurementPage() {
  return (
    <div className="space-y-6 max-w-xl">
      <PageHeader
        title="New Procurement Order"
        subtitle="Add a material or equipment order to the Dulong Downs procurement register"
        actions={[{ href: "/uc2/procurement", label: "Back", variant: "outline" }]}
      />

      <div className="ae-card">
        <form action={createProcurement} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="item">
              Item <span className="text-red-500">*</span>
            </label>
            <input
              id="item"
              name="item"
              type="text"
              required
              placeholder="e.g. Steel roofing sheets"
              className="w-full border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="vendorName">
              Vendor
            </label>
            <input
              id="vendorName"
              name="vendorName"
              type="text"
              placeholder="e.g. Acme Supplies"
              className="w-full border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="quantity">
                Quantity <span className="text-red-500">*</span>
              </label>
              <input
                id="quantity"
                name="quantity"
                type="number"
                min="0"
                step="any"
                required
                defaultValue="1"
                className="w-full border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="unitPrice">
                Unit Price (AUD) <span className="text-red-500">*</span>
              </label>
              <input
                id="unitPrice"
                name="unitPrice"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue="0"
                className="w-full border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="status">
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue="pending"
                className="w-full border border-neutral-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="dueDate">
                Due Date
              </label>
              <input
                id="dueDate"
                name="dueDate"
                type="date"
                className="w-full border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Optional notes or specifications"
              className="w-full border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <a href="/uc2/procurement" className="btn-ae-outline">
              Cancel
            </a>
            <button type="submit" className="btn-ae">
              Create Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
