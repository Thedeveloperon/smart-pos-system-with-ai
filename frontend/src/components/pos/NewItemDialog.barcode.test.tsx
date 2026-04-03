import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewItemDialog from "./NewItemDialog";
import {
  fetchCategories,
  fetchProductCatalogItems,
  generateProductBarcode,
  validateProductBarcode,
} from "@/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    fetchCategories: vi.fn(),
    fetchProductCatalogItems: vi.fn(),
    generateProductBarcode: vi.fn(),
    validateProductBarcode: vi.fn(),
  };
});

function renderDialog() {
  render(
    <NewItemDialog
      open={true}
      onOpenChange={vi.fn()}
    />,
  );
}

describe("NewItemDialog barcode flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCategories).mockResolvedValue([]);
    vi.mocked(fetchProductCatalogItems).mockResolvedValue([]);
  });

  it("generates barcode and shows success message", async () => {
    vi.mocked(generateProductBarcode).mockResolvedValue({
      barcode: "4006381333931",
      format: "ean-13",
      generated_at: "2026-04-03T00:00:00Z",
    });

    renderDialog();

    fireEvent.click(await screen.findByRole("button", { name: "Gen" }));

    await waitFor(() => {
      expect(generateProductBarcode).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByLabelText("Barcode")).toHaveValue("4006381333931");
    expect(screen.getByText("Generated EAN-13 barcode is ready.")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Barcode generated.");
  });

  it("shows invalid, duplicate, and valid inline validation states", async () => {
    vi.mocked(validateProductBarcode)
      .mockResolvedValueOnce({
        barcode: "123",
        normalized_barcode: "123",
        is_valid: false,
        format: "numeric-custom",
        message: "Barcode format is invalid.",
        exists: false,
      })
      .mockResolvedValueOnce({
        barcode: "4006381333931",
        normalized_barcode: "4006381333931",
        is_valid: true,
        format: "ean-13",
        message: null,
        exists: true,
      })
      .mockResolvedValueOnce({
        barcode: "5901234123457",
        normalized_barcode: "5901234123457",
        is_valid: true,
        format: "ean-13",
        message: null,
        exists: false,
      });

    renderDialog();

    const barcodeInput = await screen.findByLabelText("Barcode");

    fireEvent.change(barcodeInput, { target: { value: "123" } });
    fireEvent.blur(barcodeInput);
    expect(await screen.findByText("Barcode format is invalid.")).toBeInTheDocument();

    fireEvent.change(barcodeInput, { target: { value: "4006381333931" } });
    fireEvent.blur(barcodeInput);
    expect(await screen.findByText("Barcode already exists in another product.")).toBeInTheDocument();

    fireEvent.change(barcodeInput, { target: { value: "5901234123457" } });
    fireEvent.blur(barcodeInput);
    expect(await screen.findByText("Barcode is valid (ean-13).")).toBeInTheDocument();

    expect(validateProductBarcode).toHaveBeenCalledTimes(3);
  });
});
