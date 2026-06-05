import { PageHeader } from "@/components/PageHeader";
import { QuoteWizard } from "./QuoteWizard";

export const dynamic = "force-dynamic";

export default function NewQuotePage() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || "";
  return (
    <div>
      <PageHeader
        title="New Quote"
        subtitle="Search an address, click the roof for AI measurement, then price with the Port City engine"
        actions={[{ href: "/uc1/quotes", label: "Back to Quotes", variant: "outline" }]}
      />
      <QuoteWizard apiKey={apiKey} />
    </div>
  );
}
