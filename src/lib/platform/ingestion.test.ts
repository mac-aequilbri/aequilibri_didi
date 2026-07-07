import { describe, expect, it } from "vitest";
import { driveFolderSegments, type Module2SourceChannel } from "./ingestion";

describe("driveFolderSegments — channel taxonomy", () => {
  it("routes the new push channels into their own CoWork inboxes", () => {
    expect(driveFolderSegments("correspondence", "slack")).toEqual(["10_Claude_CoWork", "Slack_Inbox"]);
    expect(driveFolderSegments("correspondence", "form")).toEqual(["10_Claude_CoWork", "Form_Intake"]);
    expect(driveFolderSegments("correspondence", "webhook")).toEqual(["10_Claude_CoWork", "Webhook_Inbox"]);
  });

  it("keeps the existing email/conversation routing", () => {
    expect(driveFolderSegments("invoice", "email")).toEqual(["10_Claude_CoWork", "Email_Inbox"]);
    expect(driveFolderSegments("x", "conversation")).toEqual(["10_Claude_CoWork", "Conversation_Notes"]);
  });

  it("falls through to docType routing for drive/upload (not channel-pinned)", () => {
    // A file dropped via Drive is classified by docType, like a manual upload.
    expect(driveFolderSegments("quote", "drive")).toEqual(["03_Vendors_and_Quotes", "Quotes"]);
    expect(driveFolderSegments("invoice", "upload")).toEqual(["02_Budgets_and_Costs", "Invoices"]);
  });

  it("covers every declared channel without throwing", () => {
    const channels: Module2SourceChannel[] = [
      "upload",
      "link",
      "email",
      "conversation",
      "slack",
      "form",
      "drive",
      "webhook",
    ];
    for (const c of channels) {
      expect(driveFolderSegments("report", c).length).toBe(2);
    }
  });
});
