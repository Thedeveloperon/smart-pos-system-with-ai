import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OpeningCashDialog from "./OpeningCashDialog";
import type { CashSession } from "./types";

describe("OpeningCashDialog", () => {
  it("keeps non-essential informational text out of the confirm popup", async () => {
    const previousSession: CashSession = {
      id: "session-1",
      cashierName: "Cashier A",
      shiftNumber: 2,
      openedAt: new Date("2026-04-06T08:00:00.000Z"),
      closedAt: new Date("2026-04-06T17:00:00.000Z"),
      opening: {
        counts: [{ denomination: 500, quantity: 1 }],
        total: 500,
        submittedBy: "Cashier A",
        submittedAt: new Date("2026-04-06T08:00:00.000Z"),
      },
      closing: {
        counts: [{ denomination: 500, quantity: 1 }],
        total: 500,
        submittedBy: "Cashier A",
        submittedAt: new Date("2026-04-06T17:00:00.000Z"),
      },
      expectedCash: 500,
      difference: 0,
      status: "closed",
      auditLog: [],
      cashSalesTotal: 5000,
      drawer: {
        counts: [{ denomination: 500, quantity: 1 }],
        total: 500,
      },
    };

    render(
      <OpeningCashDialog
        open
        cashierName="Cashier B"
        initialCounts={[{ denomination: 500, quantity: 1 }]}
        previousSession={previousSession}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Prefilled from previous shift")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Proceed - Rs. 500" }));

    expect(await screen.findByText("Confirm Opening Cash")).toBeInTheDocument();
    expect(screen.getByText("Opening Cash Amount")).toBeInTheDocument();
    expect(
      screen.queryByText("Prefilled from the previous closing cash count. You can edit the notes and coins before starting the new shift."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Once confirmed, the opening cash cannot be modified without manager approval. Please ensure the count is accurate.",
      ),
    ).not.toBeInTheDocument();
  });
});

