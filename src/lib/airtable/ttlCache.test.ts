import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "./ttlCache";

describe("TtlCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("loads once and serves the cached value within the TTL", async () => {
    const cache = new TtlCache<string>(1000);
    const load = vi.fn(async () => "v1");
    expect(await cache.get("k", load)).toBe("v1");
    expect(await cache.get("k", load)).toBe("v1");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight load between concurrent callers", async () => {
    const cache = new TtlCache<string>(1000);
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const a = cache.get("k", load);
    const b = cache.get("k", load);
    resolve("v");
    expect(await a).toBe("v");
    expect(await b).toBe("v");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after the TTL expires", async () => {
    const cache = new TtlCache<string>(1000);
    const load = vi.fn(async () => "v");
    await cache.get("k", load);
    vi.advanceTimersByTime(1001);
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reloads after an explicit delete", async () => {
    const cache = new TtlCache<string>(1000);
    const load = vi.fn(async () => "v");
    await cache.get("k", load);
    cache.delete("k");
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("evicts only matching keys on deletePrefix", async () => {
    const cache = new TtlCache<string>(1000);
    const load = vi.fn(async () => "v");
    await cache.get("base/JOBS list:{}", load);
    await cache.get("base/JOBS get:rec1", load);
    await cache.get("base/JOBS_ARCHIVE list:{}", load);
    cache.deletePrefix("base/JOBS ");
    await cache.get("base/JOBS list:{}", load); // reloads
    await cache.get("base/JOBS get:rec1", load); // reloads
    await cache.get("base/JOBS_ARCHIVE list:{}", load); // still cached
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("does not cache a rejected load", async () => {
    const cache = new TtlCache<string>(1000);
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("v");
    await expect(cache.get("k", load)).rejects.toThrow("boom");
    expect(await cache.get("k", load)).toBe("v");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
