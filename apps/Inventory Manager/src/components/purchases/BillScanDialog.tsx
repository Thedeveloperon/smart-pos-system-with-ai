import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchProducts, fetchSuppliers, type Product, type Supplier } from "@/lib/api";
import {
  confirmPurchaseImport,
  createPurchaseOcrDraft,
  type PurchaseOcrDraftResponse,
} from "@/lib/purchases";
import { fmtCurrency } from "./utils";
import { cn } from "@/lib/utils";

type Step = "upload" | "review";

type ReviewLine = {
  line_number: number;
  raw_name: string;
  matched_product_id: string;
  matched_product_name: string;
  quantity: number;
  unit_cost: number;
  match_status: string;
  confidence: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const matchBadge: Record<string, { label: string; className: string }> = {
  matched: { label: "Matched", className: "bg-green-100 text-green-700" },
  needs_review: { label: "Review", className: "bg-amber-100 text-amber-700" },
  unmatched: { label: "Unmatched", className: "bg-red-100 text-red-700" },
};

export default function BillScanDialog({ open, onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [supplierHint, setSupplierHint] = useState("");
  const [draft, setDraft] = useState<PurchaseOcrDraftResponse | null>(null);
  const [scanning, setScanning] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [taxTotal, setTaxTotal] = useState("0");
  const [grandTotal, setGrandTotal] = useState("0");
  const [reviewLines, setReviewLines] = useState<ReviewLine[]>([]);
  const [approvalReason, setApprovalReason] = useState("");
  const [saving, setSaving] = useState(false);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep("upload");
    setFile(null);
    setSupplierHint("");
    setDraft(null);
    setReviewLines([]);
    setApprovalReason("");
    Promise.all([fetchSuppliers(), fetchProducts()]).then(([s, p]) => {
      setSuppliers(s);
      setProducts(p);
    });
  }, [open]);

  const handleScan = async () => {
    if (!file) {
      toast.error("Please choose a file.");
      return;
    }
    setScanning(true);
    try {
      const d = await createPurchaseOcrDraft(file, supplierHint || undefined);
      setDraft(d);
      setSupplierId(d.supplier_id ?? "");
      setInvoiceNumber(d.invoice_number);
      setInvoiceDate(d.invoice_date);
      setTaxTotal(String(d.tax_total));
      setGrandTotal(String(d.grand_total));
      setReviewLines(d.lines.map((l) => ({ ...l })));
      setStep("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  const update = (idx: number, patch: Partial<ReviewLine>) =>
    setReviewLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const lineSum = reviewLines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
  const grand = parseFloat(grandTotal) || 0;
  const tolerance = 0.5;
  const mismatch = Math.abs(lineSum + (parseFloat(taxTotal) || 0) - grand);
  const requiresApproval = mismatch > tolerance;

  const handleConfirm = async () => {
    if (!supplierId || !invoiceNumber) {
      toast.error("Supplier and invoice number required.");
      return;
    }
    if (reviewLines.some((l) => !l.matched_product_id)) {
      toast.error("All lines must be matched to a product.");
      return;
    }
    if (requiresApproval && !approvalReason) {
      toast.error("Provide an approval reason for the totals mismatch.");
      return;
    }
    setSaving(true);
    try {
      await confirmPurchaseImport({
        import_request_id: crypto.randomUUID(),
        draft_id: draft!.draft_id,
        supplier_id: supplierId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        tax_total: parseFloat(taxTotal) || 0,
        grand_total: grand,
        approval_reason: approvalReason || undefined,
        update_cost_price: true,
        items: reviewLines.map((l) => ({
          line_number: l.line_number,
          product_id: l.matched_product_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          line_total: l.quantity * l.unit_cost,
        })),
      });
      toast.success("Invoice confirmed — stock updated.");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to confirm.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" ? "Scan Supplier Invoice" : "Review Extracted Invoice"}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4">
            <label className="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/40">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
              <div className="mt-2 text-sm font-medium">
                {file ? file.name : "Drop supplier invoice here or click to browse"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG · max 10 MB</div>
              <input
                type="file"
                className="hidden"
                accept=".pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div>
              <Label>Supplier hint (optional)</Label>
              <Input
                value={supplierHint}
                onChange={(e) => setSupplierHint(e.target.value)}
                placeholder="e.g. MediCorp"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleScan} disabled={scanning || !file}>
                {scanning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" /> AI is reading…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1" /> Scan with AI
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.supplier_id} value={s.supplier_id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Invoice #</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
              </div>
              <div>
                <Label>Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Tax Total</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={taxTotal}
                    onChange={(e) => setTaxTotal(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Grand Total</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={grandTotal}
                    onChange={(e) => setGrandTotal(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            <h3 className="font-semibold">Line Items</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>AI Extracted</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="w-20">Qty</TableHead>
                  <TableHead className="w-24">Unit Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewLines.map((l, idx) => {
                  const cfg = matchBadge[l.match_status] ?? matchBadge.needs_review;
                  return (
                    <TableRow key={idx}>
                      <TableCell>{l.line_number}</TableCell>
                      <TableCell className="text-sm">{l.raw_name}</TableCell>
                      <TableCell>
                        <Select
                          value={l.matched_product_id}
                          onValueChange={(v) => {
                            const p = products.find((x) => x.id === v);
                            update(idx, {
                              matched_product_id: v,
                              matched_product_name: p?.name ?? "",
                              match_status: "matched",
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("border-0", cfg.className)}>
                          {cfg.label}
                          {l.confidence != null && ` · ${Math.round(l.confidence * 100)}%`}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={l.quantity}
                          onChange={(e) => update(idx, { quantity: Number(e.target.value) || 0 })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={l.unit_cost}
                          onChange={(e) => update(idx, { unit_cost: Number(e.target.value) || 0 })}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtCurrency(l.quantity * l.unit_cost)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {requiresApproval && (
              <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded p-3 text-sm space-y-2">
                <div>
                  Lines + tax total {fmtCurrency(lineSum + (parseFloat(taxTotal) || 0))} differs
                  from invoice grand total {fmtCurrency(grand)}.
                </div>
                <Textarea
                  placeholder="Approval reason (required)"
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  rows={2}
                />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>
                ← Back
              </Button>
              <Button onClick={handleConfirm} disabled={saving}>
                {saving ? "Saving..." : "Confirm & Update Stock"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
