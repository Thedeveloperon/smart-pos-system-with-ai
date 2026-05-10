import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import ServicesTab from "./ServicesTab";
import { createService, fetchCategories, fetchServices } from "@/lib/api";

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
    deleteService: vi.fn(),
    fetchCategories: vi.fn(),
    fetchServices: vi.fn(),
    updateService: vi.fn(),
  };
});

describe("ServicesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchServices).mockResolvedValue([]);
    vi.mocked(fetchCategories).mockResolvedValue([]);
  });

  it("shows a toast and highlights the price field when save is attempted with a negative price", async () => {
    render(<ServicesTab />);

    await waitFor(() => {
      expect(fetchServices).toHaveBeenCalled();
      expect(fetchCategories).toHaveBeenCalledWith(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Service" }));

    const nameInput = await screen.findByRole("textbox", { name: "Name" });
    const priceInput = screen.getByRole("textbox", { name: "Price" });

    fireEvent.change(nameInput, { target: { value: "Service - 03" } });
    fireEvent.change(priceInput, { target: { value: "-100" } });
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
    render(<ServicesTab />);

    await waitFor(() => {
      expect(fetchServices).toHaveBeenCalled();
      expect(fetchCategories).toHaveBeenCalledWith(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Service" }));

    const nameInput = await screen.findByRole("textbox", { name: "Name" });
    const priceInput = screen.getByRole("textbox", { name: "Price" });

    fireEvent.change(nameInput, { target: { value: "Service - 04" } });
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
    render(<ServicesTab />);

    await waitFor(() => {
      expect(fetchServices).toHaveBeenCalled();
      expect(fetchCategories).toHaveBeenCalledWith(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Service" }));

    const nameInput = await screen.findByRole("textbox", { name: "Name" });
    const priceInput = screen.getByRole("textbox", { name: "Price" });
    const durationInput = screen.getByRole("textbox", { name: "Duration (minutes)" });

    fireEvent.change(nameInput, { target: { value: "Service - 05" } });
    fireEvent.change(priceInput, { target: { value: "1000" } });
    fireEvent.change(durationInput, { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createService).not.toHaveBeenCalled();
      expect(durationInput).toHaveAttribute("aria-invalid", "true");
    });

    expect(durationInput).toHaveClass("border-destructive");
    expect(
      screen.getByText("Service duration must be a whole number greater than 0."),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "Service duration must be a whole number greater than 0.",
    );
  });

  it("shows a toast and highlights the duration field when save is attempted with a negative duration", async () => {
    render(<ServicesTab />);

    await waitFor(() => {
      expect(fetchServices).toHaveBeenCalled();
      expect(fetchCategories).toHaveBeenCalledWith(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Service" }));

    const nameInput = await screen.findByRole("textbox", { name: "Name" });
    const priceInput = screen.getByRole("textbox", { name: "Price" });
    const durationInput = screen.getByRole("textbox", { name: "Duration (minutes)" });

    fireEvent.change(nameInput, { target: { value: "Service - 06" } });
    fireEvent.change(priceInput, { target: { value: "1000" } });
    fireEvent.change(durationInput, { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createService).not.toHaveBeenCalled();
      expect(durationInput).toHaveAttribute("aria-invalid", "true");
    });

    expect(durationInput).toHaveClass("border-destructive");
    expect(
      screen.getByText("Service duration must be a whole number greater than 0."),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "Service duration must be a whole number greater than 0.",
    );
  });
});
