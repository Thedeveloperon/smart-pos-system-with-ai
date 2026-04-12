import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LicensingProvider, useLicensing } from "./LicensingContext";
import { ApiError, type LicenseStatus } from "@/lib/api";

const apiMocks = vi.hoisted(() => ({
  fetchLicenseStatus: vi.fn(),
  heartbeatLicense: vi.fn(),
  activateLicense: vi.fn(),
  getTerminalId: vi.fn(),
}));

const cacheMocks = vi.hoisted(() => ({
  loadCachedLicenseStatus: vi.fn(),
  saveCachedLicenseStatus: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchLicenseStatus: apiMocks.fetchLicenseStatus,
    heartbeatLicense: apiMocks.heartbeatLicense,
    activateLicense: apiMocks.activateLicense,
    getTerminalId: apiMocks.getTerminalId,
  };
});

vi.mock("@/components/licensing/licenseCache", () => ({
  loadCachedLicenseStatus: cacheMocks.loadCachedLicenseStatus,
  saveCachedLicenseStatus: cacheMocks.saveCachedLicenseStatus,
}));

function buildStatus(overrides: Partial<LicenseStatus> = {}): LicenseStatus {
  return {
    state: "active",
    shopId: "00000000-0000-0000-0000-000000000001",
    terminalId: "licensing-context-terminal",
    deviceCode: "licensing-context-device",
    subscriptionStatus: "active",
    plan: "starter",
    seatLimit: 2,
    activeSeats: 1,
    validUntil: new Date("2027-01-01T00:00:00.000Z"),
    graceUntil: new Date("2027-01-08T00:00:00.000Z"),
    licenseToken: "context-token",
    blockedActions: [],
    serverTime: new Date("2026-03-31T12:00:00.000Z"),
    ...overrides,
  };
}

const Probe = () => {
  const { status, error } = useLicensing();
  return (
    <>
      <div data-testid="state">{status?.state || "none"}</div>
      <div data-testid="error">{error || ""}</div>
    </>
  );
};

const ActivateProbe = () => {
  const { activate, error } = useLicensing();
  return (
    <>
      <button onClick={() => void activate({ activationEntitlementKey: "SPK-TEST" })}>activate</button>
      <div data-testid="activation-error">{error || ""}</div>
    </>
  );
};

describe("LicensingContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchLicenseStatus.mockResolvedValue(buildStatus());
    apiMocks.heartbeatLicense.mockResolvedValue(buildStatus());
    apiMocks.activateLicense.mockResolvedValue(buildStatus());
    apiMocks.getTerminalId.mockReturnValue("licensing-context-terminal");
    cacheMocks.loadCachedLicenseStatus.mockResolvedValue(null);
    cacheMocks.saveCachedLicenseStatus.mockResolvedValue(undefined);
  });

  it("uses cached status when initial online validation fails", async () => {
    const cachedStatus = buildStatus({ state: "grace", subscriptionStatus: "past_due" });
    apiMocks.fetchLicenseStatus.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    cacheMocks.loadCachedLicenseStatus.mockResolvedValueOnce({
      status: cachedStatus,
      warning: "Using cached license (last validated 3/31/2026, 5:30:00 PM).",
      lastValidatedAtServer: new Date("2026-03-31T12:00:00.000Z"),
      lastValidatedAtClient: new Date("2026-03-31T12:01:00.000Z"),
    });

    render(
      <LicensingProvider>
        <Probe />
      </LicensingProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toBe("grace");
    });
    expect(screen.getByTestId("error").textContent).toMatch(/Using cached license/i);
    expect(cacheMocks.loadCachedLicenseStatus).toHaveBeenCalledWith("licensing-context-terminal");
  });

  it("retries heartbeat when connectivity returns", async () => {
    render(
      <LicensingProvider>
        <Probe />
      </LicensingProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toBe("active");
    });

    window.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(apiMocks.heartbeatLicense).toHaveBeenCalled();
    });
  });

  it("maps cloud relay outage code to actionable license message", async () => {
    apiMocks.activateLicense.mockRejectedValueOnce(
      new ApiError("Cloud licensing service is temporarily unreachable.", 503, "CLOUD_LICENSE_UNREACHABLE")
    );

    render(
      <LicensingProvider>
        <ActivateProbe />
      </LicensingProvider>
    );

    screen.getByRole("button", { name: /activate/i }).click();

    await waitFor(() => {
      expect(screen.getByTestId("activation-error").textContent).toMatch(/temporarily unreachable/i);
    });
  });
});
