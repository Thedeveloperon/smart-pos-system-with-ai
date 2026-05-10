import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SuppliersTab from "./SuppliersTab";
import { createSupplier, fetchBrands, fetchSuppliers, updateSupplier } from "@/lib/api";

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

  it("shows the extended-mode email field and blocks invalid email values", async () => {
    render(<SuppliersTab />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Add Sales Rep" }),
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Extended Mode" }));

    const emailInput = within(dialog).getByLabelText("Email address");
    fireEvent.change(emailInput, { target: { value: "invalid-email" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText("Enter a valid email address or leave it empty."),
    ).toBeInTheDocument();
    expect(createSupplier).not.toHaveBeenCalled();
  });

  it("filters visible sales reps as the user types in the search field", async () => {
    vi.mocked(fetchSuppliers).mockResolvedValue([
      {
        id: "supplier-1",
        supplier_id: "supplier-1",
        name: "Ashan Silva",
        phone: "0711000017",
        email: "",
        companyName: "",
        company_name: "Singer Sri Lanka PLC",
        companyPhone: "",
        company_phone: "",
        address: "",
        brands: [{ brand_id: "brand-1", name: "Panasonic", code: "PANA" }],
        isActive: true,
        is_active: true,
        linkedProductCount: 2,
        linked_product_count: 2,
        can_delete: true,
        delete_block_reason: null,
        createdAt: "2026-05-08T00:00:00.000Z",
        created_at: "2026-05-08T00:00:00.000Z",
        updatedAt: "2026-05-08T00:00:00.000Z",
        updated_at: "2026-05-08T00:00:00.000Z",
      },
      {
        id: "supplier-2",
        supplier_id: "supplier-2",
        name: "Chathura Silva",
        phone: "0711000003",
        email: "",
        companyName: "",
        company_name: "Fonterra Brands Lanka (Private) Limited",
        companyPhone: "",
        company_phone: "",
        address: "",
        brands: [{ brand_id: "brand-2", name: "Anchor", code: "ANCH" }],
        isActive: true,
        is_active: true,
        linkedProductCount: 0,
        linked_product_count: 0,
        can_delete: true,
        delete_block_reason: null,
        createdAt: "2026-05-08T00:00:00.000Z",
        created_at: "2026-05-08T00:00:00.000Z",
        updatedAt: "2026-05-08T00:00:00.000Z",
        updated_at: "2026-05-08T00:00:00.000Z",
      },
    ] as never);

    render(<SuppliersTab />);

    expect(await screen.findByText("Ashan Silva")).toBeInTheDocument();
    expect(screen.getByText("Chathura Silva")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search sales reps" }), {
      target: { value: "anchor" },
    });

    expect(screen.getByText("Chathura Silva")).toBeInTheDocument();
    expect(screen.queryByText("Ashan Silva")).not.toBeInTheDocument();
    expect(screen.getByText("Fonterra Brands Lanka (Private) Limited")).toBeInTheDocument();
  });

  it("updates the row to activate and enable delete after deactivation without waiting for a refetch", async () => {
    const activeSupplier = {
      id: "supplier-1",
      supplier_id: "supplier-1",
      name: "Ashan Silva",
      phone: "",
      email: "",
      companyName: "",
      company_name: "",
      companyPhone: "",
      company_phone: "",
      address: "",
      brands: [],
      isActive: true,
      is_active: true,
      linkedProductCount: 0,
      linked_product_count: 0,
      can_delete: false,
      delete_block_reason: "Deactivate the supplier before deleting.",
      createdAt: "2026-05-08T00:00:00.000Z",
      created_at: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
      updated_at: "2026-05-08T00:00:00.000Z",
    };
    const inactiveSupplier = {
      ...activeSupplier,
      isActive: false,
      is_active: false,
      can_delete: true,
      delete_block_reason: null,
    };

    vi.mocked(fetchSuppliers).mockResolvedValue([activeSupplier] as never);
    vi.mocked(updateSupplier).mockResolvedValue(inactiveSupplier as never);

    render(<SuppliersTab />);

    const row = (await screen.findByText("Ashan Silva")).closest("tr");
    expect(row).not.toBeNull();

    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Deactivate" }));

    const confirmationDialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirmationDialog).getByRole("button", { name: "Deactivate" }));

    expect(updateSupplier).toHaveBeenCalledWith(
      "supplier-1",
      expect.objectContaining({ is_active: false }),
    );
    expect(await screen.findByRole("button", { name: "Activate" })).toBeInTheDocument();

    const updatedRow = screen.getByText("Ashan Silva").closest("tr");
    expect(updatedRow).not.toBeNull();
    expect(within(updatedRow as HTMLElement).getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  it("keeps activation available while blocking delete for suppliers with purchase history", async () => {
    const inactiveSupplier = {
      id: "supplier-2",
      supplier_id: "supplier-2",
      name: "Nadeesha Perera",
      phone: "",
      email: "",
      companyName: "",
      company_name: "",
      companyPhone: "",
      company_phone: "",
      address: "",
      brands: [],
      isActive: false,
      is_active: false,
      linkedProductCount: 0,
      linked_product_count: 0,
      can_delete: false,
      delete_block_reason: "This supplier has purchase history and cannot be permanently deleted.",
      createdAt: "2026-05-08T00:00:00.000Z",
      created_at: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
      updated_at: "2026-05-08T00:00:00.000Z",
    };

    vi.mocked(fetchSuppliers).mockResolvedValue([inactiveSupplier] as never);

    render(<SuppliersTab />);

    const row = (await screen.findByText("Nadeesha Perera")).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByRole("button", { name: "Activate" })).toBeInTheDocument();
    expect(within(row as HTMLElement).getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(
      within(row as HTMLElement).getByText(
        "This supplier has purchase history and cannot be permanently deleted.",
      ),
    ).toBeInTheDocument();
  });
});
