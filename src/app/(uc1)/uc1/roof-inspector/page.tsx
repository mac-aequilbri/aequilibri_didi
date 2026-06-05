import { PageHeader } from "@/components/PageHeader";
import { InspectorClient } from "./InspectorClient";

export const dynamic = "force-dynamic";

export default function RoofInspector() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || "";
  return (
    <div>
      <PageHeader title="Roof Inspector" subtitle="Click any roof for instant AI measurement, building footprint, and solar potential" />
      <InspectorClient apiKey={apiKey} />
    </div>
  );
}
