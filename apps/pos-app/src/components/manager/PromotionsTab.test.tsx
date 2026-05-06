import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PromotionsTab from "./PromotionsTab";
import {
  deactivatePromotion,
  fetchCategories,
  fetchProductCatalogItems,
  fetchPromotions,
} from "@/lib/api";

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
    createPromotion: vi.fn(),
    deactivatePromotion: vi.fn(),
    fetchCategories: vi.fn(),
    fetchProductCatalogItems: vi.fn(),
    fetchPromotions: vi.fn(),
    updatePromotion: vi.fn(),
  };
});

const now = Date.now();
const oneDay = 24 * 60 * 60 * 1000;

const promotions = [
  {
    id: "promo-1",
    name: "All Active",
    description: null,
    scope: "all",
    category_id: null,
    product_id: null,
    value_type: "percent",
    value: 10,
    starts_at_utc: new Date(now - oneDay).toISOString(),
    ends_at_utc: new Date(now + oneDay).toISOString(),
    is_active: true,
  },
  {
    id: "promo-2",
    name: "Product Active",
    description: null,
    scope: "product",
    category_id: null,
    product_id: "prod-1",
    value_type: "fixed",
    value: 100,
    starts_at_utc: new Date(now - oneDay).toISOString(),
    ends_at_utc: new Date(now + oneDay).toISOString(),
    is_active: true,
  },
  {
    id: "promo-3",
    name: "Category Expired",
    description: null,
    scope: "category",
    category_id: "cat-1",
    product_id: null,
    value_type: "percent",
    value: 5,
    starts_at_utc: new Date(now - 3 * oneDay).toISOString(),
    ends_at_utc: new Date(now - oneDay).toISOString(),
    is_active: true,
  },
  {
    id: "promo-4",
    name: "Inactive Future",
    description: null,
    scope: "all",
    category_id: null,
    product_id: null,
    value_type: "percent",
    value: 8,
    starts_at_utc: new Date(now - oneDay).toISOString(),
    ends_at_utc: new Date(now + 10 * oneDay).toISOString(),
    is_active: false,
  },
] as const;

async function pickSelect(label: string, option: string) {
  const section = screen.getAllByText(label)[0]?.closest("div");
  if (!section) {
    throw new Error(`Missing select section for ${label}`);
  }

  const trigger = within(section).getByRole("combobox");
  fireEvent.mouseDown(trigger);
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("PromotionsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchPromotions).mockResolvedValue(promotions as never);
    vi.mocked(fetchCategories).mockResolvedValue([{ category_id: "cat-1", name: "Groceries" }] as never);
    vi.mocked(fetchProductCatalogItems).mockResolvedValue([{ id: "prod-1", name: "Rice 5kg" }] as never);
    vi.mocked(deactivatePromotion).mockResolvedValue(undefined as never);
  });

  it("filters promotions by status and scope", async () => {
    render(<PromotionsTab />);
    await screen.findByText("All Active");

    await pickSelect("Status", "Active");
    expect(screen.getByText("All Active")).toBeInTheDocument();
    expect(screen.getByText("Product Active")).toBeInTheDocument();
    expect(screen.queryByText("Category Expired")).not.toBeInTheDocument();
    expect(screen.queryByText("Inactive Future")).not.toBeInTheDocument();

    await pickSelect("Scope", "Product");
    expect(screen.queryByText("All Active")).not.toBeInTheDocument();
    expect(screen.getByText("Product Active")).toBeInTheDocument();
  });

  it("requires confirmation before deactivation", async () => {
    render(<PromotionsTab />);
    await screen.findByText("All Active");

    fireEvent.click(screen.getByRole("button", { name: "Deactivate promotion All Active" }));
    expect(screen.getByText('Deactivate "All Active" now? This takes effect immediately in checkout pricing.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(deactivatePromotion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Deactivate promotion All Active" }));
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => {
      expect(deactivatePromotion).toHaveBeenCalledWith("promo-1");
    });
  });
});
