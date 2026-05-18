import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import BulkImportDialog from "./BulkImportDialog";

const parseFileMock = vi.fn();
const bulkImportBrandsMock = vi.fn();

vi.mock("./useFileParser", () => ({
  parseFile: (...args: unknown[]) => parseFileMock(...args),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    bulkImportBrands: (...args: unknown[]) => bulkImportBrandsMock(...args),
    bulkImportCategories: vi.fn(),
    bulkImportProducts: vi.fn(),
    bulkImportCustomers: vi.fn(),
  };
});

describe("BulkImportDialog", () => {
  beforeEach(() => {
    parseFileMock.mockReset();
    bulkImportBrandsMock.mockReset();
  });

  it("keeps Next disabled until file and duplicate strategy are selected", async () => {
    parseFileMock.mockResolvedValue({ rows: [], headers: [], error: null });
    render(<BulkImportDialog open onOpenChange={vi.fn()} entityType="brand" onImportComplete={vi.fn()} />);

    const nextButton = screen.getByRole("button", { name: "Next: Preview" });
    expect(nextButton).toBeDisabled();

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["name\nNike"], "brands.csv", { type: "text/csv" })] },
    });
    expect(nextButton).toBeDisabled();

    fireEvent.click(screen.getByText("Skip duplicates"));
    expect(nextButton).toBeEnabled();
  });

  it("shows required column warning and blocks import when template columns are missing", async () => {
    parseFileMock.mockResolvedValue({
      rows: [{ code: "NIKE" }],
      headers: ["code"],
      error: null,
    });
    render(<BulkImportDialog open onOpenChange={vi.fn()} entityType="brand" onImportComplete={vi.fn()} />);

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["code\nNIKE"], "brands.csv", { type: "text/csv" })] },
    });
    fireEvent.click(screen.getByText("Skip duplicates"));
    fireEvent.click(screen.getByRole("button", { name: "Next: Preview" }));

    expect(await screen.findByText("Required columns missing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 1 row(s)" })).toBeDisabled();
  });

  it("filters blank template rows before showing the preview count", async () => {
    parseFileMock.mockResolvedValue({
      rows: [{ name: "Nike" }, { name: "", code: "", description: "" }, { name: "Adidas" }],
      headers: ["name", "code", "description"],
      error: null,
    });

    render(<BulkImportDialog open onOpenChange={vi.fn()} entityType="brand" onImportComplete={vi.fn()} />);

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["name\nNike"], "brands.csv", { type: "text/csv" })] },
    });
    fireEvent.click(screen.getByText("Skip duplicates"));
    fireEvent.click(screen.getByRole("button", { name: "Next: Preview" }));

    expect(await screen.findByText("2 row(s) found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 2 row(s)" })).toBeEnabled();
  });

  it("renders result metrics after successful import", async () => {
    parseFileMock.mockResolvedValue({
      rows: [{ name: "Nike" }],
      headers: ["name"],
      error: null,
    });
    bulkImportBrandsMock.mockResolvedValue({
      total: 1,
      inserted: 1,
      updated: 0,
      skipped: 0,
      errors: 0,
      rows: [{ row_index: 0, status: "ok", name: "Nike" }],
    });

    render(<BulkImportDialog open onOpenChange={vi.fn()} entityType="brand" onImportComplete={vi.fn()} />);

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["name\nNike"], "brands.csv", { type: "text/csv" })] },
    });
    fireEvent.click(screen.getByText("Update duplicates"));
    fireEvent.click(screen.getByRole("button", { name: "Next: Preview" }));

    await screen.findByRole("button", { name: "Import 1 row(s)" });
    fireEvent.click(screen.getByRole("button", { name: "Import 1 row(s)" }));

    await waitFor(() => {
      expect(screen.getAllByText("Inserted").length).toBeGreaterThan(0);
      expect(screen.getByText("Done")).toBeInTheDocument();
    });
    expect(bulkImportBrandsMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the preview dialog constrained to the viewport", async () => {
    parseFileMock.mockResolvedValue({
      rows: Array.from({ length: 3 }, (_, index) => ({ name: `Brand ${index + 1}` })),
      headers: ["name"],
      error: null,
    });

    render(<BulkImportDialog open onOpenChange={vi.fn()} entityType="brand" onImportComplete={vi.fn()} />);

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["name\nBrand 1"], "brands.csv", { type: "text/csv" })] },
    });
    fireEvent.click(screen.getByText("Skip duplicates"));
    fireEvent.click(screen.getByRole("button", { name: "Next: Preview" }));

    await screen.findByRole("button", { name: "Import 3 row(s)" });

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[92vh]");
    expect(dialog.className).toContain("overflow-hidden");
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
  });

  it("uses a pinned scroll area for the preview table so the horizontal scrollbar stays visible", async () => {
    parseFileMock.mockResolvedValue({
      rows: Array.from({ length: 20 }, (_, index) => ({
        name: `Product ${index + 1}`,
        sku: `SKU-${index + 1}`,
        barcode: `BARCODE-${index + 1}`,
        category_name: "Category",
        brand_name: "Brand",
        unit_price: "100.00",
        cost_price: "80.00",
        initial_stock_quantity: "10",
      })),
      headers: [
        "name",
        "sku",
        "barcode",
        "category_name",
        "brand_name",
        "unit_price",
        "cost_price",
        "initial_stock_quantity",
      ],
      error: null,
    });

    render(<BulkImportDialog open onOpenChange={vi.fn()} entityType="product" onImportComplete={vi.fn()} />);

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["name\nProduct 1"], "products.csv", { type: "text/csv" })] },
    });
    fireEvent.click(screen.getByText("Skip duplicates"));
    fireEvent.click(screen.getByRole("button", { name: "Next: Preview" }));

    await screen.findByRole("button", { name: "Import 20 row(s)" });

    const previewScroller = screen.getByTestId("bulk-import-preview-table-scroll");
    expect(screen.getByTestId("bulk-import-body").className).toContain("overflow-hidden");
    expect(previewScroller.className).toContain("flex-1");
    expect(previewScroller.className).toContain("overflow-hidden");
    expect(screen.getByTestId("bulk-import-preview-table-viewport").className).toContain("min-w-max");
  });
});
