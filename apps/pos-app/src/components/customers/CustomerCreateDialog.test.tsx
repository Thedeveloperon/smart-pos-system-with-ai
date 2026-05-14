import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CustomerCreateDialog from "./CustomerCreateDialog";

describe("CustomerCreateDialog", () => {
  it("submits the ID number when creating a customer", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <CustomerCreateDialog
        open
        onOpenChange={vi.fn()}
        onCreate={onCreate}
      />
    );

    const nameInput = screen.getByText("Full name *").parentElement?.querySelector("input");
    const idNumberInput = screen.getByText("ID number").parentElement?.querySelector("input");

    if (!(nameInput instanceof HTMLInputElement) || !(idNumberInput instanceof HTMLInputElement)) {
      throw new Error("Customer form inputs were not rendered.");
    }

    fireEvent.change(nameInput, { target: { value: "Gamma Stores" } });
    fireEvent.change(idNumberInput, { target: { value: "NIC-778899V" } });
    fireEvent.click(screen.getByRole("button", { name: "Create customer" }));

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Gamma Stores",
          idNumber: "NIC-778899V",
        })
      )
    );
  });
});
