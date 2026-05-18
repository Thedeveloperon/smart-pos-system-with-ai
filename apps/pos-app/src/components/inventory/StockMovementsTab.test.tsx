import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StockMovementsTab from "./StockMovementsTab";

const fetchStockMovementsMock = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    fetchStockMovements: (...args: unknown[]) => fetchStockMovementsMock(...args),
  };
});

describe("StockMovementsTab", () => {
  beforeEach(() => {
    fetchStockMovementsMock.mockReset();
    fetchStockMovementsMock.mockResolvedValue({
      items: [
        {
          id: "movement-1",
          product_id: "product-1",
          product_name: "Rice",
          movement_type: "Adjustment",
          quantity_before: 10,
          quantity_change: 2,
          quantity_after: 12,
          reference_type: "Adjustment",
          reason: "cycle count",
          created_by_user_id: "user-1",
          created_by_username: "Sampath Perera",
          created_at: "2026-05-10T08:24:11.000Z",
        },
      ],
      total: 1,
      page: 1,
      take: 20,
    });
  });

  it("shows the creator display name in movement history", async () => {
    render(<StockMovementsTab />);

    expect(await screen.findByText("Sampath Perera")).toBeInTheDocument();
    expect(screen.queryByText("user-1")).not.toBeInTheDocument();
  });
});
