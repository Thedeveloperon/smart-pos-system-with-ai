import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SuppliersTab from "./SuppliersTab";
import { fetchBrands, fetchSuppliers } from "@/lib/api";

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
    createSupplier: vi.fn(),
    fetchBrands: vi.fn(),
    fetchSuppliers: vi.fn(),
    hardDeleteSupplier: vi.fn(),
    updateSupplier: vi.fn(),
  };
});

describe("SuppliersTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchSuppliers).mockResolvedValue([] as never);
    vi.mocked(fetchBrands).mockResolvedValue([
      { brand_id: "brand-1", name: "Anchor", code: "ANCH" },
      { brand_id: "brand-2", name: "Atlas", code: "ATLA" },
    ] as never);
  });

  it("renders the brand picker list inside the dialog so mouse-wheel scrolling stays available", async () => {
    render(<SuppliersTab />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Add Sales Rep" }),
    );

    const dialog = await screen.findByRole("dialog");
    const brandTrigger = within(dialog).getByRole("button", {
      name: /select one or more brands/i,
    });
    fireEvent.click(brandTrigger);

    expect(await within(dialog).findByText("Anchor")).toBeInTheDocument();
    expect(await within(dialog).findByText("Atlas")).toBeInTheDocument();
  });
});
