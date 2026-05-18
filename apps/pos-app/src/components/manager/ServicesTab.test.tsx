import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServicesTab from "./ServicesTab";
import { fetchCategories, fetchServices, updateService } from "@/lib/api";

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
    fetchServices: vi.fn(),
    updateService: vi.fn(),
  };
});

describe("ServicesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(fetchCategories).mockResolvedValue([] as never);
    vi.mocked(fetchServices).mockResolvedValue([
      {
        id: "service-1",
        name: "Delivery",
        sku: "DEL-001",
        price: 250,
        description: "",
        category_id: null,
        category_name: null,
        duration_minutes: null,
        is_active: true,
      },
      {
        id: "service-2",
        name: "Gift Wrap",
        sku: "GIFT-001",
        price: 100,
        description: "",
        category_id: null,
        category_name: null,
        duration_minutes: null,
        is_active: false,
      },
    ] as never);

    vi.mocked(updateService).mockImplementation(async (serviceId, payload) => ({
      id: serviceId,
      name: serviceId === "service-1" ? "Delivery" : "Gift Wrap",
      sku: serviceId === "service-1" ? "DEL-001" : "GIFT-001",
      price: serviceId === "service-1" ? 250 : 100,
      description: "",
      category_id: null,
      category_name: null,
      duration_minutes: null,
      is_active: payload.is_active ?? true,
    }) as never);
  });

  it("loads inactive services and toggles deactivation instead of deleting them", async () => {
    render(<ServicesTab />);

    expect(await screen.findByText("Delivery")).toBeInTheDocument();
    expect(vi.mocked(fetchServices)).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByText("Inactive only"));

    expect(screen.getByText("Gift Wrap")).toBeInTheDocument();
    expect(screen.getAllByText("Inactive")).toHaveLength(1);

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByText("Active only"));

    fireEvent.click(
      screen.getByRole("button", { name: "Deactivate" }),
    );

    expect(vi.mocked(updateService)).toHaveBeenCalledWith("service-1", {
      is_active: false,
    });
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByText("Inactive only"));
    expect(screen.getByText("Delivery")).toBeInTheDocument();
    expect(screen.getByText("Gift Wrap")).toBeInTheDocument();
    expect(screen.getAllByText("Inactive")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Activate" })).toHaveLength(2);
  });
});
