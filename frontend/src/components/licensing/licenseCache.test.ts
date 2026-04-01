import { beforeEach, describe, expect, it } from "vitest";
import { loadCachedLicenseStatus, saveCachedLicenseStatus } from "./licenseCache";
import type { LicenseStatus } from "@/lib/api";

const CACHE_KEY = "smartpos-license-cache-v1";

function buildStatus(overrides: Partial<LicenseStatus> = {}): LicenseStatus {
  const now = new Date();
  return {
    state: "active",
    shopId: "00000000-0000-0000-0000-000000000001",
    deviceCode: "cache-test-device",
    subscriptionStatus: "active",
    plan: "starter",
    seatLimit: 2,
    activeSeats: 1,
    validUntil: new Date(now.getTime() + 60 * 60 * 1000),
    graceUntil: new Date(now.getTime() + 2 * 60 * 60 * 1000),
    licenseToken: "cache-test-token",
    blockedActions: [],
    serverTime: now,
    ...overrides,
  };
}

function rewriteCachedValidationTimes(options: { serverMsAgo: number; clientMsAgo: number }) {
  const raw = window.localStorage.getItem(CACHE_KEY);
  if (!raw) {
    throw new Error("License cache entry is missing.");
  }

  const envelope = JSON.parse(raw) as {
    validated_server_time?: string;
    validated_client_time?: number;
  };
  envelope.validated_server_time = new Date(Date.now() - options.serverMsAgo).toISOString();
  envelope.validated_client_time = Date.now() - options.clientMsAgo;
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(envelope));
}

describe("licenseCache", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns grace status from cached license when validity expired but grace is still active", async () => {
    const now = new Date();
    await saveCachedLicenseStatus(
      buildStatus({
        state: "active",
        serverTime: now,
        validUntil: new Date(now.getTime() - 5 * 60 * 1000),
        graceUntil: new Date(now.getTime() + 60 * 60 * 1000),
      })
    );
    rewriteCachedValidationTimes({ serverMsAgo: 10 * 60 * 1000, clientMsAgo: 10 * 60 * 1000 });

    const cached = await loadCachedLicenseStatus("cache-test-device");
    expect(cached).not.toBeNull();
    expect(cached?.status.state).toBe("grace");
    expect(cached?.warning).toMatch(/Using cached license/i);
  });

  it("returns suspended status from cached license when grace window has expired", async () => {
    const now = new Date();
    await saveCachedLicenseStatus(
      buildStatus({
        state: "active",
        serverTime: now,
        validUntil: new Date(now.getTime() - 10 * 60 * 1000),
        graceUntil: new Date(now.getTime() - 2 * 60 * 1000),
      })
    );
    rewriteCachedValidationTimes({ serverMsAgo: 15 * 60 * 1000, clientMsAgo: 15 * 60 * 1000 });

    const cached = await loadCachedLicenseStatus("cache-test-device");
    expect(cached).not.toBeNull();
    expect(cached?.status.state).toBe("suspended");
    expect(cached?.status.blockedActions).toEqual(["checkout", "refund"]);
  });

  it("blocks cached usage when system clock rollback is detected", async () => {
    await saveCachedLicenseStatus(buildStatus());

    const raw = window.localStorage.getItem(CACHE_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw || "{}") as { last_client_seen_time?: number };
    envelope.last_client_seen_time = Date.now() + 10 * 60 * 1000;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(envelope));

    const cached = await loadCachedLicenseStatus("cache-test-device");
    expect(cached).not.toBeNull();
    expect(cached?.status.state).toBe("suspended");
    expect(cached?.warning).toMatch(/clock moved backwards/i);
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});
