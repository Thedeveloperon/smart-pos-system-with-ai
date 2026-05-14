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

    expect(screen.getByAltText("Sri Lankan Rs. 100 note")).toBeInTheDocument();
    expect(screen.getByAltText("Sri Lankan Rs. 10 coin")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("100 quantity"), { target: { value: "1" } });

    expect(
      await screen.findByText(
        "Cash drawer has no Rs.20 notes available. Please request an additional Rs.10 from the customer. Then you can return Rs.50 as the balance.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Auto-added/i)).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Proceed - Rs. 110" })).toBeInTheDocument();

    await waitFor(() => {
      expect(onTotalChange).toHaveBeenLastCalledWith(110);
    });
  });

  it("keeps the auto-added denomination badge flashing until the counts change", async () => {
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
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("100 quantity"), { target: { value: "1" } });

    const coinRow = screen.getByLabelText("10 quantity").closest("div.grid");
    const coinBadge = coinRow?.querySelector("span[aria-live='polite']") as HTMLElement | null;
    expect(coinBadge?.className).toContain("animate-pulse");

    fireEvent.click(screen.getByLabelText("Increase 10"));
    expect(coinBadge?.className).not.toContain("animate-pulse");
  });
});
