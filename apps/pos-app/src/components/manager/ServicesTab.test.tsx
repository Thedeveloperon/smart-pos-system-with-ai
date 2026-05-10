import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import ServicesTab from "./ServicesTab";
import {
  deleteService,
  fetchServices,
  updateService,
  type Service,
} from "@/lib/api";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/manager/ServiceManagementDialog", () => ({
  default: () => null,
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    deleteService: vi.fn(),
    fetchServices: vi.fn(),
    updateService: vi.fn(),
  };
});

const activeService: Service = {
  id: "service-1",
  name: "Chair Cleaning",
  sku: "SRV-001",
  price: 1200,
  description: "Fabric chair cleaning",
  category_id: "category-1",
  category_name: "Cleaning",
  duration_minutes: 30,
  is_active: true,
};

const inactiveService: Service = {
  ...activeService,
  is_active: false,
};

describe("ServicesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a service visible after deactivation and marks it inactive", async () => {
    vi.mocked(fetchServices).mockResolvedValue([activeService]);

    render(<ServicesTab />);

    await waitFor(() => {
      expect(fetchServices).toHaveBeenCalledWith(true);
    });

    expect(await screen.findByText("Chair Cleaning")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() => {
      expect(deleteService).toHaveBeenCalledWith("service-1");
    });

    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Service deactivated.");
  });

  it("reactivates an inactive service from the manager list", async () => {
    vi.mocked(fetchServices).mockResolvedValue([inactiveService]);
    vi.mocked(updateService).mockResolvedValue(activeService);

    render(<ServicesTab />);

    await waitFor(() => {
      expect(fetchServices).toHaveBeenCalledWith(true);
    });

    expect(await screen.findByText("Chair Cleaning")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => {
      expect(updateService).toHaveBeenCalledWith("service-1", { is_active: true });
    });

    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Service activated.");
  });
});
