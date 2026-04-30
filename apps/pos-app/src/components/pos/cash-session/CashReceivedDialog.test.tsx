import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CashReceivedDialog from "./CashReceivedDialog";

vi.mock("@/lib/sound", () => ({
  playCashCountSound: vi.fn().mockResolvedValue(undefined),
  primeConfirmationSound: vi.fn().mockResolvedValue(undefined),
}));

describe("CashReceivedDialog", () => {
  it("shows a drawer-aware suggestion and auto-applies the top-up", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const onTotalChange = vi.fn();

    render(
      <CashReceivedDialog
        open
        expectedCash={60}
        availableCounts={[
          { denomination: 50, quantity: 1 },
          { denomination: 20, quantity: 0 },
          { denomination: 10, quantity: 1 },
          { denomination: 5, quantity: 0 },
          { denomination: 2, quantity: 0 },
          { denomination: 1, quantity: 0 },
        ]}
        onClose={onClose}
        onConfirm={onConfirm}
        onTotalChange={onTotalChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("100 quantity"), { target: { value: "1" } });

    expect(await screen.findByText(/Auto-added Rs\. 10/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Proceed - Rs. 110" })).toBeInTheDocument();

    await waitFor(() => {
      expect(onTotalChange).toHaveBeenLastCalledWith(110);
    });
  });
});
