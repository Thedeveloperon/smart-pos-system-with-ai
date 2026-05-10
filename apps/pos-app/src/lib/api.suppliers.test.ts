import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupplier, updateSupplier } from "@/lib/api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function buildSupplierResponse(isActive: boolean) {
  return {
    supplier_id: "supplier-1",
    name: "Ashan Silva",
    phone: null,
    email: null,
    company_name: null,
    company_phone: null,
    address: null,
    is_active: isActive,
    brands: [],
    linked_product_count: 0,
    can_delete: !isActive,
    delete_block_reason: null,
    created_at: "2026-05-08T00:00:00.000Z",
    updated_at: "2026-05-08T00:00:00.000Z",
  };
}

describe("supplier API payloads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("sends snake_case supplier status when creating a supplier", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { is_active?: boolean };
      expect(body.is_active).toBe(false);
      return jsonResponse(buildSupplierResponse(false));
    });

    vi.stubGlobal("fetch", fetchMock);

    await createSupplier({
      name: "Ashan Silva",
      is_active: false,
      brand_ids: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends snake_case supplier status when updating a supplier", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { is_active?: boolean };
      expect(body.is_active).toBe(false);
      return jsonResponse(buildSupplierResponse(false));
    });

    vi.stubGlobal("fetch", fetchMock);

    await updateSupplier("supplier-1", {
      name: "Ashan Silva",
      is_active: false,
      brand_ids: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
