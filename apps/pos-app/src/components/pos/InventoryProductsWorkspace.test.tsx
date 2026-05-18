import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InventoryProductsWorkspace from "./InventoryProductsWorkspace";
import { fetchProducts } from "@/lib/api";
import { INVENTORY_REFRESH_EVENT } from "@/lib/inventoryRefresh";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchProducts: vi.fn(),
  };
});

vi.mock("./ProductCard", () => ({
  default: () => <div data-testid="product-card" />,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("InventoryProductsWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProducts).mockResolvedValue([]);
  });

  it("refreshes when inventory changes", async () => {
    render(<InventoryProductsWorkspace />);

    await waitFor(() => {
      expect(fetchProducts).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      window.dispatchEvent(new Event(INVENTORY_REFRESH_EVENT));
    });

    await waitFor(() => {
      expect(fetchProducts).toHaveBeenCalledTimes(2);
    });
  });
});
