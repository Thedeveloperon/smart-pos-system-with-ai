import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StockMovementsTab from "./StockMovementsTab";
import { toast } from "sonner";

const fetchStockMovementsMock = vi.fn();
const fetchProductCatalogItemsMock = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    fetchProductCatalogItems: (...args: unknown[]) => fetchProductCatalogItemsMock(...args),
    fetchStockMovements: (...args: unknown[]) => fetchStockMovementsMock(...args),
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe("StockMovementsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchProductCatalogItemsMock.mockResolvedValue([
      {
        id: "product-1",
        name: "Rice",
        sku: "RICE-001",
        barcode: null,
        imageUrl: null,
        categoryId: null,
        categoryName: null,
        brandId: null,
        brandName: null,
        unitPrice: 0,
        costPrice: 0,
        stockQuantity: 0,
        isBatchTracked: false,
        isSerialTracked: false,
        isActive: true,
        createdAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "product-2",
        name: "Tea",
        sku: "TEA-001",
        barcode: null,
        imageUrl: null,
        categoryId: null,
        categoryName: null,
        brandId: null,
        brandName: null,
        unitPrice: 0,
        costPrice: 0,
        stockQuantity: 0,
        isBatchTracked: false,
        isSerialTracked: false,
        isActive: true,
        createdAt: "2026-05-01T00:00:00.000Z",
      },
    ]);
    fetchStockMovementsMock.mockResolvedValue({
      items: [
        {
          id: "movement-1",
          product_id: "product-1",
          product_name: "Rice",
          movement_type: "Adjustment",
          quantity_before: 10,
          quantity_change: 2,
          quantity_after: 12,
          reference_type: "Adjustment",
          reason: "cycle count",
          created_by_user_id: "user-1",
          created_by_username: "Sampath Perera",
          created_at: "2026-05-10T08:24:11.000Z",
        },
      ],
      total: 1,
      page: 1,
      take: 20,
    });
  });

  it("uses a real product id when filtering by product", async () => {
    render(<StockMovementsTab />);

    await screen.findByRole("button", { name: /all products/i });
    await waitFor(() => {
      expect(fetchStockMovementsMock).toHaveBeenCalledWith(
        expect.objectContaining({ product_id: undefined, page: 1 }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /all products/i }));
    fireEvent.click(await screen.findByText("Rice", { selector: "span" }));

    await waitFor(() => {
      expect(fetchStockMovementsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ product_id: "product-1", page: 1 }),
      );
    });
  });

  it("rejects an invalid date range before calling the API", async () => {
    render(<StockMovementsTab />);

    await screen.findByRole("button", { name: /all products/i });
    const initialCalls = fetchStockMovementsMock.mock.calls.length;

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-05-10" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-05-01" } });

    expect(toast.error).toHaveBeenCalledWith("To date cannot be before From date.");
    expect(fetchStockMovementsMock.mock.calls.length).toBe(initialCalls + 1);
  });

  it("moves between explicit pages without losing the active filters", async () => {
    fetchStockMovementsMock
      .mockResolvedValueOnce({
        items: [
          {
            id: "movement-1",
            product_id: "product-1",
            product_name: "Rice",
            movement_type: "Adjustment",
            quantity_before: 10,
            quantity_change: 2,
            quantity_after: 12,
            reference_type: "Adjustment",
            reason: "cycle count",
            created_by_user_id: "user-1",
            created_by_username: "Sampath Perera",
            created_at: "2026-05-10T08:24:11.000Z",
          },
        ],
        total: 21,
        page: 1,
        take: 20,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "movement-2",
            product_id: "product-1",
            product_name: "Rice",
            movement_type: "Purchase",
            quantity_before: 12,
            quantity_change: 10,
            quantity_after: 22,
            reference_type: "Purchase",
            reason: "restock",
            created_by_user_id: "user-1",
            created_by_username: "Sampath Perera",
            created_at: "2026-05-11T08:24:11.000Z",
          },
        ],
        total: 21,
        page: 2,
        take: 20,
      });

    render(<StockMovementsTab />);

    await screen.findByText("Rice");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /next page/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /next page/i }));

    await waitFor(() => {
      expect(fetchStockMovementsMock).toHaveBeenCalledTimes(2);
      expect(fetchStockMovementsMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ page: 2, product_id: undefined }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /previous page/i }));

    await waitFor(() => {
      expect(fetchStockMovementsMock).toHaveBeenCalledTimes(3);
      expect(fetchStockMovementsMock).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({ page: 1, product_id: undefined }),
      );
    });
  });

  it("exports the filtered movement set as CSV", async () => {
    const createObjectUrlSpy = vi.fn(() => "blob:stock-movements");
    const revokeObjectUrlSpy = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrlSpy,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrlSpy,
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<StockMovementsTab />);

    await screen.findByText("Rice");
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => {
      expect(fetchStockMovementsMock).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100, page: 1 }),
      );
      expect(createObjectUrlSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
  });
});
