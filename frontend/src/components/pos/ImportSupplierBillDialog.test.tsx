import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ImportSupplierBillDialog from "./ImportSupplierBillDialog";
import {
  confirmPurchaseImport,
  createProduct,
  createPurchaseOcrDraft,
  fetchProductCatalog,
  type PurchaseImportConfirmResponse,
  type PurchaseOcrDraftResponse,
} from "@/lib/api";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    fetchProductCatalog: vi.fn(),
    createPurchaseOcrDraft: vi.fn(),
    createProduct: vi.fn(),
    confirmPurchaseImport: vi.fn(),
  };
});

const catalogProduct = {
  id: "prod-1",
  name: "Rice 5kg",
  sku: "RICE-5KG",
  barcode: "111222333",
  price: 250,
  stock: 12,
};

function createDraftResponse(overrides: Partial<PurchaseOcrDraftResponse> = {}): PurchaseOcrDraftResponse {
  return {
    draft_id: "draft-1",
    correlation_id: "corr-1",
    status: "review_required",
    scan_status: "clean",
    file_name: "bill.pdf",
    content_type: "application/pdf",
    file_size: 1024,
    supplier_name: "Supplier A",
    invoice_number: "INV-001",
    invoice_date: "2026-03-28T00:00:00Z",
    currency: "LKR",
    subtotal: 100,
    tax_total: 0,
    grand_total: 100,
    ocr_confidence: 0.9,
    review_required: false,
    can_auto_commit: true,
    blocked_reasons: [],
    totals: {
      line_total_sum: 100,
      extracted_subtotal: 100,
      extracted_tax_total: 0,
      extracted_grand_total: 100,
      expected_grand_total: 100,
      difference: 0,
      tolerance: 1,
      within_tolerance: true,
      requires_approval_reason: false,
    },
    line_items: [
      {
        line_no: 1,
        raw_text: "Rice 5kg 2 x 50",
        item_name: "Rice 5kg",
        quantity: 2,
        unit_cost: 50,
        line_total: 100,
        confidence: 0.95,
        review_status: "ready",
        match_status: "matched",
        match_method: "exact_name",
        match_score: 0.99,
        matched_product_id: "prod-1",
        matched_product_name: "Rice 5kg",
        matched_product_sku: "RICE-5KG",
        matched_product_barcode: "111222333",
      },
    ],
    warnings: [],
    created_at: "2026-03-29T12:00:00Z",
    ...overrides,
  };
}

function createConfirmResponse(): PurchaseImportConfirmResponse {
  return {
    purchase_bill_id: "bill-1",
    import_request_id: "import-1",
    status: "confirmed",
    idempotent_replay: false,
    supplier_id: "supplier-1",
    supplier_name: "Supplier A",
    invoice_number: "INV-001",
    invoice_date: "2026-03-28T00:00:00Z",
    currency: "LKR",
    subtotal: 100,
    tax_total: 0,
    grand_total: 100,
    items: [
      {
        purchase_bill_item_id: "item-1",
        line_no: 1,
        product_id: "prod-1",
        product_name: "Rice 5kg",
        quantity: 2,
        unit_cost: 50,
        line_total: 100,
      },
    ],
    inventory_updates: [
      {
        product_id: "prod-1",
        product_name: "Rice 5kg",
        previous_quantity: 12,
        delta_quantity: 2,
        new_quantity: 14,
      },
    ],
    created_at: "2026-03-29T12:01:00Z",
  };
}

function renderDialog() {
  const onImported = vi.fn();

  render(
    <ImportSupplierBillDialog
      open={true}
      onOpenChange={vi.fn()}
      onImported={onImported}
    />,
  );

  return { onImported };
}

async function uploadDraft() {
  const fileInput = screen.getByLabelText("Upload your supplier bill") as HTMLInputElement;
  const file = new File(["test"], "supplier-bill.pdf", { type: "application/pdf" });

  fireEvent.change(fileInput, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: /upload and scan/i }));

  await waitFor(() => {
    expect(createPurchaseOcrDraft).toHaveBeenCalledTimes(1);
  });
}

describe("ImportSupplierBillDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchProductCatalog).mockResolvedValue([catalogProduct]);
  });

  it("renders parsed review details after upload", async () => {
    vi.mocked(createPurchaseOcrDraft).mockResolvedValue(
      createDraftResponse({
        warnings: ["Low confidence line detected"],
        blocked_reasons: ["manual_review_required"],
        totals: {
          line_total_sum: 100,
          extracted_subtotal: 100,
          extracted_tax_total: 0,
          extracted_grand_total: 100,
          expected_grand_total: 102.5,
          difference: 2.5,
          tolerance: 1,
          within_tolerance: false,
          requires_approval_reason: true,
        },
      }),
    );

    renderDialog();
    await uploadDraft();

    expect(await screen.findByText("Item Review and Mapping")).toBeInTheDocument();
    expect(screen.getAllByText(/Range 2.50 \/ Limit 1.00/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Approval Reason")).toBeInTheDocument();
  });

  it("keeps confirm disabled until approval reason is provided when required", async () => {
    vi.mocked(createPurchaseOcrDraft).mockResolvedValue(
      createDraftResponse({
        totals: {
          line_total_sum: 100,
          extracted_subtotal: 100,
          extracted_tax_total: 0,
          extracted_grand_total: 100,
          expected_grand_total: 102.5,
          difference: 2.5,
          tolerance: 1,
          within_tolerance: false,
          requires_approval_reason: true,
        },
      }),
    );

    renderDialog();
    await uploadDraft();

    const confirmButton = screen.getByRole("button", { name: /confirm import/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Approval Reason"), {
      target: { value: "Manager approved the mismatch due to supplier rounding." },
    });

    await waitFor(() => {
      expect(confirmButton).toBeEnabled();
    });
  });

  it("submits confirm payload and calls onImported", async () => {
    const confirmResponse = createConfirmResponse();

    vi.mocked(createPurchaseOcrDraft).mockResolvedValue(createDraftResponse());
    vi.mocked(confirmPurchaseImport).mockResolvedValue(confirmResponse);

    const { onImported } = renderDialog();
    await uploadDraft();

    fireEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    await waitFor(() => {
      expect(confirmPurchaseImport).toHaveBeenCalledTimes(1);
      expect(onImported).toHaveBeenCalledWith(confirmResponse);
    });

    const payload = vi.mocked(confirmPurchaseImport).mock.calls[0][0];
    expect(payload.draft_id).toBe("draft-1");
    expect(payload.invoice_number).toBe("INV-001");
    expect(payload.supplier_name).toBe("Supplier A");
    expect(payload.items[0]).toMatchObject({
      line_no: 1,
      product_id: "prod-1",
      quantity: 2,
      unit_cost: 50,
      line_total: 100,
    });
    expect(payload.import_request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("creates a new product inline and auto-maps the detected line", async () => {
    vi.mocked(createPurchaseOcrDraft).mockResolvedValue(
      createDraftResponse({
        line_items: [
          {
            line_no: 1,
            raw_text: "Coconut Oil Pure 750ml 1 x 1200",
            item_name: "Coconut Oil Pure 750ml",
            quantity: 1,
            unit_cost: 1200,
            line_total: 1200,
            confidence: 0.85,
            review_status: "needs_review",
            match_status: "unmatched",
            match_method: null,
            match_score: null,
            matched_product_id: null,
            matched_product_name: null,
            matched_product_sku: null,
            matched_product_barcode: null,
          },
        ],
      }),
    );
    vi.mocked(createProduct).mockResolvedValue({
      id: "prod-new-1",
      name: "Coconut Oil Pure 750ml",
      sku: "COCO-750",
      barcode: undefined,
      price: 1200,
      category: undefined,
      stock: 0,
      image: "https://example.com/coconut-oil.png",
    });

    renderDialog();
    await uploadDraft();

    const confirmButton = screen.getByRole("button", { name: /confirm import/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /create product for this line/i }));
    fireEvent.click(screen.getByRole("button", { name: /create & map product/i }));

    await waitFor(() => {
      expect(createProduct).toHaveBeenCalledTimes(1);
      expect(confirmButton).toBeEnabled();
    });
  });
});
