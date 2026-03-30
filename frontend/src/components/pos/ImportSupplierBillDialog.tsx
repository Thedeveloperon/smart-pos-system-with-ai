import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PackagePlus, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@/components/pos/types";
import {
  ApiError,
  confirmPurchaseImport,
  createProduct,
  createPurchaseOcrDraft,
  fetchProductCatalog,
  type PurchaseImportConfirmResponse,
  type PurchaseOcrDraftLineItem,
  type PurchaseOcrDraftResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type EditableLine = {
  lineNo: number;
  sourceName: string;
  rawText?: string | null;
  quantity: string;
  unitCost: string;
  selectedProductId: string;
  matchStatus: string;
  matchMethod?: string | null;
  matchScore?: number | null;
  reviewStatus: string;
  confidence?: number | null;
};

type InlineCreateProductDraft = {
  lineNo: number;
  name: string;
  sku: string;
  barcode: string;
  unitPrice: string;
  costPrice: string;
  initialStockQuantity: string;
  reorderLevel: string;
};

type ImportSupplierBillDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (result: PurchaseImportConfirmResponse) => Promise<void> | void;
};

const ACCEPTED_FILE_TYPES = ".pdf,.png,.jpg,.jpeg";
const UNASSIGNED_PRODUCT_VALUE = "__unassigned";

function normalizeComparableText(value?: string | null) {
  if (!value) {
    return "";
  }

  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function formatSupplierItemText(value: string) {
  return value
    .replace(/\|+/g, " ")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function shouldShowRawTextPreview(sourceName: string, rawText?: string | null) {
  if (!rawText?.trim()) {
    return false;
  }

  const sourceComparable = normalizeComparableText(sourceName);
  const rawComparable = normalizeComparableText(rawText);

  if (!rawComparable || rawComparable === sourceComparable) {
    return false;
  }

  return rawComparable.length >= 6;
}

function toDateInputValue(value?: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function toDecimalOrNull(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function toDraftLine(line: PurchaseOcrDraftLineItem): EditableLine {
  const sourceName = formatSupplierItemText(
    line.item_name?.trim() || line.raw_text?.trim() || `Line ${line.line_no}`,
  );

  return {
    lineNo: line.line_no,
    sourceName,
    rawText: line.raw_text,
    quantity: line.quantity == null ? "" : String(line.quantity),
    unitCost: line.unit_cost == null ? "" : String(line.unit_cost),
    selectedProductId: line.matched_product_id || "",
    matchStatus: line.match_status,
    matchMethod: line.match_method,
    matchScore: line.match_score,
    reviewStatus: line.review_status,
    confidence: line.confidence,
  };
}

function getLineValidation(line: EditableLine) {
  const quantity = toDecimalOrNull(line.quantity);
  const unitCost = toDecimalOrNull(line.unitCost);

  const hasValidQuantity = quantity != null && quantity > 0;
  const hasValidUnitCost = unitCost != null && unitCost >= 0;

  return {
    quantity,
    unitCost,
    hasValidQuantity,
    hasValidUnitCost,
    lineTotal: hasValidQuantity && hasValidUnitCost ? Number((quantity * unitCost).toFixed(2)) : null,
  };
}

function getMatchBadge(line: EditableLine) {
  if (line.matchStatus === "matched") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Matched</Badge>;
  }

  if (line.matchStatus === "matched_fuzzy") {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
        Fuzzy Match
      </Badge>
    );
  }

  return <Badge variant="destructive">Unmatched</Badge>;
}

export default function ImportSupplierBillDialog({ open, onOpenChange, onImported }: ImportSupplierBillDialogProps) {
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [supplierHint, setSupplierHint] = useState("");

  const [draft, setDraft] = useState<PurchaseOcrDraftResponse | null>(null);
  const [importRequestId, setImportRequestId] = useState<string | null>(null);
  const [editableLines, setEditableLines] = useState<EditableLine[]>([]);

  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [currency, setCurrency] = useState("LKR");
  const [taxTotal, setTaxTotal] = useState("");
  const [grandTotal, setGrandTotal] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [updateCostPrice, setUpdateCostPrice] = useState(true);
  const [createProductDraft, setCreateProductDraft] = useState<InlineCreateProductDraft | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  const isBusy = isUploading || isConfirming || isCreatingProduct;

  useEffect(() => {
    if (!open) {
      return;
    }

    let isActive = true;

    const loadCatalog = async () => {
      setIsCatalogLoading(true);
      try {
        const products = await fetchProductCatalog(200);
        if (!isActive) {
          return;
        }

        setCatalogProducts(products);
      } catch (error) {
        if (!isActive) {
          return;
        }

        console.error(error);
        toast.error("Failed to load catalog products for mapping.");
      } finally {
        if (isActive) {
          setIsCatalogLoading(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      isActive = false;
    };
  }, [open]);

  const productById = useMemo(
    () => new Map(catalogProducts.map((product) => [product.id, product])),
    [catalogProducts],
  );

  const lineSummaries = useMemo(
    () => editableLines.map((line) => ({ line, validation: getLineValidation(line) })),
    [editableLines],
  );

  const unresolvedLineCount = useMemo(
    () => editableLines.filter((line) => !line.selectedProductId).length,
    [editableLines],
  );

  const invalidLineCount = useMemo(
    () =>
      lineSummaries.filter((item) => !item.validation.hasValidQuantity || !item.validation.hasValidUnitCost).length,
    [lineSummaries],
  );

  const computedSubtotal = useMemo(
    () =>
      Number(
        lineSummaries
          .reduce((sum, item) => sum + (item.validation.lineTotal || 0), 0)
          .toFixed(2),
      ),
    [lineSummaries],
  );

  const requiresApprovalReason = draft?.totals.requires_approval_reason ?? false;

  const canConfirm =
    Boolean(draft) &&
    Boolean(importRequestId) &&
    !isBusy &&
    editableLines.length > 0 &&
    unresolvedLineCount === 0 &&
    invalidLineCount === 0 &&
    supplierName.trim().length > 0 &&
    invoiceNumber.trim().length > 0 &&
    (!requiresApprovalReason || approvalReason.trim().length > 0);

  const confirmBlockers = useMemo(() => {
    const blockers: string[] = [];

    if (!draft || !importRequestId) {
      blockers.push("Upload and parse a supplier bill first.");
    }

    if (editableLines.length === 0) {
      blockers.push("No line items available for import.");
    }

    if (unresolvedLineCount > 0) {
      blockers.push(
        `${unresolvedLineCount} line${unresolvedLineCount === 1 ? "" : "s"} still need product mapping.`,
      );
    }

    if (invalidLineCount > 0) {
      blockers.push(
        `${invalidLineCount} line${invalidLineCount === 1 ? "" : "s"} have invalid quantity or unit cost.`,
      );
    }

    if (!supplierName.trim()) {
      blockers.push("Supplier name is required.");
    }

    if (!invoiceNumber.trim()) {
      blockers.push("Invoice number is required.");
    }

    if (requiresApprovalReason && !approvalReason.trim()) {
      blockers.push("Approval reason is required due to totals mismatch.");
    }

    return blockers;
  }, [
    approvalReason,
    draft,
    editableLines.length,
    importRequestId,
    invalidLineCount,
    invoiceNumber,
    requiresApprovalReason,
    supplierName,
    unresolvedLineCount,
  ]);

  const primaryConfirmBlocker = confirmBlockers[0] ?? null;

  const resetState = () => {
    setSelectedFile(null);
    setSupplierHint("");
    setDraft(null);
    setImportRequestId(null);
    setEditableLines([]);
    setSupplierName("");
    setInvoiceNumber("");
    setInvoiceDate("");
    setCurrency("LKR");
    setTaxTotal("");
    setGrandTotal("");
    setApprovalReason("");
    setUpdateCostPrice(true);
    setCreateProductDraft(null);
    setIsUploading(false);
    setIsConfirming(false);
    setIsCreatingProduct(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isBusy) {
      return;
    }

    if (!nextOpen) {
      resetState();
    }

    onOpenChange(nextOpen);
  };

  const handleUploadDraft = async () => {
    if (!selectedFile) {
      toast.error("Select a supplier bill file before uploading.");
      return;
    }

    setIsUploading(true);
    try {
      const response = await createPurchaseOcrDraft(selectedFile, supplierHint);
      setDraft(response);
      setImportRequestId(crypto.randomUUID());
      setEditableLines(response.line_items.map(toDraftLine));

      setSupplierName(response.supplier_name?.trim() || supplierHint.trim());
      setInvoiceNumber(response.invoice_number?.trim() || "");
      setInvoiceDate(toDateInputValue(response.invoice_date));
      setCurrency((response.currency || "LKR").toUpperCase());
      setTaxTotal(response.tax_total == null ? "" : String(response.tax_total));
      setGrandTotal(response.grand_total == null ? "" : String(response.grand_total));
      setApprovalReason("");
      setCreateProductDraft(null);

      toast.success("Bill parsed. Review and confirm the import.");
    } catch (error) {
      console.error(error);
      const message = error instanceof ApiError ? error.message : "Failed to parse supplier bill.";
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenCreateProduct = (line: EditableLine) => {
    const mappedUnitCost = toDecimalOrNull(line.unitCost);
    const defaultCost = mappedUnitCost != null && mappedUnitCost >= 0 ? mappedUnitCost.toFixed(2) : "0";

    setCreateProductDraft({
      lineNo: line.lineNo,
      name: line.sourceName || `Line ${line.lineNo} Item`,
      sku: "",
      barcode: "",
      unitPrice: defaultCost,
      costPrice: defaultCost,
      initialStockQuantity: "0",
      reorderLevel: "5",
    });
  };

  const handleCreateAndMapProduct = async () => {
    if (!createProductDraft) {
      return;
    }

    const name = createProductDraft.name.trim();
    const unitPrice = toDecimalOrNull(createProductDraft.unitPrice);
    const costPrice = toDecimalOrNull(createProductDraft.costPrice);
    const initialStockQuantity = toDecimalOrNull(createProductDraft.initialStockQuantity);
    const reorderLevel = toDecimalOrNull(createProductDraft.reorderLevel);

    if (!name) {
      toast.error("Product name is required.");
      return;
    }

    if (unitPrice == null || unitPrice < 0) {
      toast.error("Unit price must be a valid non-negative number.");
      return;
    }

    if (costPrice == null || costPrice < 0) {
      toast.error("Cost price must be a valid non-negative number.");
      return;
    }

    if (initialStockQuantity == null || initialStockQuantity < 0) {
      toast.error("Initial stock must be a valid non-negative number.");
      return;
    }

    if (reorderLevel == null || reorderLevel < 0) {
      toast.error("Reorder level must be a valid non-negative number.");
      return;
    }

    setIsCreatingProduct(true);
    try {
      const createdProduct = await createProduct({
        name,
        sku: createProductDraft.sku.trim() || null,
        barcode: createProductDraft.barcode.trim() || null,
        image_url: null,
        category_id: null,
        unit_price: unitPrice,
        cost_price: costPrice,
        initial_stock_quantity: initialStockQuantity,
        reorder_level: reorderLevel,
        allow_negative_stock: true,
        is_active: true,
      });

      setCatalogProducts((previous) =>
        [...previous.filter((product) => product.id !== createdProduct.id), createdProduct]
          .sort((left, right) => left.name.localeCompare(right.name)),
      );

      setEditableLines((previous) =>
        previous.map((line) =>
          line.lineNo === createProductDraft.lineNo
            ? {
                ...line,
                selectedProductId: createdProduct.id,
                matchStatus: "matched",
                matchMethod: "manual_created",
                matchScore: 1,
                reviewStatus: "ready",
              }
            : line,
        ),
      );

      toast.success(`Created product "${createdProduct.name}" and mapped line ${createProductDraft.lineNo}.`);
      setCreateProductDraft(null);
    } catch (error) {
      console.error(error);
      const message = error instanceof ApiError ? error.message : "Failed to create product.";
      toast.error(message);
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!draft || !importRequestId) {
      return;
    }

    let linesPayload: {
      line_no: number;
      product_id: string;
      supplier_item_name: string;
      quantity: number;
      unit_cost: number;
      line_total: number;
    }[];
    try {
      linesPayload = lineSummaries.map(({ line, validation }) => {
        if (!line.selectedProductId) {
          throw new Error(`Line ${line.lineNo} is missing a product mapping.`);
        }

        if (!validation.hasValidQuantity || validation.quantity == null) {
          throw new Error(`Line ${line.lineNo} has an invalid quantity.`);
        }

        if (!validation.hasValidUnitCost || validation.unitCost == null) {
          throw new Error(`Line ${line.lineNo} has an invalid unit cost.`);
        }

        return {
          line_no: line.lineNo,
          product_id: line.selectedProductId,
          supplier_item_name: line.sourceName,
          quantity: validation.quantity,
          unit_cost: validation.unitCost,
          line_total: validation.lineTotal ?? Number((validation.quantity * validation.unitCost).toFixed(2)),
        };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid line mapping payload.");
      return;
    }

    const taxTotalValue = taxTotal.trim() ? toDecimalOrNull(taxTotal) : null;
    const grandTotalValue = grandTotal.trim() ? toDecimalOrNull(grandTotal) : null;

    if (taxTotal.trim() && taxTotalValue == null) {
      toast.error("Tax total must be a valid number.");
      return;
    }

    if (grandTotal.trim() && grandTotalValue == null) {
      toast.error("Grand total must be a valid number.");
      return;
    }

    if (!supplierName.trim()) {
      toast.error("Supplier name is required.");
      return;
    }

    if (!invoiceNumber.trim()) {
      toast.error("Invoice number is required.");
      return;
    }

    if (requiresApprovalReason && !approvalReason.trim()) {
      toast.error("Approval reason is required due to totals mismatch.");
      return;
    }

    setIsConfirming(true);
    try {
      const response = await confirmPurchaseImport({
        import_request_id: importRequestId,
        draft_id: draft.draft_id,
        supplier_name: supplierName.trim(),
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate ? `${invoiceDate}T00:00:00Z` : undefined,
        currency: currency.trim().toUpperCase() || "LKR",
        approval_reason: approvalReason.trim() || undefined,
        update_cost_price: updateCostPrice,
        tax_total: taxTotalValue,
        grand_total: grandTotalValue,
        items: linesPayload,
      });

      await onImported(response);

      toast.success(
        `Imported ${response.items.length} item(s). Total ${response.currency} ${response.grand_total.toFixed(2)}.`,
      );

      resetState();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      const message = error instanceof ApiError ? error.message : "Failed to confirm supplier bill import.";
      toast.error(message);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "w-[96vw] max-w-[96vw] gap-0 overflow-hidden p-0 sm:max-w-6xl",
          draft ? "h-[92vh]" : "max-h-[85vh]",
        )}
      >
        <div className={cn("flex min-h-0 flex-col", draft && "h-full")}>
          <div className="border-b px-6 py-4">
            <DialogHeader>
              <DialogTitle>Import Supplier Bill</DialogTitle>
              <DialogDescription>
                Upload a supplier invoice, review OCR matches, and confirm stock intake.
              </DialogDescription>
            </DialogHeader>
          </div>

          <ScrollArea className={cn("min-h-0", draft && "flex-1")}>
            <div className="space-y-6 px-6 py-5 pb-20">
              <section className="rounded-lg border bg-card p-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="supplier-bill-file">Supplier Bill File</Label>
                    <Input
                      id="supplier-bill-file"
                      type="file"
                      accept={ACCEPTED_FILE_TYPES}
                      disabled={isBusy}
                      onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                    />
                    <p className="text-xs text-muted-foreground">Accepted: PDF, PNG, JPG. Max size follows backend policy.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="supplier-hint">Supplier Hint (optional)</Label>
                    <Input
                      id="supplier-hint"
                      value={supplierHint}
                      onChange={(event) => setSupplierHint(event.target.value)}
                      placeholder="e.g. Ceylon Wholesale Traders"
                      disabled={isBusy}
                    />
                  </div>

                  <Button onClick={() => void handleUploadDraft()} disabled={!selectedFile || isUploading || isConfirming}>
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Parsing...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="mr-2 h-4 w-4" />
                        Upload & Parse
                      </>
                    )}
                  </Button>
                </div>

                {selectedFile && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Selected: {selectedFile.name} ({Math.max(1, Math.round(selectedFile.size / 1024))} KB)
                  </p>
                )}
              </section>

              {!draft && (
                <section className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                  <p className="text-sm font-medium">Upload a supplier bill to begin OCR import</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    After parsing, you can review line mapping, create missing products, and confirm the stock intake.
                  </p>
                </section>
              )}

              {draft && (
                <>
                  <section className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2 lg:col-span-2">
                      <Label htmlFor="import-supplier-name">Supplier Name</Label>
                      <Input
                        id="import-supplier-name"
                        value={supplierName}
                        onChange={(event) => setSupplierName(event.target.value)}
                        disabled={isBusy}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="import-invoice-number">Invoice Number</Label>
                      <Input
                        id="import-invoice-number"
                        value={invoiceNumber}
                        onChange={(event) => setInvoiceNumber(event.target.value)}
                        disabled={isBusy}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="import-invoice-date">Invoice Date</Label>
                      <Input
                        id="import-invoice-date"
                        type="date"
                        value={invoiceDate}
                        onChange={(event) => setInvoiceDate(event.target.value)}
                        disabled={isBusy}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="import-currency">Currency</Label>
                      <Input
                        id="import-currency"
                        value={currency}
                        onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                        maxLength={6}
                        disabled={isBusy}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="import-tax-total">Tax Total</Label>
                      <Input
                        id="import-tax-total"
                        type="number"
                        step="0.01"
                        min="0"
                        value={taxTotal}
                        onChange={(event) => setTaxTotal(event.target.value)}
                        disabled={isBusy}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="import-grand-total">Grand Total</Label>
                      <Input
                        id="import-grand-total"
                        type="number"
                        step="0.01"
                        min="0"
                        value={grandTotal}
                        onChange={(event) => setGrandTotal(event.target.value)}
                        disabled={isBusy}
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2 lg:col-span-4">
                      <div>
                        <p className="text-sm font-medium">Update Product Cost Price</p>
                        <p className="text-xs text-muted-foreground">Apply weighted average cost based on imported quantities.</p>
                      </div>
                      <Switch checked={updateCostPrice} onCheckedChange={setUpdateCostPrice} disabled={isBusy} />
                    </div>
                  </section>

                  <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-md border bg-card p-3">
                      <p className="text-xs text-muted-foreground">Draft Status</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant={draft.review_required ? "secondary" : "default"}>
                          {draft.status.replaceAll("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Scan: {draft.scan_status}</span>
                      </div>
                    </div>

                    <div className="rounded-md border bg-card p-3">
                      <p className="text-xs text-muted-foreground">Line Summary</p>
                      <p className="mt-1 text-sm font-medium">
                        {editableLines.length} lines, {unresolvedLineCount} unmapped, {invalidLineCount} invalid
                      </p>
                    </div>

                    <div className="rounded-md border bg-card p-3">
                      <p className="text-xs text-muted-foreground">Computed Subtotal</p>
                      <p className="mt-1 text-sm font-medium">
                        {currency} {computedSubtotal.toFixed(2)}
                      </p>
                    </div>

                    <div className="rounded-md border bg-card p-3">
                      <p className="text-xs text-muted-foreground">Totals Validation</p>
                      <p
                        className={cn(
                          "mt-1 text-sm font-medium",
                          draft.totals.within_tolerance ? "text-emerald-600" : "text-amber-600",
                        )}
                      >
                        Diff {draft.totals.difference.toFixed(2)} / Tol {draft.totals.tolerance.toFixed(2)}
                      </p>
                    </div>
                  </section>

                  {(draft.warnings.length > 0 || draft.blocked_reasons.length > 0 || requiresApprovalReason) && (
                    <section className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 text-amber-900">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4" />
                        <div className="space-y-1 text-sm">
                          <p className="font-medium">Review required before confirm</p>
                          {draft.warnings.map((warning) => (
                            <p key={warning}>- {warning}</p>
                          ))}
                          {draft.blocked_reasons.length > 0 && (
                            <p>
                              Blocked reasons: {draft.blocked_reasons.join(", ").replaceAll("_", " ")}
                            </p>
                          )}
                          {requiresApprovalReason && (
                            <p>Totals are out of tolerance; approval reason is required.</p>
                          )}
                        </div>
                      </div>
                    </section>
                  )}

                  <section className="rounded-lg border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">Line Review and Mapping</h3>
                      {isCatalogLoading ? (
                        <span className="text-xs text-muted-foreground">Loading products...</span>
                      ) : (
                        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                          <span>{catalogProducts.length} products available</span>
                          {unresolvedLineCount > 0 && (
                            <span className="font-medium text-amber-700">
                              Map {unresolvedLineCount} more line{unresolvedLineCount === 1 ? "" : "s"} to enable confirm
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader className="bg-background">
                          <TableRow>
                            <TableHead className="w-[60px]">Line</TableHead>
                            <TableHead className="min-w-[280px]">Supplier Item</TableHead>
                            <TableHead className="w-[110px]">Qty</TableHead>
                            <TableHead className="w-[140px]">Unit Cost</TableHead>
                            <TableHead className="w-[150px]">Line Total</TableHead>
                            <TableHead className="min-w-[280px]">Map to Product</TableHead>
                            <TableHead className="min-w-[230px]">Status</TableHead>
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          {lineSummaries.map(({ line, validation }) => {
                            const selectedProduct = line.selectedProductId ? productById.get(line.selectedProductId) : null;

                            return (
                              <TableRow key={line.lineNo}>
                                <TableCell className="font-medium">{line.lineNo}</TableCell>
                                <TableCell>
                                  <p className="text-sm font-semibold leading-snug" title={line.sourceName}>
                                    {line.sourceName}
                                  </p>
                                  {shouldShowRawTextPreview(line.sourceName, line.rawText) && (
                                    <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                                      OCR: {line.rawText}
                                    </p>
                                  )}
                                </TableCell>

                                <TableCell>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={line.quantity}
                                    onChange={(event) =>
                                      setEditableLines((prev) =>
                                        prev.map((item) =>
                                          item.lineNo === line.lineNo ? { ...item, quantity: event.target.value } : item,
                                        ),
                                      )
                                    }
                                    disabled={isBusy}
                                    className={cn(!validation.hasValidQuantity && "border-destructive")}
                                  />
                                </TableCell>

                                <TableCell>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={line.unitCost}
                                    onChange={(event) =>
                                      setEditableLines((prev) =>
                                        prev.map((item) =>
                                          item.lineNo === line.lineNo ? { ...item, unitCost: event.target.value } : item,
                                        ),
                                      )
                                    }
                                    disabled={isBusy}
                                    className={cn(!validation.hasValidUnitCost && "border-destructive")}
                                  />
                                </TableCell>

                                <TableCell className="text-sm font-medium">
                                  {validation.lineTotal == null ? "-" : `${currency} ${validation.lineTotal.toFixed(2)}`}
                                </TableCell>

                                <TableCell>
                                  <Select
                                    value={line.selectedProductId || UNASSIGNED_PRODUCT_VALUE}
                                    onValueChange={(value) => {
                                      const selectedProductId =
                                        value === UNASSIGNED_PRODUCT_VALUE ? "" : value;

                                      setEditableLines((prev) =>
                                        prev.map((item) =>
                                          item.lineNo === line.lineNo
                                            ? {
                                                ...item,
                                                selectedProductId,
                                              }
                                            : item,
                                        ),
                                      );

                                      if (createProductDraft?.lineNo === line.lineNo && selectedProductId) {
                                        setCreateProductDraft(null);
                                      }
                                    }}
                                    disabled={isBusy || isCatalogLoading}
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue placeholder="Select product" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={UNASSIGNED_PRODUCT_VALUE}>Unassigned</SelectItem>
                                      {catalogProducts.map((product) => (
                                        <SelectItem key={product.id} value={product.id}>
                                          {product.name} ({product.sku})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  {selectedProduct && (
                                    <p className="mt-1 text-xs text-muted-foreground">Stock: {selectedProduct.stock.toFixed(3)}</p>
                                  )}

                                  {!line.selectedProductId && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="mt-1 h-7 px-2 text-xs"
                                      onClick={() => handleOpenCreateProduct(line)}
                                      disabled={isBusy}
                                    >
                                      <PackagePlus className="mr-1 h-3.5 w-3.5" />
                                      Create product for this line
                                    </Button>
                                  )}
                                </TableCell>

                                <TableCell>
                                  <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {getMatchBadge(line)}
                                      {line.reviewStatus === "needs_review" && (
                                        <Badge variant="outline" className="text-amber-700">
                                          Needs Review
                                        </Badge>
                                      )}
                                    </div>
                                    {line.matchMethod && (
                                      <p className="text-xs text-muted-foreground">
                                        Method: {line.matchMethod.replaceAll("_", " ")}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                      {line.matchScore != null && (
                                        <span>Score: {(line.matchScore * 100).toFixed(1)}%</span>
                                      )}
                                      {line.confidence != null && (
                                        <span>OCR: {(line.confidence * 100).toFixed(1)}%</span>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {createProductDraft && (
                      <div className="mt-4 rounded-md border border-dashed bg-muted/30 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">Create Product for Line {createProductDraft.lineNo}</p>
                            <p className="text-xs text-muted-foreground">
                              Save a new catalog product and auto-map it to this OCR line.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setCreateProductDraft(null)}
                              disabled={isCreatingProduct}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleCreateAndMapProduct()}
                              disabled={isCreatingProduct}
                            >
                              {isCreatingProduct ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Creating...
                                </>
                              ) : (
                                "Create & Map"
                              )}
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                          <div className="space-y-1 md:col-span-2">
                            <Label htmlFor="inline-new-product-name">Product Name</Label>
                            <Input
                              id="inline-new-product-name"
                              value={createProductDraft.name}
                              onChange={(event) =>
                                setCreateProductDraft((prev) =>
                                  prev ? { ...prev, name: event.target.value } : prev,
                                )
                              }
                              disabled={isCreatingProduct}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor="inline-new-product-sku">SKU (optional)</Label>
                            <Input
                              id="inline-new-product-sku"
                              value={createProductDraft.sku}
                              onChange={(event) =>
                                setCreateProductDraft((prev) =>
                                  prev ? { ...prev, sku: event.target.value } : prev,
                                )
                              }
                              disabled={isCreatingProduct}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor="inline-new-product-barcode">Barcode (optional)</Label>
                            <Input
                              id="inline-new-product-barcode"
                              value={createProductDraft.barcode}
                              onChange={(event) =>
                                setCreateProductDraft((prev) =>
                                  prev ? { ...prev, barcode: event.target.value } : prev,
                                )
                              }
                              disabled={isCreatingProduct}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor="inline-new-product-unit-price">Unit Price</Label>
                            <Input
                              id="inline-new-product-unit-price"
                              type="number"
                              min="0"
                              step="0.01"
                              value={createProductDraft.unitPrice}
                              onChange={(event) =>
                                setCreateProductDraft((prev) =>
                                  prev ? { ...prev, unitPrice: event.target.value } : prev,
                                )
                              }
                              disabled={isCreatingProduct}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor="inline-new-product-cost-price">Cost Price</Label>
                            <Input
                              id="inline-new-product-cost-price"
                              type="number"
                              min="0"
                              step="0.01"
                              value={createProductDraft.costPrice}
                              onChange={(event) =>
                                setCreateProductDraft((prev) =>
                                  prev ? { ...prev, costPrice: event.target.value } : prev,
                                )
                              }
                              disabled={isCreatingProduct}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor="inline-new-product-stock">Initial Stock</Label>
                            <Input
                              id="inline-new-product-stock"
                              type="number"
                              min="0"
                              step="0.01"
                              value={createProductDraft.initialStockQuantity}
                              onChange={(event) =>
                                setCreateProductDraft((prev) =>
                                  prev ? { ...prev, initialStockQuantity: event.target.value } : prev,
                                )
                              }
                              disabled={isCreatingProduct}
                            />
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor="inline-new-product-reorder">Reorder Level</Label>
                            <Input
                              id="inline-new-product-reorder"
                              type="number"
                              min="0"
                              step="0.01"
                              value={createProductDraft.reorderLevel}
                              onChange={(event) =>
                                setCreateProductDraft((prev) =>
                                  prev ? { ...prev, reorderLevel: event.target.value } : prev,
                                )
                              }
                              disabled={isCreatingProduct}
                            />
                          </div>
                        </div>

                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            onClick={() => void handleCreateAndMapProduct()}
                            disabled={isCreatingProduct}
                          >
                            {isCreatingProduct ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating...
                              </>
                            ) : (
                              "Create & Map Product"
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </section>

                  {requiresApprovalReason && (
                    <section className="rounded-lg border bg-card p-4">
                      <Label htmlFor="import-approval-reason">Approval Reason</Label>
                      <Textarea
                        id="import-approval-reason"
                        className="mt-2"
                        placeholder="Explain why this totals mismatch is acceptable."
                        value={approvalReason}
                        onChange={(event) => setApprovalReason(event.target.value)}
                        disabled={isBusy}
                      />
                    </section>
                  )}
                </>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="border-t px-6 py-4 sm:justify-between">
            <div className="space-y-1 text-xs text-muted-foreground">
              {draft ? (
                <div className="flex items-center">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  Draft {draft.draft_id.slice(0, 8)} ready for review
                </div>
              ) : (
                "Upload a file to start OCR import"
              )}
              {draft && !canConfirm && primaryConfirmBlocker && (
                <p className="text-amber-700">{primaryConfirmBlocker}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isBusy}>
                Cancel
              </Button>
              <Button onClick={() => void handleConfirmImport()} disabled={!canConfirm}>
                {isConfirming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  "Confirm Import"
                )}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
