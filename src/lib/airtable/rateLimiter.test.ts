import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { throttle } from "./rateLimiter";

describe("throttle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("spaces request starts without waiting for prior completions", async () => {
    const started: number[] = [];
    // Calls never resolve — starts must still proceed on schedule (the old
    // limiter serialized on completion, which would deadlock this test).
    const slow = () => {
      started.push(Date.now());
      return new Promise<never>(() => {});
    };
    const t0 = Date.now();
    void throttle("base", slow);
    void throttle("base", slow);
    void throttle("base", slow);
    await vi.advanceTimersByTimeAsync(500);
    expect(started.map((t) => t - t0)).toEqual([0, 220, 440]);
  });

  it("rate-limits per base, not globally", async () => {
    const started: string[] = [];
    const mark = (label: string) => () => {
      started.push(label);
      return Promise.resolve();
    };
    void throttle("a", mark("a1"));
    void throttle("b", mark("b1"));
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(["a1", "b1"]);
  });

  it("propagates the function's rejection to the caller", async () => {
    vi.useRealTimers();
    await expect(throttle("err-base", async () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    // The failure must not poison the queue for the next call.
    await expect(throttle("err-base", async () => "ok")).resolves.toBe("ok");
  });
});
