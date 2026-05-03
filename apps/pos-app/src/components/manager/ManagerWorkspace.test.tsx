import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ManagerWorkspace from "./ManagerWorkspace";

vi.mock("@/components/manager/ProductsTab", () => ({
  default: ({ onNavigate }: { onNavigate?: (tab: "catalogue" | "suppliers") => void }) => (
    <button type="button" onClick={() => onNavigate?.("catalogue")}>
      Mock products workspace
    </button>
  ),
}));

vi.mock("@/components/manager/CatalogueTab", () => ({
  default: () => <div>Catalogue panel</div>,
}));

vi.mock("@/components/manager/SuppliersTab", () => ({
  default: () => <div>Suppliers panel</div>,
}));

describe("ManagerWorkspace", () => {
  it("switches the controlled manager tab when products requests navigation", () => {
    render(<ManagerWorkspace />);

    expect(screen.getByRole("tab", { name: "Products" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Mock products workspace")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mock products workspace" }));

    expect(screen.getByRole("tab", { name: "Categories & Brands" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Catalogue panel")).toBeInTheDocument();
  });
});
