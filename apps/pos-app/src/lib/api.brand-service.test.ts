import { beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("brand and service status payloads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("sends is_active when updating a brand", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        brand_id: "brand-1",
        name: "Brand A",
        code: "BA",
        description: "",
        is_active: false,
        product_count: 0,
        can_delete: true,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { updateBrand } = await import("@/lib/api");

    await updateBrand("brand-1", {
      name: "Brand A",
      code: "BA",
      description: "",
      is_active: false,
    });

    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("/api/brands/brand-1");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          name: "Brand A",
          code: "BA",
          description: null,
          is_active: false,
        }),
      }),
    );
  });

  it("sends is_active when updating a service", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "service-1",
        name: "Delivery",
        sku: "DEL-001",
        price: 250,
        description: "",
        category_id: null,
        category_name: null,
        duration_minutes: null,
        is_active: false,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { updateService } = await import("@/lib/api");

    await updateService("service-1", {
      is_active: false,
    });

    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("/api/services/service-1");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          name: null,
          sku: null,
          price: null,
          description: null,
          category_id: null,
          duration_minutes: null,
          is_active: false,
        }),
      }),
    );
  });
});
