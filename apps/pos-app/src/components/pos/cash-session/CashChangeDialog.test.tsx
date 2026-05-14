import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CashChangeDialog from "./CashChangeDialog";

describe("CashChangeDialog", () => {
  it("renders the refreshed payout summary with denomination artwork", () => {
    render(
      <CashChangeDialog
        open
        changeAmount={320}
        availableCounts={[
          { denomination: 100, quantity: 3 },
          { denomination: 20, quantity: 1 },
        ]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Selected payout")).toBeInTheDocument();
    expect(
      screen.getByText("This breakdown uses the available drawer notes and coins."),
    ).toBeInTheDocument();
    expect(screen.getByAltText("Sri Lankan Rs. 100 note")).toBeInTheDocument();
    expect(screen.getByAltText("Sri Lankan Rs. 20 note")).toBeInTheDocument();
    expect(screen.getByText("No coins required.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Proceed - Rs. 320" })).toBeInTheDocument();
  });

  it("shows the visual denomination counter when payout editing is required", () => {
    render(
      <CashChangeDialog
        open
        changeAmount={40}
        availableCounts={[
          { denomination: 50, quantity: 1 },
          { denomination: 10, quantity: 1 },
        ]}
        allowCustomPayout
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("50 quantity")).toBeInTheDocument();
    expect(screen.getByLabelText("10 quantity")).toBeInTheDocument();
    expect(screen.getByText("Selected total: Rs. 10")).toBeInTheDocument();
    expect(
      screen.getByText(/Adjust the counts until the selected total matches the balance to return\./i),
    ).toBeInTheDocument();
  });

  it("switches to the editable visual counter when custom payout is enabled", () => {
    render(
      <CashChangeDialog
        open
        changeAmount={50}
        availableCounts={[
          { denomination: 50, quantity: 1 },
        ]}
        allowCustomPayout
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Enable custom payout" }));

    expect(screen.getByLabelText("50 quantity")).toBeInTheDocument();
    expect(
      screen.getByText("The selected notes and coins match the balance to return."),
    ).toBeInTheDocument();
  });
});
