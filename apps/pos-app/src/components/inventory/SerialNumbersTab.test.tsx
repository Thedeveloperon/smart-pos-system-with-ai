import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SerialNumbersTab from "./SerialNumbersTab";
import {
  fetchProductCatalogItems,
  fetchSerialNumbers,
  type CatalogProduct,
  type SerialNumberRecord,
} from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    fetchProductCatalogItems: vi.fn(),
    fetchSerialNumbers: vi.fn(),
  };
});

describe("SerialNumbersTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the purchase date and time for each serial", async () => {
    const products: CatalogProduct[] = [
      {
        id: "product-1",
        name: "iPhone 15 Pro",
        sku: "IPH-15-PRO",
        unitPrice: 1000,
        costPrice: 900,
        stockQuantity: 1,
        reorderLevel: 0,
        alertLevel: 0,
        allowNegativeStock: false,
        isSerialTracked: true,
        isActive: true,
        isLowStock: false,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: null,
      },
    ];

    const serials: SerialNumberRecord[] = [
      {
        id: "serial-1",
        product_id: "product-1",
        serial_value: "SN-001",
        status: "Available",
        warranty_expiry_date: "2026-11-06T00:00:00.000Z",
        created_at: "2026-05-01T12:34:56.000Z",
      },
    ];

    vi.mocked(fetchProductCatalogItems).mockResolvedValue(products);
    vi.mocked(fetchSerialNumbers).mockResolvedValue(serials);

    render(<SerialNumbersTab />);

    const expectedTimestamp = new Date(serials[0].created_at).toLocaleString();

    await waitFor(() => {
      expect(screen.getByText("Purchase date/time")).toBeInTheDocument();
      expect(screen.getByText(expectedTimestamp)).toBeInTheDocument();
    });
  });
});
