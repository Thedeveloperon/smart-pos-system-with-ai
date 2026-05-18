import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ServiceManagementDialog from "./ServiceManagementDialog";
import { createService } from "@/lib/api";
import { toast } from "sonner";

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
    createService: vi.fn(),
    fetchCategories: vi.fn().mockResolvedValue([]),
    updateService: vi.fn(),
  };
});

describe("ServiceManagementDialog", () => {
  it("blocks saving a new service when the price is zero", async () => {
    const onSaved = vi.fn();

    render(
      <ServiceManagementDialog
        open
        service={null}
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Delivery" },
    });
    fireEvent.change(screen.getByLabelText("Default Price"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "Service price must be a valid number greater than zero.",
      ),
    ).toBeInTheDocument();
    expect(vi.mocked(createService)).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("blocks saving a new service when the price is negative", async () => {
    const onSaved = vi.fn();

    render(
      <ServiceManagementDialog
        open
        service={null}
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Delivery" },
    });
    fireEvent.change(screen.getByLabelText("Default Price"), {
      target: { value: "-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "Service price must be a valid number greater than zero.",
      ),
    ).toBeInTheDocument();
    expect(vi.mocked(createService)).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("blocks saving a new service when the price contains non-numeric characters", async () => {
    const onSaved = vi.fn();

    render(
      <ServiceManagementDialog
        open
        service={null}
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Delivery" },
    });
    const priceInput = screen.getByLabelText("Default Price");
    fireEvent.change(priceInput, {
      target: { value: "12abc" },
    });

    expect(priceInput).toHaveValue("");
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "Service price must be a valid number greater than zero.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "Service price must be a valid number greater than zero.",
      ),
    ).toBeInTheDocument();
    expect(vi.mocked(createService)).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("blocks saving a new service when the duration is non-integer", async () => {
    const onSaved = vi.fn();

    render(
      <ServiceManagementDialog
        open
        service={null}
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Delivery" },
    });
    fireEvent.change(screen.getByLabelText("Default Price"), {
      target: { value: "25" },
    });
    const durationInput = screen.getByLabelText("Duration (minutes)");
    fireEvent.change(durationInput, {
      target: { value: "1.5" },
    });

    expect(durationInput).toHaveValue("");
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "Duration must be a positive whole number.",
    );
    expect(
      await screen.findByText("Duration must be a positive whole number."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(vi.mocked(createService)).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("blocks saving a new service when the duration is negative", async () => {
    const onSaved = vi.fn();

    render(
      <ServiceManagementDialog
        open
        service={null}
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Delivery" },
    });
    fireEvent.change(screen.getByLabelText("Default Price"), {
      target: { value: "25" },
    });
    const durationInput = screen.getByLabelText("Duration (minutes)");
    fireEvent.change(durationInput, {
      target: { value: "-5" },
    });

    expect(durationInput).toHaveValue("");
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "Duration must be a positive whole number.",
    );
    expect(
      await screen.findByText("Duration must be a positive whole number."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(vi.mocked(createService)).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
