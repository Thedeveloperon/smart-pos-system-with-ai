import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WarrantyClaimsTab from "./WarrantyClaimsTab";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("WarrantyClaimsTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows claim actions for backend enum statuses and sends enum codes on updates", async () => {
    const claims = [
      {
        id: "claim-1",
        serial_number_id: "sn-1",
        serial_value: "SN-001",
        product_name: "iPhone 15 Pro",
        claim_date: "2026-05-01T00:00:00.000Z",
        status: 1,
        resolution_notes: null,
        created_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "claim-2",
        serial_number_id: "sn-2",
        serial_value: "SN-002",
        product_name: "Sony WH-1000XM5",
        claim_date: "2026-05-02T00:00:00.000Z",
        status: 2,
        resolution_notes: null,
        created_at: "2026-05-02T00:00:00.000Z",
      },
      {
        id: "claim-3",
        serial_number_id: "sn-3",
        serial_value: "SN-003",
        product_name: "Samsung Galaxy A07",
        claim_date: "2026-05-03T00:00:00.000Z",
        status: 3,
        resolution_notes: "Replaced battery.",
        created_at: "2026-05-03T00:00:00.000Z",
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url.includes("/api/warranty-claims/") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body ?? "{}")) as { status?: number };
        const claimId = url.split("/api/warranty-claims/")[1];
        const currentClaim = claims.find((claim) => claim.id === claimId);
        return jsonResponse({
          ...currentClaim,
          status: body.status ?? currentClaim?.status,
        });
      }

      if (url.includes("/api/warranty-claims")) {
        return jsonResponse({ items: claims });
      }

      return jsonResponse({ items: [] });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<WarrantyClaimsTab />);

    const openRow = await screen.findByText("SN-001");
    const inRepairRow = screen.getByText("SN-002");
    const resolvedRow = screen.getByText("SN-003");

    const openRowItem = openRow.closest("li");
    const inRepairRowItem = inRepairRow.closest("li");
    const resolvedRowItem = resolvedRow.closest("li");

    expect(openRowItem).not.toBeNull();
    expect(inRepairRowItem).not.toBeNull();
    expect(resolvedRowItem).not.toBeNull();

    if (!openRowItem || !inRepairRowItem || !resolvedRowItem) {
      throw new Error("Expected claim rows to render.");
    }

    expect(within(openRowItem).getByRole("button", { name: "In Repair" })).toBeInTheDocument();
    expect(within(openRowItem).getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(within(openRowItem).queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();

    expect(within(inRepairRowItem).getByRole("button", { name: "Resolve" })).toBeInTheDocument();
    expect(within(inRepairRowItem).getByRole("button", { name: "Reject" })).toBeInTheDocument();

    expect(within(resolvedRowItem).queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
    expect(within(resolvedRowItem).queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(within(resolvedRowItem).queryByRole("button", { name: "In Repair" })).not.toBeInTheDocument();

    fireEvent.click(within(openRowItem).getByRole("button", { name: "Reject" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reject Claim" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/warranty-claims/claim-1"),
        expect.objectContaining({ method: "PUT" }),
      );
    });

    const putCall = fetchMock.mock.calls.find(
      ([requestUrl, requestInit]) =>
        requestUrl.toString().includes("/api/warranty-claims/claim-1") &&
        requestInit?.method === "PUT",
    );
    expect(putCall).toBeDefined();

    const [, putInit] = putCall ?? [];
    const serializedBody = JSON.parse(String(putInit?.body ?? "{}")) as { status?: number };
    expect(serializedBody.status).toBe(4);
  });
});
