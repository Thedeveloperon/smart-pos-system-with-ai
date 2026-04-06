import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ProductSuppliersTab } from "./ProductManagementStockTabs";
import { createSupplier, fetchSuppliers, updateSupplier, type SupplierRecord } from "@/lib/api";

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
    fetchSuppliers: vi.fn(),
    createSupplier: vi.fn(),
    updateSupplier: vi.fn(),
  };
});

const initialSupplier: SupplierRecord = {
  id: "supplier-1",
  name: "Metro Beverages Ltd",
  code: "MBL",
  contactPerson: "Nalin Perera",
  phone: "+94 11 234 5678",
  email: "orders@metrobeverages.lk",
  address: "Colombo",
  isActive: true,
  linkedProductCount: 3,
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

const createdSupplier: SupplierRecord = {
  id: "supplier-2",
  name: "Fresh Foods Trading",
  code: "FFT",
  contactPerson: "Kumari Silva",
  phone: "+94 11 333 4444",
  email: "hello@freshfoods.test",
  address: "Gampaha",
  isActive: true,
  linkedProductCount: 0,
  createdAt: "2026-04-05T00:00:00Z",
  updatedAt: "2026-04-05T00:00:00Z",
};

describe("ProductSuppliersTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads suppliers from the backend and persists new suppliers after save", async () => {
    vi.mocked(fetchSuppliers)
      .mockResolvedValueOnce([initialSupplier])
      .mockResolvedValueOnce([initialSupplier, createdSupplier]);
    vi.mocked(createSupplier).mockResolvedValue(createdSupplier);

    render(<ProductSuppliersTab />);

    expect(await screen.findByText("Metro Beverages Ltd")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add Supplier" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Fresh Foods Trading" } });
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "FFT" } });
    fireEvent.change(screen.getByLabelText("Contact Person"), { target: { value: "Kumari Silva" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+94 11 333 4444" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "hello@freshfoods.test" } });
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "Gampaha" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createSupplier).toHaveBeenCalledWith({
        name: "Fresh Foods Trading",
        code: "FFT",
        contactPerson: "Kumari Silva",
        phone: "+94 11 333 4444",
        email: "hello@freshfoods.test",
        address: "Gampaha",
        isActive: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Fresh Foods Trading")).toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith("Supplier created.");
    expect(fetchSuppliers).toHaveBeenCalledTimes(2);
  });

  it("updates an existing supplier and reloads the list", async () => {
    const updatedSupplier: SupplierRecord = {
      ...initialSupplier,
      phone: "+94 11 999 8888",
      updatedAt: "2026-04-05T01:00:00Z",
    };

    vi.mocked(fetchSuppliers)
      .mockResolvedValueOnce([initialSupplier])
      .mockResolvedValueOnce([updatedSupplier]);
    vi.mocked(updateSupplier).mockResolvedValue(updatedSupplier);

    render(<ProductSuppliersTab />);

    expect(await screen.findByText("Metro Beverages Ltd")).toBeInTheDocument();
    const row = screen.getByText("Metro Beverages Ltd").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLTableRowElement).getByRole("button"));

    await screen.findByText("Edit Supplier");
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+94 11 999 8888" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateSupplier).toHaveBeenCalledWith("supplier-1", expect.objectContaining({ phone: "+94 11 999 8888" }));
    });
    await waitFor(() => {
      expect(screen.getByText("+94 11 999 8888")).toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith("Supplier updated.");
  });
});
