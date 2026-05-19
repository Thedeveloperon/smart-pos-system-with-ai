import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BatchesTab from "./BatchesTab";
import {
  createProductBatch,
  fetchExpiringBatches,
  fetchProductBatches,
  fetchProductCatalogItems,
  fetchSuppliers,
  type CatalogProduct,
  type ProductBatch,
} from "@/lib/api";
import { INVENTORY_REFRESH_EVENT } from "@/lib/inventoryRefresh";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    fetchProductCatalogItems: vi.fn(),
    fetchProductBatches: vi.fn(),
    fetchExpiringBatches: vi.fn(),
    fetchSuppliers: vi.fn(),
    createProductBatch: vi.fn(),
    updateProductBatch: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockProducts: CatalogProduct[] = [
  {
    id: "product-1",
    name: "Test Product",
    sku: "TP-001",
    unitPrice: 10,
    costPrice: 8,
    stockQuantity: 100,
    reorderLevel: 10,
    alertLevel: 5,
    allowNegativeStock: false,
    isBatchTracked: true,
    isActive: true,
    isLowStock: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const existingBatches: ProductBatch[] = [
  {
    id: "batch-1",
    product_id: "product-1",
    batch_number: "Batch0123",
    initial_quantity: 50,
    remaining_quantity: 50,
    cost_price: 8,
    received_at: "2026-01-01T00:00:00.000Z",
  },
];

function getInputAfterLabel(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  const container = label.closest(".grid.gap-1")!;
  return within(container as HTMLElement).getByRole("textbox") as HTMLInputElement;
}

function getNumberInputAfterLabel(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText);
  const container = label.closest(".grid.gap-1")!;
  return within(container as HTMLElement).getByRole("spinbutton") as HTMLInputElement;
}

describe("BatchesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProductCatalogItems).mockResolvedValue(mockProducts);
    vi.mocked(fetchProductBatches).mockResolvedValue(existingBatches);
    vi.mocked(fetchExpiringBatches).mockResolvedValue([
      {
        batch_id: "batch-1",
        product_id: "product-1",
        product_name: "Test Product",
        batch_number: "Batch0123",
        expiry_date: "2026-02-01T00:00:00.000Z",
        remaining_quantity: 50,
        days_until_expiry: 10,
      },
    ]);
    vi.mocked(fetchSuppliers).mockResolvedValue([]);
  });

  it("rejects a batch number that differs only in casing (Batch0123 vs batch0123)", async () => {
    const { toast } = await import("sonner");
    render(<BatchesTab />);

    await waitFor(() => {
      expect(fetchProductBatches).toHaveBeenCalledWith("product-1");
    });

    const addButton = await screen.findByRole("button", { name: /add batch/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText("Batch number")).toBeInTheDocument();
    });

    const batchInput = getInputAfterLabel("Batch number");
    fireEvent.change(batchInput, { target: { value: "batch0123" } });

    const saveButton = screen.getByRole("button", { name: /save batch/i });
    fireEvent.click(saveButton);

    expect(toast.error).toHaveBeenCalledWith(
      "Batch number already exists for this product.",
    );
    expect(createProductBatch).not.toHaveBeenCalled();
  });

  it("allows a genuinely unique batch number", async () => {
    vi.mocked(createProductBatch).mockResolvedValue({
      id: "batch-2",
      product_id: "product-1",
      batch_number: "UniqueB456",
      initial_quantity: 10,
      remaining_quantity: 10,
      cost_price: 5,
      received_at: "2026-01-01T00:00:00.000Z",
    });
    vi.mocked(fetchProductBatches)
      .mockResolvedValueOnce(existingBatches)
      .mockResolvedValueOnce([
        ...existingBatches,
        {
          id: "batch-2",
          product_id: "product-1",
          batch_number: "UniqueB456",
          initial_quantity: 10,
          remaining_quantity: 10,
          cost_price: 5,
          received_at: "2026-01-01T00:00:00.000Z",
        },
      ]);

    const refreshHandler = vi.fn();
    window.addEventListener(INVENTORY_REFRESH_EVENT, refreshHandler);
    render(<BatchesTab />);

    await waitFor(() => {
      expect(fetchProductBatches).toHaveBeenCalledWith("product-1");
    });

    const addButton = await screen.findByRole("button", { name: /add batch/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText("Batch number")).toBeInTheDocument();
    });

    const batchInput = getInputAfterLabel("Batch number");
    fireEvent.change(batchInput, { target: { value: "UniqueB456" } });

    const quantityInput = getNumberInputAfterLabel("Initial quantity");
    fireEvent.change(quantityInput, { target: { value: "10" } });

    const costInput = getNumberInputAfterLabel("Cost price");
    fireEvent.change(costInput, { target: { value: "5" } });

    const saveButton = screen.getByRole("button", { name: /save batch/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(createProductBatch).toHaveBeenCalled();
    });
    expect(refreshHandler).toHaveBeenCalledTimes(1);

    window.removeEventListener(INVENTORY_REFRESH_EVENT, refreshHandler);
  });

  it("shows only expiring batches when the expiring soon filter is selected", async () => {
    vi.mocked(fetchProductBatches).mockResolvedValue([
      existingBatches[0],
      {
        id: "batch-2",
        product_id: "product-1",
        batch_number: "FreshBatch",
        initial_quantity: 25,
        remaining_quantity: 25,
        cost_price: 6,
        received_at: "2026-01-01T00:00:00.000Z",
        expiry_date: "2027-01-01T00:00:00.000Z",
      },
    ]);

    render(<BatchesTab />);

    await waitFor(() => {
      expect(fetchProductBatches).toHaveBeenCalledWith("product-1");
    });

    expect(await screen.findByText("Batch0123")).toBeInTheDocument();
    expect(screen.getByText("FreshBatch")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Batch view" }));
    fireEvent.click(await screen.findByText("Expiring soon"));

    await waitFor(() => {
      expect(fetchExpiringBatches).toHaveBeenCalledWith(30);
    });

    expect(screen.getByText("Batch0123")).toBeInTheDocument();
    expect(screen.queryByText("FreshBatch")).not.toBeInTheDocument();
  });
});
