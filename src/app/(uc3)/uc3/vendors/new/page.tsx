import { PageHeader } from "@/components/PageHeader";
import { createVendor } from "../../actions";

export const dynamic = "force-dynamic";

const INPUT =
  "w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export default async function NewVendorPage() {
  return (
    <div className="pb-16">
      <PageHeader
        title="New Vendor"
        subtitle="Add a supplier or subcontractor to your directory"
        actions={[{ href: "/uc3/vendors", label: "Back to Vendors", variant: "outline" }]}
      />

      <div className="px-8">
        <div className="ae-card p-6 max-w-2xl">
          <form action={createVendor} className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                required
                placeholder="Vendor or company name"
                className={INPUT}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Category
              </label>
              <input
                type="text"
                name="category"
                placeholder="e.g. Electrical, Plumbing, Concrete"
                className={INPUT}
              />
            </div>

            {/* Contact name / email / phone */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  name="contactName"
                  placeholder="Full name"
                  className={INPUT}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="contactEmail"
                  placeholder="email@example.com"
                  className={INPUT}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  name="contactPhone"
                  placeholder="+61 4xx xxx xxx"
                  className={INPUT}
                />
              </div>
            </div>

            {/* Rating */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Rating
              </label>
              <select name="rating" defaultValue="" className={INPUT}>
                <option value="">— Not rated —</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} — {n <= 3 ? "Poor" : n <= 5 ? "Below average" : n <= 7 ? "Good" : n <= 9 ? "Very good" : "Excellent"}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Notes
              </label>
              <textarea
                name="notes"
                rows={3}
                placeholder="Additional notes about this vendor…"
                className={INPUT}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" className="btn-ae">
                Save Vendor
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
