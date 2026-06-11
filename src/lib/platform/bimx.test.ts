import { describe, it, expect } from "vitest";
import { isAllowedBimxEmbedUrl, normalizeBimxEmbedUrl } from "./bimx";

describe("isAllowedBimxEmbedUrl", () => {
  it("accepts the BIMx Model Transfer host over https", () => {
    expect(isAllowedBimxEmbedUrl("https://bimx.graphisoft.com/model/abc123")).toBe(true);
  });

  it("accepts the apex graphisoft.com host", () => {
    expect(isAllowedBimxEmbedUrl("https://graphisoft.com/model/abc")).toBe(true);
  });

  it("accepts other graphisoft subdomains", () => {
    expect(isAllowedBimxEmbedUrl("https://help.graphisoft.com/x")).toBe(true);
  });

  it("rejects http (no TLS)", () => {
    expect(isAllowedBimxEmbedUrl("http://bimx.graphisoft.com/model/abc")).toBe(false);
  });

  it("rejects foreign hosts", () => {
    expect(isAllowedBimxEmbedUrl("https://evil.example.com/model")).toBe(false);
  });

  it("rejects look-alike hosts that only end with the suffix as a substring", () => {
    expect(isAllowedBimxEmbedUrl("https://graphisoft.com.evil.com/x")).toBe(false);
    expect(isAllowedBimxEmbedUrl("https://notgraphisoft.com/x")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isAllowedBimxEmbedUrl("not a url")).toBe(false);
    expect(isAllowedBimxEmbedUrl("")).toBe(false);
  });
});

describe("normalizeBimxEmbedUrl", () => {
  it("returns a clean valid URL untouched (trimmed)", () => {
    expect(normalizeBimxEmbedUrl("  https://bimx.graphisoft.com/model/abc  ")).toBe(
      "https://bimx.graphisoft.com/model/abc"
    );
  });

  it("extracts the src from a full iframe embed snippet", () => {
    const snippet =
      '<iframe src="https://bimx.graphisoft.com/model/xyz" width="800" height="600"></iframe>';
    expect(normalizeBimxEmbedUrl(snippet)).toBe("https://bimx.graphisoft.com/model/xyz");
  });

  it("extracts src with single quotes", () => {
    const snippet = "<iframe src='https://bimx.graphisoft.com/model/q'></iframe>";
    expect(normalizeBimxEmbedUrl(snippet)).toBe("https://bimx.graphisoft.com/model/q");
  });

  it("rejects an iframe snippet whose src is a foreign host", () => {
    const snippet = '<iframe src="https://evil.example.com/x"></iframe>';
    expect(normalizeBimxEmbedUrl(snippet)).toBeNull();
  });

  it("rejects an iframe snippet with no src", () => {
    expect(normalizeBimxEmbedUrl("<iframe></iframe>")).toBeNull();
  });

  it("returns null for empty / nullish input", () => {
    expect(normalizeBimxEmbedUrl("")).toBeNull();
    expect(normalizeBimxEmbedUrl(null)).toBeNull();
    expect(normalizeBimxEmbedUrl(undefined)).toBeNull();
  });

  it("returns null for a bare foreign URL", () => {
    expect(normalizeBimxEmbedUrl("https://evil.example.com/model")).toBeNull();
  });
});
