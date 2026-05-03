import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StocktakeTab from "./StocktakeTab";
import {
  completeStocktakeSession,
  createStocktakeSession,
  deleteStocktakeSession,
  fetchStocktakeSessions,
  getStocktakeSession,
  revertStocktakeSession,
  startStocktakeSession,
  updateStocktakeItem,
  type StocktakeItem,
  type StocktakeSession,
} from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    completeStocktakeSession: vi.fn(),
    createStocktakeSession: vi.fn(),
    deleteStocktakeSession: vi.fn(),
    fetchStocktakeSessions: vi.fn(),
    getStocktakeSession: vi.fn(),
    revertStocktakeSession: vi.fn(),
    startStocktakeSession: vi.fn(),
    updateStocktakeItem: vi.fn(),
  };
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("StocktakeTab", () => {
  const inProgressSession: StocktakeSession = {
    id: "session-1",
    store_id: "store-1",
    status: "InProgress",
    started_at: "2026-05-03T06:00:00.000Z",
    completed_at: undefined,
    created_by_user_id: "owner-1",
    item_count: 1,
    variance_count: 0,
  };

  const completedSession: StocktakeSession = {
    ...inProgressSession,
    status: "Completed",
    completed_at: "2026-05-03T06:05:00.000Z",
    variance_count: 1,
  };

  const sessionItem: StocktakeItem = {
    id: "item-1",
    session_id: "session-1",
    product_id: "product-1",
    product_name: "Dove Soap",
    system_quantity: 8,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchStocktakeSessions).mockResolvedValue([inProgressSession]);
    vi.mocked(getStocktakeSession).mockResolvedValue({
      session: inProgressSession,
      items: [sessionItem],
    });
    vi.mocked(createStocktakeSession).mockResolvedValue(inProgressSession);
    vi.mocked(startStocktakeSession).mockResolvedValue(inProgressSession);
    vi.mocked(completeStocktakeSession).mockResolvedValue(completedSession);
    vi.mocked(deleteStocktakeSession).mockResolvedValue();
    vi.mocked(revertStocktakeSession).mockResolvedValue({
      ...completedSession,
      status: "Reverted",
    });
  });

  it("persists draft counts before completing the session", async () => {
    const pendingUpdate = createDeferred<
      Pick<StocktakeItem, "id" | "counted_quantity" | "variance_quantity">
    >();
    vi.mocked(updateStocktakeItem).mockReturnValue(pendingUpdate.promise);

    render(<StocktakeTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Enter counts" }));

    const countInput = await screen.findByRole("spinbutton");
    fireEvent.change(countInput, { target: { value: "10" } });

    expect(await screen.findByText("+2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Complete session" }));
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));

    await waitFor(() => {
      expect(updateStocktakeItem).toHaveBeenCalledWith("session-1", "item-1", 10);
    });

    expect(completeStocktakeSession).not.toHaveBeenCalled();

    pendingUpdate.resolve({
      id: "item-1",
      counted_quantity: 10,
      variance_quantity: 2,
    });

    await waitFor(() => {
      expect(completeStocktakeSession).toHaveBeenCalledWith("session-1");
    });
  });

  it("removes an in-progress session when cancel is confirmed", async () => {
    render(<StocktakeTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Enter counts" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel session" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove session" }));

    await waitFor(() => {
      expect(deleteStocktakeSession).toHaveBeenCalledWith("session-1");
    });
  });

  it("reverts a completed session from the sessions list", async () => {
    vi.mocked(fetchStocktakeSessions).mockResolvedValue([completedSession]);
    vi.mocked(getStocktakeSession).mockResolvedValue({
      session: completedSession,
      items: [
        {
          ...sessionItem,
          counted_quantity: 10,
          variance_quantity: 2,
        },
      ],
    });

    render(<StocktakeTab />);

    fireEvent.click(await screen.findByRole("button", { name: "Revert" }));
    fireEvent.click(await screen.findByRole("button", { name: "Revert session" }));

    await waitFor(() => {
      expect(revertStocktakeSession).toHaveBeenCalledWith("session-1");
    });
  });
});
