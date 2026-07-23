// Filter config for the Vendors window — consumed by the page (parse +
// applyListQuery) and the shared FilterBar. Active and rating are virtual
// (predicate-matched) options over the boolean/number fields.

import type { ListViewConfig } from "@/lib/platform/listQuery";
import type { VendorView } from "@/lib/platform/vendorsSource";

export const vendorsListConfig: ListViewConfig<VendorView> = {
  search: [(v) => v.name, (v) => v.category, (v) => v.contactName, (v) => v.contactEmail],
  fields: [
    {
      kind: "enum",
      name: "active",
      label: "Active",
      options: [
        { value: "yes", label: "active", match: (v) => v.isActive },
        { value: "no", label: "inactive", match: (v) => !v.isActive },
      ],
    },
    {
      kind: "enum",
      name: "rating",
      label: "Rating",
      options: [
        { value: "8plus", label: "8–10", match: (v) => v.rating >= 8 },
        { value: "5to7", label: "5–7", match: (v) => v.rating >= 5 && v.rating < 8 },
        { value: "under5", label: "below 5", match: (v) => v.rating > 0 && v.rating < 5 },
      ],
    },
  ],
  sort: [
    { name: "name", label: "Name", getValue: (v) => v.name.toLowerCase() },
    { name: "rating", label: "Rating", getValue: (v) => v.rating },
    { name: "category", label: "Category", getValue: (v) => v.category.toLowerCase() },
  ],
  groups: [
    { name: "category", label: "Category", getValue: (v) => v.category || null },
    {
      name: "active",
      label: "Active",
      getValue: (v) => (v.isActive ? "yes" : "no"),
      options: [
        { value: "yes", label: "Active" },
        { value: "no", label: "Inactive" },
      ],
    },
  ],
  pageSize: 50,
};
