// Filter config for the Documents window — consumed by the page (parse +
// applyListQuery) and the shared FilterBar.

import type { DocumentView } from "@/lib/platform/documentsSource";
import type { ListViewConfig } from "@/lib/platform/listQuery";

export const documentsListConfig: ListViewConfig<DocumentView> = {
  search: [
    (d) => d.title,
    (d) => d.aiSummary,
    (d) => d.classification,
    (d) => d.docType,
    (d) => d.uploadedBy,
  ],
  fields: [
    {
      kind: "enum",
      name: "kind",
      label: "Kind",
      options: [{ value: "file" }, { value: "link" }, { value: "generated" }],
    },
    {
      kind: "enum",
      name: "status",
      label: "Status",
      getValue: (d) => d.status.toLowerCase(),
      options: ["uploaded", "captured", "classified", "analyzed", "generated"].map((v) => ({
        value: v,
      })),
    },
    { kind: "daterange", name: "added", label: "Added", getValue: (d) => d.createdAt },
  ],
  sort: [
    { name: "added", label: "Added", getValue: (d) => d.createdAt },
    { name: "title", label: "Title", getValue: (d) => d.title.toLowerCase() },
    { name: "status", label: "Status", getValue: (d) => d.status.toLowerCase() },
  ],
  groups: [
    {
      name: "status",
      label: "Status",
      getValue: (d) => d.status.toLowerCase(),
      options: ["uploaded", "captured", "classified", "analyzed", "generated"].map((v) => ({
        value: v,
      })),
    },
    {
      name: "kind",
      label: "Kind",
      getValue: (d) => d.kind || null,
      options: [{ value: "file" }, { value: "link" }, { value: "generated" }],
    },
    { name: "classification", label: "Classification", getValue: (d) => d.classification || null },
    { name: "docType", label: "Type", getValue: (d) => d.docType || null },
    { name: "storageProvider", label: "Storage", getValue: (d) => d.storageProvider || null },
    { name: "uploadedBy", label: "Uploaded by", getValue: (d) => d.uploadedBy || null },
    { name: "project", label: "Project", getValue: (d) => d.jobName || null },
  ],
  pageSize: 50,
};
