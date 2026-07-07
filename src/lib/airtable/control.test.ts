import { describe, expect, it } from "vitest";
import { connectionKey } from "./control";

describe("connectionKey", () => {
  it("composes a stable (org, channel, direction) identity", () => {
    expect(connectionKey("dulong-downs", "email", "in")).toBe("dulong-downs:email:in");
    expect(connectionKey("acme", "slack", "out")).toBe("acme:slack:out");
  });

  it("is order-sensitive so inbound and outbound never collide", () => {
    expect(connectionKey("acme", "email", "in")).not.toBe(connectionKey("acme", "email", "out"));
  });
});
