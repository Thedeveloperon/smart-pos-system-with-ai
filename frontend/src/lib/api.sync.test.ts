import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapOfflineSyncEventMessage, syncOfflineEvents, type SyncEventRequestItem } from "@/lib/api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("syncOfflineEvents", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("prefetches offline grant token for sale/refund batches", async () => {
    const nowIso = "2026-04-01T08:00:00.000Z";
    const event: SyncEventRequestItem = {
      eventId: "11111111-1111-1111-1111-111111111111",
      storeId: null,
      deviceId: null,
      deviceTimestamp: nowIso,
      type: "sale",
      payload: {
        sale_number: "OFF-1001",
      },
    };

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("/api/license/status");
        return jsonResponse({
          state: "active",
          device_code: "device-a",
          blocked_actions: [],
          server_time: nowIso,
          license_token: "license-token-1",
          offline_grant_token: "offline-grant-token-1",
          offline_grant_expires_at: "2026-04-03T08:00:00.000Z",
        });
      })
      .mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain("/api/sync/events");
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          offline_grant_token?: string | null;
          events?: Array<{ type?: string }>;
        };
        expect(body.offline_grant_token).toBe("offline-grant-token-1");
        expect(body.events?.[0]?.type).toBe("sale");

        return jsonResponse({
          results: [
            {
              event_id: event.eventId,
              status: "synced",
              server_timestamp: nowIso,
              message: "offline_event_synced",
            },
          ],
        });
      });

    vi.stubGlobal("fetch", fetchMock);

    const response = await syncOfflineEvents([event]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.results).toHaveLength(1);
    expect(response.results[0].status).toBe("synced");
    expect(response.results[0].displayMessage).toMatch(/synced successfully/i);
  });

  it("does not prefetch grant token for stock-only batches", async () => {
    const nowIso = "2026-04-01T08:10:00.000Z";
    const event: SyncEventRequestItem = {
      eventId: "22222222-2222-2222-2222-222222222222",
      storeId: null,
      deviceId: null,
      deviceTimestamp: nowIso,
      type: "stock_update",
      payload: {
        product_id: "33333333-3333-3333-3333-333333333333",
        delta_quantity: 2,
      },
    };

    const fetchMock = vi.fn().mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("/api/sync/events");
      const body = JSON.parse(String(init?.body ?? "{}")) as { offline_grant_token?: string | null };
      expect(body.offline_grant_token ?? null).toBeNull();

      return jsonResponse({
        results: [
          {
            event_id: event.eventId,
            status: "synced",
            server_timestamp: nowIso,
            message: "stock_update_applied",
          },
        ],
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const response = await syncOfflineEvents([event]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.results[0].displayMessage).toMatch(/stock update applied/i);
  });

  it("continues sync when grant prefetch fails with API error", async () => {
    const nowIso = "2026-04-01T08:20:00.000Z";
    const event: SyncEventRequestItem = {
      eventId: "44444444-4444-4444-4444-444444444444",
      storeId: null,
      deviceId: null,
      deviceTimestamp: nowIso,
      type: "refund",
      payload: {
        sale_id: "55555555-5555-5555-5555-555555555555",
      },
    };

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        return jsonResponse(
          {
            error: {
              code: "LICENSE_TEMP_UNAVAILABLE",
              message: "temporarily unavailable",
            },
          },
          503
        );
      })
      .mockImplementationOnce(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { offline_grant_token?: string | null };
        expect(body.offline_grant_token ?? null).toBeNull();
        return jsonResponse({
          results: [
            {
              event_id: event.eventId,
              status: "rejected",
              server_timestamp: nowIso,
              message: "offline_grant_required",
            },
          ],
        });
      });

    vi.stubGlobal("fetch", fetchMock);

    const response = await syncOfflineEvents([event]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.results[0].status).toBe("rejected");
    expect(response.results[0].displayMessage).toMatch(/offline grant is required/i);
  });
});

describe("mapOfflineSyncEventMessage", () => {
  it("maps known machine messages", () => {
    expect(mapOfflineSyncEventMessage("offline_grant_checkout_limit_exceeded")).toMatch(/checkout limit/i);
  });

  it("formats unknown machine messages", () => {
    expect(mapOfflineSyncEventMessage("some_new_error_code")).toBe("some new error code");
  });

  it("returns null for empty values", () => {
    expect(mapOfflineSyncEventMessage(undefined)).toBeNull();
    expect(mapOfflineSyncEventMessage("  ")).toBeNull();
  });
});
