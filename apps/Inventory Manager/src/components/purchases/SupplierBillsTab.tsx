import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  fetchPurchaseBills,
  fetchSuppliers,
  getPurchaseBill,
  type PurchaseBillDetail,
  type PurchaseBillSummary,
  type Supplier,
} from "@/lib/purchases";
import { fmtCurrency, fmtDate } from "./utils";
import { cn } from "@/lib/utils";
import ManualBillDialog from "./ManualBillDialog";
import BillScanDialog from "./BillScanDialog";

const sourceLabels: Record<string, { label: string; className: string }> = {
  manual: { label: "Manual", className: "bg-muted text-muted-foreground" },
  ocr_import: { label: "AI Scan", className: "bg-blue-100 text-blue-700" },
  po_receipt: { label: "PO Receipt", className: "bg-green-100 text-green-700" },
};

export default function SupplierBillsTab() {
  const [bills, setBills] = useState<PurchaseBillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [detailBill, setDetailBill] = useState<PurchaseBillDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [items, sup] = await Promise.all([
        fetchPurchaseBills({
          supplier_id: supplierFilter === "all" ? undefined : supplierFilter,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
        }),
        fetchSuppliers(),
      ]);
      setBills(items);
      setSuppliers(sup);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load bills.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierFilter, fromDate, toDate]);

  const openDetail = async (id: string) => {
    try {
      const detail = await getPurchaseBill(id);
      setDetailBill(detail);
      setDetailOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open bill.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Supplier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-[160px]" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-[160px]" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScanOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1" /> Scan with AI
          </Button>
          <Button onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Enter Manually
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>PO</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : bills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No bills yet.</TableCell>
                </TableRow>
              ) : (
                bills.map((b) => {
                  const cfg = sourceLabels[b.source_type] ?? sourceLabels.manual;
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-semibold">{b.invoice_number}</TableCell>
                      <TableCell>{b.supplier_name ?? "—"}</TableCell>
                      <TableCell>{fmtDate(b.invoice_date)}</TableCell>
                      <TableCell><Badge className={cn("border-0", cfg.className)}>{cfg.label}</Badge></TableCell>
                      <TableCell className="text-right">{fmtCurrency(b.grand_total)}</TableCell>
                      <TableCell>{b.purchase_order_number ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openDetail(b.id)}>View</Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={detailOpen} onOpenChange={(o) => { if (!o) { setDetailOpen(false); setDetailBill(null); } }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detailBill?.invoice_number}</SheetTitle>
          </SheetHeader>
          {detailBill && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Supplier: </span>{detailBill.supplier_name}</div>
                <div><span className="text-muted-foreground">Date: </span>{fmtDate(detailBill.invoice_date)}</div>
                <div><span className="text-muted-foreground">Source: </span>{detailBill.source_type}</div>
                <div><span className="text-muted-foreground">PO: </span>{detailBill.purchase_order_number ?? "—"}</div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailBill.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(item.unit_cost)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(item.line_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t pt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{fmtCurrency(detailBill.subtotal)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>{fmtCurrency(detailBill.tax_total)}</span></div>
                <div className="flex justify-between font-semibold text-base"><span>Grand Total</span><span>{fmtCurrency(detailBill.grand_total)}</span></div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ManualBillDialog open={manualOpen} onClose={() => setManualOpen(false)} onSaved={() => void load()} />
      <BillScanDialog open={scanOpen} onClose={() => setScanOpen(false)} onSaved={() => void load()} />
    </div>
  );
}
