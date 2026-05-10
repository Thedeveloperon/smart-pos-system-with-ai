import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import ServiceManagementDialog from "./ServiceManagementDialog";
import { createService, fetchCategories } from "@/lib/api";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    createService: vi.fn(),
    fetchCategories: vi.fn(),
    updateService: vi.fn(),
  };
});

describe("ServiceManagementDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCategories).mockResolvedValue([]);
  });

  it("shows a toast and highlights the name field when save is attempted without a name", async () => {
    render(
      <ServiceManagementDialog
        open
        service={null}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchCategories).toHaveBeenCalledWith(true);
    });

    const nameInput = screen.getByRole("textbox", { name: "Name" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createService).not.toHaveBeenCalled();
      expect(nameInput).toHaveAttribute("aria-invalid", "true");
    });

    expect(nameInput).toHaveClass("border-destructive");
    expect(screen.getByText("Service name is required.")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Service name is required.");
  });

  it("shows a toast and highlights the price field when save is attempted with a zero price", async () => {
    render(
      <ServiceManagementDialog
        open
        service={null}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchCategories).toHaveBeenCalledWith(true);
    });

    const nameInput = screen.getByRole("textbox", { name: "Name" });
    const priceInput = screen.getByRole("textbox", { name: "Default Price" });

    fireEvent.change(nameInput, { target: { value: "Service - 02" } });
    fireEvent.change(priceInput, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createService).not.toHaveBeenCalled();
      expect(priceInput).toHaveAttribute("aria-invalid", "true");
    });

    expect(priceInput).toHaveClass("border-destructive");
    expect(screen.getByText("Service price must be greater than 0.")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Service price must be greater than 0.");
  });

  it("shows a toast and highlights the price field when save is attempted with a non-numeric price", async () => {
    render(
      <ServiceManagementDialog
        open
        service={null}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchCategories).toHaveBeenCalledWith(true);
    });

    const nameInput = screen.getByRole("textbox", { name: "Name" });
    const priceInput = screen.getByRole("textbox", { name: "Default Price" });

    fireEvent.change(nameInput, { target: { value: "Service - 03" } });
    fireEvent.change(priceInput, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createService).not.toHaveBeenCalled();
      expect(priceInput).toHaveAttribute("aria-invalid", "true");
    });

    expect(priceInput).toHaveClass("border-destructive");
    expect(screen.getByText("Enter a valid service price.")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Enter a valid service price.");
  });

  it("shows a toast and highlights the duration field when save is attempted with a non-integer duration", async () => {
    render(
      <ServiceManagementDialog
        open
        service={null}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchCategories).toHaveBeenCalledWith(true);
    });

    const nameInput = screen.getByRole("textbox", { name: "Name" });
    const priceInput = screen.getByRole("textbox", { name: "Default Price" });
    const durationInput = screen.getByRole("textbox", { name: "Duration (minutes)" });

    fireEvent.change(nameInput, { target: { value: "Service - 04" } });
    fireEvent.change(priceInput, { target: { value: "1000" } });
    fireEvent.change(durationInput, { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createService).not.toHaveBeenCalled();
      expect(durationInput).toHaveAttribute("aria-invalid", "true");
    });

    expect(durationInput).toHaveClass("border-destructive");
    expect(screen.getByText("Service duration must be a whole number greater than 0.")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("Service duration must be a whole number greater than 0.");
  });
});
