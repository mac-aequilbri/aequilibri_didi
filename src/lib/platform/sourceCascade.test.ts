import { describe, expect, it } from "vitest";
import { resolveField, SourceProvider } from "./sourceCascade";

const provider = <T,>(name: string, confidence: number, fn: () => Promise<T | null>): SourceProvider<T> => ({
  name,
  confidence,
  fetch: fn,
});

describe("source cascade manager", () => {
  it("returns the first provider that yields a value, with provenance", async () => {
    const out = await resolveField<number>([
      provider<number>("primary", 90, async () => null),
      provider<number>("secondary", 70, async () => 42),
      provider<number>("tertiary", 50, async () => 99),
    ]);
    expect(out.value).toBe(42);
    expect(out.source).toBe("secondary");
    expect(out.confidence).toBe(70);
    expect(out.attempts).toHaveLength(2); // tertiary never tried
  });

  it("records errors and continues the cascade", async () => {
    const out = await resolveField<number>([
      provider("flaky", 90, async () => {
        throw new Error("boom");
      }),
      provider("backup", 60, async () => 7),
    ]);
    expect(out.value).toBe(7);
    expect(out.attempts[0]).toMatchObject({ source: "flaky", ok: false });
  });

  it("skips providers below the confidence threshold", async () => {
    const out = await resolveField<number>(
      [provider("weak", 20, async () => 1), provider("strong", 80, async () => 2)],
      { minConfidence: 50 },
    );
    expect(out.value).toBe(2);
    expect(out.attempts[0].error).toContain("threshold");
  });

  it("returns null with full attempt log when everything fails", async () => {
    const out = await resolveField<number>([provider<number>("only", 90, async () => null)]);
    expect(out.value).toBeNull();
    expect(out.source).toBe("none");
    expect(out.confidence).toBe(0);
  });
});
