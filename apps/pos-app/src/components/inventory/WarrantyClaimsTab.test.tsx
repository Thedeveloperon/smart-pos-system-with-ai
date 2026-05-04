import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

  it("shows receive-back and resolve actions by stage and sends expected update payloads", async () => {
    const claims = [
      {
        id: "claim-1",
        serial_number_id: "sn-1",
        product_id: "product-1",
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
        product_id: "product-2",
        serial_value: "SN-002",
        product_name: "Sony WH-1000XM5",
        claim_date: "2026-05-02T00:00:00.000Z",
        status: 2,
        resolution_notes: null,
        supplier_name: "Samsung Service Center",
        created_at: "2026-05-02T00:00:00.000Z",
      },
      {
        id: "claim-3",
        serial_number_id: "sn-3",
        product_id: "product-3",
        serial_value: "SN-003",
        product_name: "Samsung Galaxy A07",
        claim_date: "2026-05-03T00:00:00.000Z",
        status: 3,
        resolution_notes: "Replaced battery.",
        received_back_date: "2026-05-03T09:00:00.000Z",
        received_back_person_name: "Nimali Silva",
        created_at: "2026-05-03T00:00:00.000Z",
      },
    ];
    const suppliers = [
      {
        supplier_id: "sup-1",
        name: "Supplier A",
        phone: null,
        company_name: null,
        company_phone: null,
        address: null,
        is_active: true,
        linked_product_count: 0,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: null,
        brands: [],
      },
      {
        supplier_id: "sup-2",
        name: "Supplier B",
        phone: null,
        company_name: null,
        company_phone: null,
        address: null,
        is_active: true,
        linked_product_count: 0,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: null,
        brands: [],
      },
    ];

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();

        if (url.includes("/api/warranty-claims/") && init?.method === "PUT") {
          const body = JSON.parse(String(init.body ?? "{}")) as Record<
            string,
            unknown
          >;
          const claimId = url.split("/api/warranty-claims/")[1];
          const currentClaim = claims.find((claim) => claim.id === claimId);
          return jsonResponse({
            ...currentClaim,
            ...body,
            status: body.status ?? currentClaim?.status,
          });
        }

        if (url.includes("/api/warranty-claims")) {
          return jsonResponse({ items: claims });
        }

        if (url.includes("/api/suppliers")) {
          return jsonResponse({ items: suppliers });
        }

        return jsonResponse({ items: [] });
      },
    );

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

    expect(
      within(openRowItem).getByRole("button", { name: "Replace" }),
    ).toBeInTheDocument();
    expect(
      within(openRowItem).getByRole("button", { name: "In Repair" }),
    ).toBeInTheDocument();
    expect(
      within(openRowItem).getByRole("button", { name: "Reject" }),
    ).toBeInTheDocument();
    expect(
      within(openRowItem).queryByRole("button", { name: "Resolve" }),
    ).not.toBeInTheDocument();

    expect(
      within(inRepairRowItem).getByRole("button", { name: "Receive Back" }),
    ).toBeInTheDocument();
    expect(
      within(inRepairRowItem).getByRole("button", { name: "Reject" }),
    ).toBeInTheDocument();
    expect(
      within(inRepairRowItem).queryByRole("button", { name: "Resolve" }),
    ).not.toBeInTheDocument();

    expect(
      within(resolvedRowItem).queryByRole("button", { name: "Resolve" }),
    ).not.toBeInTheDocument();
    expect(
      within(resolvedRowItem).queryByRole("button", { name: "Reject" }),
    ).not.toBeInTheDocument();
    expect(
      within(resolvedRowItem).queryByRole("button", { name: "In Repair" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(openRowItem).getByRole("button", { name: "In Repair" }),
    );
    const handoverDialog = await screen.findByRole("dialog", {
      name: /send to repair/i,
    });
    fireEvent.change(
      within(handoverDialog).getByPlaceholderText(
        "e.g. Samsung Service Center",
      ),
      {
        target: { value: "Samsung Service Center" },
      },
    );
    const pickupTrigger = within(handoverDialog).getByRole("combobox");
    fireEvent.mouseDown(pickupTrigger);
    fireEvent.click(pickupTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "Supplier B" }));
    fireEvent.click(
      within(handoverDialog).getByRole("button", { name: "Confirm Handover" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/warranty-claims/claim-1"),
        expect.objectContaining({ method: "PUT" }),
      );
    });

    const handoverCall = fetchMock.mock.calls.find(
      ([requestUrl, requestInit]) =>
        requestUrl.toString().includes("/api/warranty-claims/claim-1") &&
        requestInit?.method === "PUT",
    );
    expect(handoverCall).toBeDefined();

    const [, handoverInit] = handoverCall ?? [];
    const handoverBody = JSON.parse(String(handoverInit?.body ?? "{}")) as {
      status?: number;
      supplier_name?: string;
      pickup_person_name?: string;
    };
    expect(handoverBody.status).toBe(2);
    expect(handoverBody.supplier_name).toBe("Samsung Service Center");
    expect(handoverBody.pickup_person_name).toBe("Supplier B");

    const refreshedInRepairRow = await screen.findByText("SN-002");
    const refreshedInRepairRowItem = refreshedInRepairRow.closest("li");
    expect(refreshedInRepairRowItem).not.toBeNull();
    if (!refreshedInRepairRowItem) {
      throw new Error("Expected in-repair claim row to render after handover.");
    }

    fireEvent.click(
      within(refreshedInRepairRowItem).getByRole("button", {
        name: "Receive Back",
      }),
    );
    const receiveBackDialog = await screen.findByRole("dialog", {
      name: /receive back/i,
    });
    fireEvent.change(
      within(receiveBackDialog).getByPlaceholderText("e.g. Nimal Perera"),
      {
        target: { value: "Nimali Silva" },
      },
    );
    fireEvent.click(
      within(receiveBackDialog).getByRole("button", {
        name: "Save Receive Back",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/warranty-claims/claim-2"),
        expect.objectContaining({ method: "PUT" }),
      );
    });

    const receiveBackCall = fetchMock.mock.calls.find(
      ([requestUrl, requestInit]) =>
        requestUrl.toString().includes("/api/warranty-claims/claim-2") &&
        requestInit?.method === "PUT",
    );
    expect(receiveBackCall).toBeDefined();

    const [, receiveBackInit] = receiveBackCall ?? [];
    const receiveBackBody = JSON.parse(
      String(receiveBackInit?.body ?? "{}"),
    ) as {
      status?: number;
      received_back_date?: string;
      received_back_person_name?: string;
    };
    expect(receiveBackBody.status).toBe(2);
    expect(receiveBackBody).not.toHaveProperty("received_back_date");
    expect(receiveBackBody.received_back_person_name).toBe("Nimali Silva");
  });

  it("creates claims without sending a manual claim timestamp", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();

        if (url.includes("/api/serials/lookup")) {
          return jsonResponse({
            serial: {
              id: "serial-1",
              serial_value: "SN-001",
              status: "Sold",
            },
            product: {
              id: "product-1",
              name: "iPhone 15 Pro",
            },
          });
        }

        if (url.includes("/api/products/product-1/serials")) {
          return jsonResponse({
            items: [
              {
                id: "serial-1",
                serial_value: "SN-001",
              },
            ],
          });
        }

        if (url.endsWith("/api/warranty-claims") && init?.method === "POST") {
          const body = JSON.parse(String(init.body ?? "{}")) as Record<
            string,
            unknown
          >;
          return jsonResponse({
            id: "claim-new",
            serial_number_id: body.serial_number_id,
            product_id: "product-1",
            serial_value: "SN-001",
            product_name: "iPhone 15 Pro",
            claim_date: "2026-05-03T08:00:00.000Z",
            status: 1,
            resolution_notes: body.resolution_notes ?? null,
            created_at: "2026-05-03T08:00:00.000Z",
          });
        }

        if (url.includes("/api/warranty-claims")) {
          return jsonResponse({ items: [] });
        }

        return jsonResponse({ items: [] });
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    render(<WarrantyClaimsTab />);

    fireEvent.click(await screen.findByRole("button", { name: "New claim" }));
    fireEvent.change(screen.getByPlaceholderText("SN-XXX-001"), {
      target: { value: "SN-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    await screen.findByText("Serial validated");
    expect(screen.queryByLabelText("Claim date")).not.toBeInTheDocument();

    const [, notesField] = screen.getAllByRole("textbox");
    fireEvent.change(notesField, {
      target: { value: "Battery issue" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create claim" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/warranty-claims"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    const createCall = fetchMock.mock.calls.find(
      ([requestUrl, requestInit]) =>
        requestUrl.toString().endsWith("/api/warranty-claims") &&
        requestInit?.method === "POST",
    );
    expect(createCall).toBeDefined();

    const [, createInit] = createCall ?? [];
    const createBody = JSON.parse(String(createInit?.body ?? "{}")) as {
      serial_number_id?: string;
      claim_date?: string;
      resolution_notes?: string;
    };

    expect(createBody.serial_number_id).toBe("serial-1");
    expect(createBody).not.toHaveProperty("claim_date");
    expect(createBody.resolution_notes).toBe("Battery issue");
  });

  it("shows a direct replacement action for open claims and posts the selected replacement serial", async () => {
    const claims = [
      {
        id: "claim-1",
        serial_number_id: "serial-original",
        product_id: "product-1",
        serial_value: "SN-001",
        product_name: "Samsung Galaxy A07",
        claim_date: "2026-05-03T08:00:00.000Z",
        status: 1,
        resolution_notes: null,
        created_at: "2026-05-03T08:00:00.000Z",
      },
    ];

    const availableSerials = [
      {
        id: "serial-original",
        product_id: "product-1",
        serial_value: "SN-001",
        status: "UnderWarranty",
        created_at: "2026-05-03T08:00:00.000Z",
      },
      {
        id: "serial-replacement",
        product_id: "product-1",
        serial_value: "SN-REPL-001",
        status: "Available",
        created_at: "2026-05-03T09:00:00.000Z",
      },
    ];

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();

        if (url.includes("/api/warranty-claims/claim-1/replace") && init?.method === "POST") {
          const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
          claims[0] = {
            ...claims[0],
            status: 3,
            resolution_notes: body.resolution_notes ?? null,
            replacement_serial_number_id: body.replacement_serial_number_id,
            replacement_serial_value: "SN-REPL-001",
            replacement_date: "2026-05-03T10:30:00.000Z",
          };

          return jsonResponse({
            ...claims[0],
          });
        }

        if (url.includes("/api/products/product-1/serials")) {
          return jsonResponse({ items: availableSerials });
        }

        if (url.includes("/api/warranty-claims")) {
          return jsonResponse({ items: claims });
        }

        return jsonResponse({ items: [] });
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    render(<WarrantyClaimsTab />);

    const openRow = await screen.findByText("SN-001");
    const openRowItem = openRow.closest("li");
    expect(openRowItem).not.toBeNull();
    if (!openRowItem) {
      throw new Error("Expected open claim row to render.");
    }

    fireEvent.click(within(openRowItem).getByRole("button", { name: "Replace" }));

    const replaceDialog = await screen.findByRole("dialog", {
      name: /direct replacement/i,
    });
    const replacementTrigger = within(replaceDialog).getByRole("combobox");
    fireEvent.mouseDown(replacementTrigger);
    fireEvent.click(replacementTrigger);
    fireEvent.click(await screen.findByRole("option", { name: "SN-REPL-001" }));

    fireEvent.change(
      within(replaceDialog).getByPlaceholderText("Optional note for the direct replacement"),
      {
        target: { value: "Replaced from shop stock" },
      },
    );
    fireEvent.click(
      within(replaceDialog).getByRole("button", { name: "Confirm Replacement" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/warranty-claims/claim-1/replace"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    const replaceCall = fetchMock.mock.calls.find(
      ([requestUrl, requestInit]) =>
        requestUrl.toString().includes("/api/warranty-claims/claim-1/replace") &&
        requestInit?.method === "POST",
    );
    expect(replaceCall).toBeDefined();

    const [, replaceInit] = replaceCall ?? [];
    const replaceBody = JSON.parse(String(replaceInit?.body ?? "{}")) as {
      replacement_serial_number_id?: string;
      resolution_notes?: string;
    };
    expect(replaceBody.replacement_serial_number_id).toBe("serial-replacement");
    expect(replaceBody.resolution_notes).toBe("Replaced from shop stock");

    const resolvedRow = await screen.findByText("SN-001");
    const resolvedRowItem = resolvedRow.closest("li");
    expect(resolvedRowItem).not.toBeNull();
    if (!resolvedRowItem) {
      throw new Error("Expected resolved claim row to render after replacement.");
    }

    expect(
      within(resolvedRowItem).queryByRole("button", { name: "Replace" }),
    ).not.toBeInTheDocument();
  });
});
