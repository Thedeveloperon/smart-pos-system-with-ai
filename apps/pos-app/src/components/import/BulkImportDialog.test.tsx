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
});
