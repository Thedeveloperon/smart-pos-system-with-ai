import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SerialNumbersTab from "./SerialNumbersTab";
import {
  fetchProductCatalogItems,
  fetchSerialNumbers,
  fetchSerialHistory,
  lookupSerial,
  type CatalogProduct,
  type SerialNumberRecord,
} from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    fetchProductCatalogItems: vi.fn(),
    fetchSerialNumbers: vi.fn(),
    fetchSerialHistory: vi.fn(),
    lookupSerial: vi.fn(),
  };
});

async function pickSelect(label: string, option: string) {
  const labelNode = screen
    .getAllByText(label)
    .find((element) => element.tagName === "LABEL");
  const section = labelNode?.closest("div");
  if (!section) {
    throw new Error(`Missing select section for ${label}`);
  }

  const trigger = within(section).getByRole("combobox");
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

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

  it("shows serial actions in the lookup result", async () => {
    const products: CatalogProduct[] = [
      {
        id: "product-1",
        name: "Panasonic Led Bulb 3W",
        sku: "LED-3W",
        unitPrice: 250,
        costPrice: 180,
        stockQuantity: 12,
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

    vi.mocked(fetchProductCatalogItems).mockResolvedValue(products);
    vi.mocked(fetchSerialNumbers).mockResolvedValue([]);
    vi.mocked(lookupSerial).mockResolvedValue({
      serial_id: "serial-1",
      serial_value: "SN-0002",
      product_id: "product-1",
      product_name: "Panasonic Led Bulb 3W",
      status: "Available",
      sale_id: undefined,
      sale_item_id: undefined,
      refund_id: undefined,
      sale_date: undefined,
      warranty_expiry_date: undefined,
      product: products[0] as never,
    });

    render(<SerialNumbersTab />);

    const searchInput = screen.getByPlaceholderText("Search serial number...");
    fireEvent.change(searchInput, { target: { value: "SN-0002" } });
    fireEvent.click(screen.getByRole("button", { name: "Lookup" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open serial actions" })).toBeInTheDocument();
    });
  });

  it("shows serial history timeline from the actions menu", async () => {
    const products: CatalogProduct[] = [
      {
        id: "product-1",
        name: "Panasonic Led Bulb 3W",
        sku: "LED-3W",
        unitPrice: 250,
        costPrice: 180,
        stockQuantity: 12,
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

    vi.mocked(fetchProductCatalogItems).mockResolvedValue(products);
    vi.mocked(fetchSerialNumbers).mockResolvedValue([
      {
        id: "serial-1",
        product_id: "product-1",
        serial_value: "SN-001",
        status: "Sold",
        sale_id: "sale-1",
        warranty_expiry_date: "2026-11-06T00:00:00.000Z",
        created_at: "2026-05-01T12:34:56.000Z",
      },
    ]);
    vi.mocked(fetchSerialHistory).mockResolvedValue({
      serial_id: "serial-1",
      serial_value: "SN-001",
      items: [
        {
          event_type: "serial_recorded",
          at: "2026-05-01T12:34:56.000Z",
          title: "Serial added to inventory",
          description: "Serial SN-001 was recorded as Sold.",
        },
        {
          event_type: "sale",
          at: "2026-05-03T12:00:00.000Z",
          title: "Sold",
          description: "Sold via sale SAL-001 to Jane Doe.",
          customer_name: "Jane Doe",
        },
      ],
    });

    render(<SerialNumbersTab />);

    await waitFor(() => {
      expect(screen.getByText("SN-001")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "View history" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /serial history/i })).toBeInTheDocument();
      expect(screen.getByText("Serial added to inventory")).toBeInTheDocument();
      expect(screen.getByText("Sold via sale SAL-001 to Jane Doe.")).toBeInTheDocument();
      expect(screen.getByText("Customer: Jane Doe")).toBeInTheDocument();
    });
  });

  it("filters serial rows by status", async () => {
    const products: CatalogProduct[] = [
      {
        id: "product-1",
        name: "Panasonic Led Bulb 3W",
        sku: "LED-3W",
        unitPrice: 250,
        costPrice: 180,
        stockQuantity: 12,
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
      {
        id: "serial-2",
        product_id: "product-1",
        serial_value: "SN-002",
        status: "Sold",
        warranty_expiry_date: "2026-12-06T00:00:00.000Z",
        created_at: "2026-05-02T12:34:56.000Z",
      },
    ];

    vi.mocked(fetchProductCatalogItems).mockResolvedValue(products);
    vi.mocked(fetchSerialNumbers).mockResolvedValue(serials);

    render(<SerialNumbersTab />);

    await waitFor(() => {
      expect(screen.getByText("SN-001")).toBeInTheDocument();
      expect(screen.getByText("SN-002")).toBeInTheDocument();
    });

    await pickSelect("Status", "Sold");

    await waitFor(() => {
      expect(screen.getByText("SN-002")).toBeInTheDocument();
      expect(screen.queryByText("SN-001")).not.toBeInTheDocument();
    });
  });
});
