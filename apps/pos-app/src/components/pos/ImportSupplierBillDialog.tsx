import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Camera, CheckCircle2, FileText, Loader2, PackagePlus, ReceiptText, Search, Sparkles, UploadCloud } from "lucide-react";
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
  lineTotal: string;
  isLineTotalManual: boolean;
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

  const normalized = value.trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function toDecimalOrNull(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function getAutoLineTotal(quantity: string, unitCost: string) {
  const parsedQuantity = toDecimalOrNull(quantity);
  const parsedUnitCost = toDecimalOrNull(unitCost);

  if (parsedQuantity == null || parsedQuantity <= 0 || parsedUnitCost == null || parsedUnitCost < 0) {
    return null;
  }

  return Number((parsedQuantity * parsedUnitCost).toFixed(2));
}

function formatMoneyInput(value?: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return "";
  }

  return value.toFixed(2);
}

function formatFileSize(bytes?: number | null) {
  if (bytes == null || Number.isNaN(bytes)) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function toDraftLine(line: PurchaseOcrDraftLineItem): EditableLine {
  const sourceName = formatSupplierItemText(
    line.item_name?.trim() || line.raw_text?.trim() || `Line ${line.line_no}`,
  );
  const quantity = line.quantity == null ? "" : String(line.quantity);
  const unitCost = line.unit_cost == null ? "" : String(line.unit_cost);
  const computedLineTotal = getAutoLineTotal(quantity, unitCost);
  const extractedLineTotal = line.line_total == null ? null : Number(line.line_total);

  return {
    lineNo: line.line_no,
    sourceName,
    rawText: line.raw_text,
    quantity,
    unitCost,
    lineTotal: formatMoneyInput(extractedLineTotal ?? computedLineTotal),
    isLineTotalManual: false,
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
  const autoLineTotal = getAutoLineTotal(line.quantity, line.unitCost);
  const parsedLineTotal = line.lineTotal.trim() ? toDecimalOrNull(line.lineTotal) : autoLineTotal;

  const hasValidQuantity = quantity != null && quantity > 0;
  const hasValidUnitCost = unitCost != null && unitCost >= 0;
  const hasValidLineTotal = parsedLineTotal != null && parsedLineTotal >= 0;

  return {
    quantity,
    unitCost,
    lineTotal: hasValidLineTotal && parsedLineTotal != null ? Number(parsedLineTotal.toFixed(2)) : null,
    hasValidQuantity,
    hasValidUnitCost,
    hasValidLineTotal,
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

function formatBlockedReason(reason: string) {
  return reason
    .replaceAll("_", " ")
    .replace(/\bocr\b/gi, "OpenAI extraction")
    .replace(/\bai\b/gi, "AI");
}

export default function ImportSupplierBillDialog({ open, onOpenChange, onImported }: ImportSupplierBillDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [supplierHint, setSupplierHint] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraFeedback, setCameraFeedback] = useState<string | null>(null);

  const isBusy = isUploading || isConfirming || isCreatingProduct || cameraStarting;

  const stopCameraStream = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  }, []);

  const closeCamera = useCallback(() => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraStarting(false);
  }, [stopCameraStream]);

  useEffect(() => {
    if (!selectedFile) {
      setIsPreviewOpen(false);
      setPreviewUrl(null);
      return;
    }

    setIsPreviewOpen(false);
    const reader = new FileReader();
    let isActive = true;

    reader.onload = () => {
      if (!isActive) {
        return;
      }

      setPreviewUrl(typeof reader.result === "string" ? reader.result : null);
    };

    reader.onerror = () => {
      if (!isActive) {
        return;
      }

      setPreviewUrl(null);
    };

    reader.readAsDataURL(selectedFile);

    return () => {
      isActive = false;
    };
  }, [selectedFile]);

  useEffect(() => {
    if (!open) {
      closeCamera();
      setCameraFeedback(null);
    }
  }, [closeCamera, open]);

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

  useEffect(() => {
    if (!cameraOpen || !cameraStreamRef.current || !cameraVideoRef.current) {
      return;
    }

    const video = cameraVideoRef.current;
    video.srcObject = cameraStreamRef.current;
    void video.play().catch(() => {
      setCameraFeedback("Unable to start camera preview.");
    });
  }, [cameraOpen]);

  const productById = useMemo(
    () => new Map(catalogProducts.map((product) => [product.id, product])),
    [catalogProducts],
  );

  const lineSummaries = useMemo(
    () => editableLines.map((line) => ({ line, validation: getLineValidation(line) })),
    [editableLines],
  );

  const selectedFileTypeLabel = useMemo(() => {
    if (!selectedFile) {
      return "";
    }

    if (selectedFile.type === "application/pdf") {
      return "PDF";
    }

    if (selectedFile.type.startsWith("image/")) {
      return selectedFile.type.replace("image/", "").toUpperCase();
    }

    return selectedFile.type || "FILE";
  }, [selectedFile]);

  const SelectedFileIcon = selectedFile?.type === "application/pdf" ? ReceiptText : FileText;

  const unresolvedLineCount = useMemo(
    () => editableLines.filter((line) => !line.selectedProductId).length,
    [editableLines],
  );

  const invalidLineCount = useMemo(
    () =>
      lineSummaries.filter(
        (item) =>
          !item.validation.hasValidQuantity ||
          !item.validation.hasValidUnitCost ||
          !item.validation.hasValidLineTotal,
      ).length,
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

  const extractionWarnings = useMemo(() => {
    if (!draft) {
      return [];
    }

    return Array.from(
      new Set(
        (draft.warnings || [])
          .map((warning) => warning?.trim())
          .filter((warning): warning is string => Boolean(warning)),
      ),
    );
  }, [draft]);

  const providerUnavailableWarning = useMemo(
    () =>
      extractionWarnings.find(
        (warning) =>
          warning.toLowerCase().includes("openai") ||
          warning.toLowerCase().includes("provider") ||
          warning.toLowerCase().includes("timeout") ||
          warning.toLowerCase().includes("http"),
      ) ?? null,
    [extractionWarnings],
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
      blockers.push("Upload and scan a supplier bill first.");
    }

    if (draft?.blocked_reasons.includes("ocr_provider_unavailable") && providerUnavailableWarning) {
      blockers.push(providerUnavailableWarning);
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
        `${invalidLineCount} line${invalidLineCount === 1 ? "" : "s"} have invalid quantity, unit cost, or line total.`,
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
    providerUnavailableWarning,
    requiresApprovalReason,
    supplierName,
    unresolvedLineCount,
  ]);

  const primaryConfirmBlocker = confirmBlockers[0] ?? null;

  const updateLineField = useCallback(
    (lineNo: number, updater: (line: EditableLine) => EditableLine) => {
      setEditableLines((previous) =>
        previous.map((line) => (line.lineNo === lineNo ? updater(line) : line)),
      );
    },
    [],
  );

  const resetState = () => {
    setSelectedFile(null);
    setSupplierHint("");
    setIsDragOver(false);
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

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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

      const firstWarning = response.warnings?.find((warning) => warning?.trim());
      if (response.line_items.length === 0) {
        if (firstWarning) {
          toast.warning(firstWarning);
        } else {
          toast.warning("No line items detected. Manual review is required.");
        }
      } else if (response.review_required) {
        toast.warning("Bill extracted with review required. Please verify all mapped lines.");
      } else {
        toast.success("Bill scanned. Review and confirm the import.");
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof ApiError ? error.message : "Failed to scan supplier bill.";
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] || null);
  };

  const handleDropzoneDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (!isBusy) {
      setIsDragOver(true);
    }
  };

  const handleDropzoneDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDropzoneDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    if (isBusy) {
      return;
    }

    setSelectedFile(event.dataTransfer.files?.[0] || null);
  };

  const handleRemoveSelectedFile = () => {
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePreviewSelectedFile = () => {
    if (!selectedFile) {
      return;
    }

    setIsPreviewOpen((current) => !current);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const openCameraPicker = useCallback(async () => {
    if (isBusy || cameraStarting) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraFeedback("Camera preview is unavailable in this browser.");
      return;
    }

    setCameraFeedback(null);
    setCameraOpen(true);
    setCameraStarting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      cameraStreamRef.current = stream;

      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        await cameraVideoRef.current.play();
      }

      setCameraFeedback("Camera is active. Capture the bill when ready.");
    } catch (error) {
      console.error(error);
      const errorName = error instanceof DOMException ? error.name : "";

      if (errorName === "NotAllowedError") {
        setCameraFeedback("Camera permission was denied. Allow access and try again.");
      } else if (errorName === "NotFoundError") {
        setCameraFeedback("No camera device was found on this system.");
      } else if (errorName === "NotReadableError") {
        setCameraFeedback("Camera is currently in use by another app.");
      } else if (errorName === "SecurityError") {
        setCameraFeedback("Camera access requires a secure context (HTTPS).");
      } else {
        setCameraFeedback("Unable to open the camera right now.");
      }

      closeCamera();
    } finally {
      setCameraStarting(false);
    }
  }, [cameraStarting, closeCamera, isBusy]);

  const captureCameraImage = useCallback(async () => {
    const video = cameraVideoRef.current;
    if (!video) {
      toast.error("Camera preview is not ready.");
      return;
    }

    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight) {
      toast.error("Camera frame is not ready yet.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoWidth;
    canvas.height = videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      toast.error("Unable to capture the camera image.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/png");
    });

    if (!blob) {
      toast.error("Unable to capture the camera image.");
      return;
    }

    const file = new File([blob], `supplier-bill-${Date.now()}.png`, { type: "image/png" });
    setSelectedFile(file);
    setCameraFeedback("Bill captured from camera.");
    closeCamera();
  }, [closeCamera]);

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
        brand_id: null,
        unit_price: unitPrice,
        cost_price: costPrice,
        initial_stock_quantity: initialStockQuantity,
        reorder_level: reorderLevel,
        safety_stock: 0,
        target_stock_level: 0,
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
          "w-[96vw] max-w-[96vw] gap-0 overflow-hidden rounded-3xl border-slate-200 bg-slate-50 p-0 shadow-2xl sm:max-w-[min(1280px,96vw)]",
          draft ? "h-[94vh]" : "max-h-[90vh]",
          "[&>button]:right-6 [&>button]:top-6 [&>button]:z-20 [&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:border [&>button]:border-border [&>button]:bg-background/90 [&>button]:p-0 [&>button]:shadow-sm",
        )}
      >
        <div className="flex min-h-0 h-full flex-col">
          <div className="border-b border-slate-200 bg-gradient-to-b from-white via-white to-slate-50 px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="text-left">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
                    <ReceiptText className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <DialogTitle className="text-2xl">Import Supplier Bill</DialogTitle>
                    <DialogDescription className="max-w-2xl text-sm sm:text-base">
                      Upload a supplier bill, review detected items, and confirm stock intake.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
              <section className="grid gap-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                  <div
                    className={cn(
                      "rounded-3xl border-2 border-dashed p-5 transition-all sm:p-6",
                      isDragOver && "border-primary bg-primary/5 shadow-[0_0_0_4px_rgba(59,130,246,0.08)]",
                      selectedFile && !isDragOver && "border-emerald-200 bg-emerald-50/40",
                      !selectedFile && !isDragOver && "border-slate-200 bg-slate-50/70",
                    )}
                    onDragEnter={handleDropzoneDragOver}
                    onDragOver={handleDropzoneDragOver}
                    onDragLeave={handleDropzoneDragLeave}
                    onDrop={handleDropzoneDrop}
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-1 items-start gap-4 text-left">
                        <div
                          className={cn(
                            "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border text-primary shadow-sm",
                            isDragOver ? "border-primary/30 bg-primary/10" : "border-slate-200 bg-white",
                            isUploading && "animate-pulse",
                          )}
                        >
                          <UploadCloud className="h-8 w-8" />
                        </div>

                        <div className="min-w-0 space-y-2">
                          <div className="space-y-1">
                            <p className="text-lg font-semibold text-foreground sm:text-xl">
                              Upload your supplier bill
                            </p>
                            <p className="text-sm text-muted-foreground sm:text-base">
                              Drag and drop your bill here, tap to browse, or open camera to capture
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="rounded-full bg-background">
                              PDF
                            </Badge>
                            <Badge variant="outline" className="rounded-full bg-background">
                              PNG
                            </Badge>
                            <Badge variant="outline" className="rounded-full bg-background">
                              JPG
                            </Badge>
                            <span>Supports PDF, PNG, and JPG files</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                        <Button
                          type="button"
                          variant="outline"
                          size="lg"
                          onClick={openFilePicker}
                          disabled={isBusy}
                          className="min-h-11 px-5"
                        >
                          <UploadCloud className="h-4 w-4" />
                          Browse files
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="lg"
                          onClick={() => void openCameraPicker()}
                          disabled={isBusy || cameraStarting}
                          className="min-h-11 px-5"
                        >
                          <Camera className="h-4 w-4" />
                          Open Camera
                        </Button>
                        <Button
                          type="button"
                          size="lg"
                          onClick={() => void handleUploadDraft()}
                          disabled={!selectedFile || isUploading || isConfirming}
                          className="min-h-11 px-5"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <Search className="h-4 w-4" />
                              Upload and Scan
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      id="supplier-bill-file"
                      type="file"
                      accept={ACCEPTED_FILE_TYPES}
                      disabled={isBusy}
                      onChange={handleFileInputChange}
                      className="sr-only"
                    />
                    <Label htmlFor="supplier-bill-file" className="sr-only">
                      Upload your supplier bill
                    </Label>

                    {cameraOpen && (
                      <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-sm">
                        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
                          <div>
                            <p className="text-sm font-semibold">Camera capture</p>
                            <p className="text-xs text-white/70">
                              Point the camera at the supplier bill and capture a clear image.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {cameraStarting && (
                              <span className="text-[11px] text-white/70">Opening camera...</span>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                closeCamera();
                                setCameraFeedback("Camera closed.");
                              }}
                              className="h-8 rounded-lg border-white/20 bg-white/10 px-3 text-white hover:bg-white/20 hover:text-white"
                            >
                              Close
                            </Button>
                          </div>
                        </div>

                        <div className="bg-black">
                          <video
                            ref={cameraVideoRef}
                            className="h-[320px] w-full object-cover sm:h-[380px]"
                            muted
                            autoPlay
                            playsInline
                          />
                        </div>

                        <div className="flex flex-col gap-3 border-t border-white/10 bg-slate-950 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs text-white/70" role="status" aria-live="polite">
                            {cameraFeedback || "Camera ready."}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                closeCamera();
                                void openCameraPicker();
                              }}
                              disabled={cameraStarting || isBusy}
                              className="h-9 rounded-lg border-white/20 bg-white/10 px-3 text-white hover:bg-white/20 hover:text-white"
                            >
                              Retake
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void captureCameraImage()}
                              disabled={cameraStarting}
                              className="h-9 rounded-lg px-3"
                            >
                              <Camera className="h-4 w-4" />
                              Capture Photo
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)]">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        {selectedFile ? (
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={handlePreviewSelectedFile}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  handlePreviewSelectedFile();
                                }
                              }}
                              className="flex min-w-0 items-start gap-4 rounded-2xl outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-primary/40"
                            >
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <SelectedFileIcon className="h-6 w-6" />
                              </div>
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-foreground">{selectedFile.name}</p>
                                  {selectedFileTypeLabel && (
                                    <Badge variant="secondary" className="rounded-full">
                                      {selectedFileTypeLabel}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {formatFileSize(selectedFile.size)}
                                  {selectedFile.type ? ` - ${selectedFile.type}` : ""}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Ready to scan. You can change or remove this file before importing.
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={openFilePicker}
                                disabled={isBusy}
                                className="h-10 px-4"
                              >
                                Change file
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleRemoveSelectedFile}
                                disabled={isBusy}
                                className="h-10 px-4"
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                              <FileText className="h-6 w-6" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-foreground">No file selected yet</p>
                              <p className="text-sm text-muted-foreground">
                                Choose a bill from your device or drop it into the upload area to begin.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <span className="absolute inset-0 rounded-full border border-primary/15 animate-ping opacity-30" />
                            <Sparkles className="h-7 w-7 animate-pulse" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                              {!draft
                                ? "Upload a supplier bill to get started"
                                : draft.blocked_reasons.includes("ocr_provider_unavailable")
                                  ? "OpenAI extraction unavailable - manual review required"
                                  : editableLines.length === 0
                                    ? "No line items detected - manual mapping required"
                                    : "Bill scanned and ready for review"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {!draft
                                ? "Drag and drop your bill or tap browse to begin."
                                : draft.blocked_reasons.includes("ocr_provider_unavailable")
                                  ? "Check extraction warning details below, then retry upload or continue manually."
                                  : "Review detected items and confirm stock intake."}
                            </p>
                          </div>
                        </div>
                      </div>
                      {selectedFile && isPreviewOpen && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-foreground">Bill preview</p>
                              <p className="text-xs text-muted-foreground">
                                Review the uploaded bill here before scanning.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setIsPreviewOpen(false)}
                              disabled={isBusy}
                              className="h-9 px-3"
                            >
                              Close
                            </Button>
                          </div>
                          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                            {previewUrl ? (
                              selectedFile.type === "application/pdf" ? (
                                <iframe
                                  src={previewUrl}
                                  title="Supplier bill preview"
                                  className="h-[280px] w-full border-0 bg-white"
                                />
                              ) : (
                                <img
                                  src={previewUrl}
                                  alt="Supplier bill preview"
                                  className="h-[280px] w-full object-contain bg-white"
                                />
                              )
                            ) : (
                              <div className="flex h-[280px] items-center justify-center px-4 text-sm text-muted-foreground">
                                Loading preview...
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {draft && (
                <>
                  <section className="hidden grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-muted-foreground">Bill Overview</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant={draft.review_required ? "secondary" : "default"}>
                          {draft.status.replaceAll("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Scan: {draft.scan_status}</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-muted-foreground">Item Overview</p>
                      <p className="mt-1 text-sm font-medium">
                        {editableLines.length} lines, {unresolvedLineCount} unmapped, {invalidLineCount} invalid
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-muted-foreground">Computed Total</p>
                      <p className="mt-1 text-sm font-medium">
                        {currency} {computedSubtotal.toFixed(2)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-muted-foreground">Variance Check</p>
                      <p
                        className={cn(
                          "mt-1 text-sm font-medium",
                          draft.totals.within_tolerance ? "text-emerald-600" : "text-amber-600",
                        )}
                      >
                        Range {draft.totals.difference.toFixed(2)} / Limit {draft.totals.tolerance.toFixed(2)}
                      </p>
                    </div>
                  </section>

                  {(extractionWarnings.length > 0 || draft.blocked_reasons.length > 0) && (
                    <section
                      className={cn(
                        "rounded-2xl border p-4 shadow-sm",
                        draft.blocked_reasons.includes("ocr_provider_unavailable")
                          ? "border-amber-200 bg-amber-50/60"
                          : "border-slate-200 bg-slate-50/70",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-foreground">Extraction diagnostics</span>
                        {draft.extraction_provider && (
                          <Badge variant="outline" className="rounded-full">
                            Provider: {draft.extraction_provider}
                          </Badge>
                        )}
                        {draft.extraction_model && (
                          <Badge variant="outline" className="rounded-full">
                            Model: {draft.extraction_model}
                          </Badge>
                        )}
                      </div>

                      {extractionWarnings.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                          {extractionWarnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      )}

                      {draft.blocked_reasons.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {draft.blocked_reasons.map((reason) => (
                            <Badge key={reason} variant="secondary" className="rounded-full">
                              {formatBlockedReason(reason)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Bill Details</h3>
                        <p className="text-xs text-muted-foreground">
                          Review and edit the supplier and totals before exporting to inventory.
                        </p>
                      </div>
                      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                        <Switch
                          id="import-update-cost-price"
                          checked={updateCostPrice}
                          onCheckedChange={setUpdateCostPrice}
                          disabled={isBusy}
                        />
                        <Label htmlFor="import-update-cost-price" className="text-sm font-medium">
                          Update product cost price
                        </Label>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor="import-supplier-name">Supplier</Label>
                        <Input
                          id="import-supplier-name"
                          value={supplierName}
                          onChange={(event) => setSupplierName(event.target.value)}
                          disabled={isBusy}
                          className={cn("h-11 rounded-xl bg-background", !supplierName.trim() && "border-destructive")}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="import-invoice-number">Invoice Number</Label>
                        <Input
                          id="import-invoice-number"
                          value={invoiceNumber}
                          onChange={(event) => setInvoiceNumber(event.target.value)}
                          disabled={isBusy}
                          className={cn("h-11 rounded-xl bg-background", !invoiceNumber.trim() && "border-destructive")}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="import-invoice-date">Invoice Date</Label>
                        <Input
                          id="import-invoice-date"
                          type="date"
                          value={invoiceDate}
                          onChange={(event) => setInvoiceDate(event.target.value)}
                          disabled={isBusy}
                          className="h-11 rounded-xl bg-background"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="import-currency">Currency</Label>
                        <Input
                          id="import-currency"
                          value={currency}
                          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                          disabled={isBusy}
                          className="h-11 rounded-xl bg-background uppercase"
                          maxLength={8}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="import-tax-total">Tax Total</Label>
                        <Input
                          id="import-tax-total"
                          type="number"
                          min="0"
                          step="0.01"
                          value={taxTotal}
                          onChange={(event) => setTaxTotal(event.target.value)}
                          disabled={isBusy}
                          className={cn(
                            "h-11 rounded-xl bg-background",
                            taxTotal.trim() && toDecimalOrNull(taxTotal) == null && "border-destructive",
                          )}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="import-grand-total">Grand Total</Label>
                        <Input
                          id="import-grand-total"
                          type="number"
                          min="0"
                          step="0.01"
                          value={grandTotal}
                          onChange={(event) => setGrandTotal(event.target.value)}
                          disabled={isBusy}
                          className={cn(
                            "h-11 rounded-xl bg-background",
                            grandTotal.trim() && toDecimalOrNull(grandTotal) == null && "border-destructive",
                          )}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        Computed subtotal: {currency} {computedSubtotal.toFixed(2)}
                      </span>
                      <span>
                        Draft total: {currency} {draft.totals.line_total_sum.toFixed(2)}
                      </span>
                    </div>
                  </section>

                  <section className="flex max-h-[62vh] flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">Item Review and Mapping</h3>
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

                    <div className="min-h-0 flex-1 overflow-auto rounded-2xl border">
                      <Table>
                        <TableHeader className="bg-slate-50 sticky top-0 z-10">
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
                                  <Textarea
                                    aria-label={`Supplier item for line ${line.lineNo}`}
                                    value={line.sourceName}
                                    onChange={(event) => {
                                      const nextSourceName = event.target.value;
                                      updateLineField(line.lineNo, (currentLine) => ({
                                        ...currentLine,
                                        sourceName: nextSourceName,
                                      }));
                                    }}
                                    disabled={isBusy}
                                    className="min-h-[88px] rounded-xl bg-background text-sm"
                                  />
                                  {shouldShowRawTextPreview(line.sourceName, line.rawText) && (
                                    <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                                      Detected text: {line.rawText}
                                    </p>
                                  )}
                                </TableCell>

                                <TableCell>
                                  <Input
                                    aria-label={`Quantity for line ${line.lineNo}`}
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={line.quantity}
                                    onChange={(event) => {
                                      const nextQuantity = event.target.value;
                                      updateLineField(line.lineNo, (currentLine) => {
                                        const autoLineTotal = getAutoLineTotal(nextQuantity, currentLine.unitCost);

                                        return {
                                          ...currentLine,
                                          quantity: nextQuantity,
                                          lineTotal: currentLine.isLineTotalManual
                                            ? currentLine.lineTotal
                                            : formatMoneyInput(autoLineTotal),
                                        };
                                      });
                                    }}
                                    disabled={isBusy}
                                    className={cn("h-11 rounded-xl bg-background", !validation.hasValidQuantity && "border-destructive")}
                                  />
                                </TableCell>

                                <TableCell>
                                  <Input
                                    aria-label={`Unit cost for line ${line.lineNo}`}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={line.unitCost}
                                    onChange={(event) => {
                                      const nextUnitCost = event.target.value;
                                      updateLineField(line.lineNo, (currentLine) => {
                                        const autoLineTotal = getAutoLineTotal(currentLine.quantity, nextUnitCost);

                                        return {
                                          ...currentLine,
                                          unitCost: nextUnitCost,
                                          lineTotal: currentLine.isLineTotalManual
                                            ? currentLine.lineTotal
                                            : formatMoneyInput(autoLineTotal),
                                        };
                                      });
                                    }}
                                    disabled={isBusy}
                                    className={cn("h-11 rounded-xl bg-background", !validation.hasValidUnitCost && "border-destructive")}
                                  />
                                </TableCell>

                                <TableCell>
                                  <Input
                                    aria-label={`Line total for line ${line.lineNo}`}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={line.lineTotal}
                                    onChange={(event) => {
                                      const nextLineTotal = event.target.value;
                                      updateLineField(line.lineNo, (currentLine) => {
                                        const autoLineTotal = getAutoLineTotal(
                                          currentLine.quantity,
                                          currentLine.unitCost,
                                        );

                                        return {
                                          ...currentLine,
                                          lineTotal:
                                            nextLineTotal.trim().length === 0
                                              ? formatMoneyInput(autoLineTotal)
                                              : nextLineTotal,
                                          isLineTotalManual: nextLineTotal.trim().length > 0,
                                        };
                                      });
                                    }}
                                    disabled={isBusy}
                                    className={cn("h-11 rounded-xl bg-background", !validation.hasValidLineTotal && "border-destructive")}
                                  />
                                </TableCell>

                                <TableCell>
                                  <Select
                                    value={line.selectedProductId || UNASSIGNED_PRODUCT_VALUE}
                                    onValueChange={(value) => {
                                      const selectedProductId =
                                        value === UNASSIGNED_PRODUCT_VALUE ? "" : value;

                                      updateLineField(line.lineNo, (currentLine) => ({
                                        ...currentLine,
                                        selectedProductId,
                                      }));

                                      if (createProductDraft?.lineNo === line.lineNo && selectedProductId) {
                                        setCreateProductDraft(null);
                                      }
                                    }}
                                    disabled={isBusy || isCatalogLoading}
                                  >
                                    <SelectTrigger className="h-11 rounded-xl">
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
                                      className="mt-1 h-9 px-2 text-xs"
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
                                        <span>Scan confidence: {(line.confidence * 100).toFixed(1)}%</span>
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
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">Create Product for Line {createProductDraft.lineNo}</p>
                            <p className="text-xs text-muted-foreground">
                              Save a new catalog product and auto-map it to this detected line.
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
                              className="h-11 rounded-xl bg-background"
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
                              className="h-11 rounded-xl bg-background"
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
                              className="h-11 rounded-xl bg-background"
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
                              className="h-11 rounded-xl bg-background"
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
                              className="h-11 rounded-xl bg-background"
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
                              className="h-11 rounded-xl bg-background"
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
                              className="h-11 rounded-xl bg-background"
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
                    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                      <Label htmlFor="import-approval-reason">Approval Reason</Label>
                      <Textarea
                        id="import-approval-reason"
                        className="mt-2 min-h-28 rounded-2xl"
                        placeholder="Add a short reason for approving this totals difference."
                        value={approvalReason}
                        onChange={(event) => setApprovalReason(event.target.value)}
                        disabled={isBusy}
                      />
                    </section>
                  )}
                </>
              )}
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
            <div className="flex w-full flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-1 text-sm text-muted-foreground md:max-w-[36rem]">
                {draft ? (
                  <div className="flex items-center gap-2 text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Bill draft {draft.draft_id.slice(0, 8)} ready for review</span>
                  </div>
                ) : (
                  "Upload a bill to start the import flow"
                )}
                {draft && !canConfirm && primaryConfirmBlocker && (
                  <p className="text-amber-700">{primaryConfirmBlocker}</p>
                )}
              </div>

              <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end md:w-auto md:flex-shrink-0">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => handleOpenChange(false)}
                  disabled={isBusy}
                  className="min-h-11 w-full px-6 sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  size="lg"
                  onClick={() => void handleConfirmImport()}
                  disabled={!canConfirm}
                  className="min-h-11 w-full whitespace-nowrap px-6 sm:w-auto"
                >
                  {isConfirming ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    "Confirm Import"
                  )}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
