import { render, screen } from "@testing-library/react";
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
      onNewItem={vi.fn()}
      onImportSupplierBill={vi.fn()}
      onAiInsights={vi.fn()}
      onSignOut={vi.fn()}
      aiCredits={120}
      {...overrides}
    />,
  );
}

describe("HeaderBar AI credit badge", () => {
  it("shows low-credit warning badges and top-up link", () => {
    renderHeaderBar({
      aiCredits: 8,
      isAiCreditLow: true,
      cloudPortalUrl: "https://portal.smartpos.test",
    });

    expect(screen.getByText("!")).toHaveClass("bg-amber-500");

    const topUpLink = screen.getByRole("link", { name: "Top Up" });
    expect(topUpLink).toHaveAttribute("href", "https://portal.smartpos.test/en/account");
  });

  it("keeps badges green and hides top-up link when credits are healthy", () => {
    renderHeaderBar({
      aiCredits: 120,
      isAiCreditLow: false,
      cloudPortalUrl: "https://portal.smartpos.test",
    });

    const numericBadges = screen.getAllByText("120");
    expect(numericBadges[0]).toHaveClass("bg-emerald-500");
    expect(screen.queryByText("!")).not.toBeInTheDocument();
    expect(screen.queryByText("Low")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Top Up" })).not.toBeInTheDocument();
  });
});
