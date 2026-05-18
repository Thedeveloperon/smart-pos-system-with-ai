import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SuppliersTab from "./SuppliersTab";
import { createSupplier, fetchBrands, fetchSuppliers, updateSupplierStatus } from "@/lib/api";

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
    updateSupplierStatus: vi.fn(),
  };
});

const activeSupplier = {
  id: "sup-1",
  supplier_id: "sup-1",
  name: "Jane Doe",
  phone: "555-1234",
  email: null,
  company_name: "Acme Corp",
  company_phone: null,
  address: null,
  is_active: true,
  brands: [],
  linked_product_count: 0,
  can_delete: true,
  delete_block_reason: null,
};

describe("SuppliersTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchSuppliers).mockResolvedValue([] as never);
    vi.mocked(fetchBrands).mockResolvedValue([
      { brand_id: "brand-1", name: "Anchor", code: "ANCH" },
      { brand_id: "brand-2", name: "Atlas", code: "ATLA" },
    ] as never);
    vi.mocked(updateSupplierStatus).mockResolvedValue(undefined as never);
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

  it("shows the email field in extended mode and keeps the dialog constrained", async () => {
    render(<SuppliersTab />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Add Sales Rep" }),
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Extended Mode" }),
    );

    expect(within(dialog).getByLabelText("Email")).toBeInTheDocument();
    expect(dialog).toHaveClass("max-h-[90vh]");
    expect(dialog).toHaveClass("overflow-y-auto");
  });

  it("blocks save until the email format is valid", async () => {
    render(<SuppliersTab />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Add Sales Rep" }),
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Extended Mode" }),
    );

    fireEvent.change(within(dialog).getByLabelText("Sales Rep Name"), {
      target: { value: "Test Supplier" },
    });
    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: "invalid-email" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText("Email format is invalid."),
    ).toBeInTheDocument();
    expect(vi.mocked(createSupplier)).not.toHaveBeenCalled();
  });

  it("calls updateSupplierStatus with is_active=false when deactivation is confirmed", async () => {
    vi.mocked(fetchSuppliers).mockResolvedValue([activeSupplier] as never);
    render(<SuppliersTab />);

    fireEvent.click(await screen.findByRole("button", { name: /deactivate/i }));

    expect(screen.getByText(/deactivate "Jane Doe"/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(updateSupplierStatus).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: /deactivate/i }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => {
      expect(updateSupplierStatus).toHaveBeenCalledWith("sup-1", false);
    });
  });
});
