import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CustomerCreateDialog from "./CustomerCreateDialog";

function getInput(labelText: string) {
  const input = screen.getByText(labelText).parentElement?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Input for label "${labelText}" was not rendered.`);
  }

  return input;
}

describe("CustomerCreateDialog", () => {
  it("submits the ID number when creating a customer", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(<CustomerCreateDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);

    const nameInput = getInput("Full name *");
    const idNumberInput = getInput("ID number");

    fireEvent.change(nameInput, { target: { value: "Gamma Stores" } });
    fireEvent.change(idNumberInput, { target: { value: "NIC-778899V" } });
    fireEvent.click(screen.getByRole("button", { name: "Create customer" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Gamma Stores",
          idNumber: "NIC-778899V",
        }),
      ),
    );
  });

  it("shows a required error when name is empty", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(<CustomerCreateDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "Create customer" }));

    expect(await screen.findByText("Full name is required.")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows validation error for invalid email", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(<CustomerCreateDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);

    fireEvent.change(getInput("Full name *"), { target: { value: "Gamma Stores" } });
    fireEvent.change(getInput("Email"), { target: { value: "notanemail" } });
    fireEvent.click(screen.getByRole("button", { name: "Create customer" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows validation error for invalid phone", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(<CustomerCreateDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);

    fireEvent.change(getInput("Full name *"), { target: { value: "Gamma Stores" } });
    fireEvent.change(getInput("Phone"), { target: { value: "abc123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create customer" }));

    expect(
      await screen.findByText("Phone number may only contain digits, spaces, +, -, (, )."),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows validation error when date of birth is in the future", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    render(<CustomerCreateDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);

    fireEvent.change(getInput("Full name *"), { target: { value: "Gamma Stores" } });
    fireEvent.change(getInput("Date of birth"), { target: { value: tomorrow } });
    fireEvent.click(screen.getByRole("button", { name: "Create customer" }));

    expect(await screen.findByText("Date of birth cannot be in the future.")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("renders backend error when create fails", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("A customer with this phone number already exists."));

    render(<CustomerCreateDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);

    fireEvent.change(getInput("Full name *"), { target: { value: "Gamma Stores" } });
    fireEvent.change(getInput("Phone"), { target: { value: "+94 11 222 3344" } });
    fireEvent.click(screen.getByRole("button", { name: "Create customer" }));

    expect(
      await screen.findByText("A customer with this phone number already exists."),
    ).toBeInTheDocument();
  });
});
