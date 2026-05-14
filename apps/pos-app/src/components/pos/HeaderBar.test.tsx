import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import HeaderBar from "./HeaderBar";

function renderHeaderBar(overrides: Partial<ComponentProps<typeof HeaderBar>> = {}) {
  return render(
    <HeaderBar
      cashierName="Manager"
      heldBillsCount={0}
      onHeldBills={vi.fn()}
      onTodaySales={vi.fn()}
      onImportSupplierBill={vi.fn()}
      onInventoryManager={vi.fn()}
      onSignOut={vi.fn()}
      {...overrides}
    />,
  );
}

describe("HeaderBar", () => {
  it("does not render AI insights or sync actions in the POS navigation", () => {
    renderHeaderBar({
      onAiInsights: vi.fn(),
      onSyncOffline: vi.fn(),
      onEndShift: vi.fn(),
      hasActiveSession: true,
    });

    expect(screen.queryByRole("button", { name: "AI Insights" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End Shift" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.queryByText("AI Insights")).not.toBeInTheDocument();
    expect(screen.queryByText("Sync")).not.toBeInTheDocument();
    expect(screen.queryByText("End Shift")).not.toBeInTheDocument();
  });

  it("requires confirmation before signing out", async () => {
    const onSignOut = vi.fn();

    renderHeaderBar({
      onSignOut,
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(onSignOut).not.toHaveBeenCalled();
    expect(await screen.findByText("Are you sure you want to sign out of this session?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSignOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("opens the inventory manager action", () => {
    const onInventoryManager = vi.fn();

    renderHeaderBar({
      onInventoryManager,
    });

    fireEvent.click(screen.getByRole("button", { name: "POS Management" }));

    expect(onInventoryManager).toHaveBeenCalledTimes(1);
  });

  it("does not render the new item action in the POS navigation", () => {
    renderHeaderBar();

    expect(screen.queryByRole("button", { name: "New Item" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.queryByText("New Item")).not.toBeInTheDocument();
  });
});
