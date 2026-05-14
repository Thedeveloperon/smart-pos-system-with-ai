import { describe, expect, it } from "vitest";
import { computeOfflineSyncRetryDelayMs, flushOfflineSyncQueue } from "@/lib/offlineSyncQueue";

describe("computeOfflineSyncRetryDelayMs", () => {
  it("increases exponentially for early retries", () => {
    expect(computeOfflineSyncRetryDelayMs(1)).toBe(10_000);
    expect(computeOfflineSyncRetryDelayMs(2)).toBe(20_000);
    expect(computeOfflineSyncRetryDelayMs(3)).toBe(40_000);
  });

  it("caps delay at max retry window", () => {
    expect(computeOfflineSyncRetryDelayMs(20)).toBe(15 * 60 * 1000);
  });
});

describe("flushOfflineSyncQueue", () => {
  it("returns a safe failure payload when IndexedDB is unavailable", async () => {
    const originalIndexedDb = window.indexedDB;

    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    });

    try {
      const result = await flushOfflineSyncQueue();
      expect(result.attempted).toBe(0);
      expect(result.failureMessage).toMatch(/unavailable/i);
    } finally {
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        value: originalIndexedDb,
      });
    }
  });
});
