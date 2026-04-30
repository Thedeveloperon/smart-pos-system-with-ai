import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cancelPurchaseOrder,
  fetchPurchaseOrders,
  fetchSuppliers,
  sendPurchaseOrder,
  type PurchaseOrder,
  type Supplier,
} from "@/lib/purchases";
import PurchaseOrderStatusBadge from "./PurchaseOrderStatusBadge";
import { fmtCurrency, fmtDate } from "./utils";
import PurchaseOrderSheet from "./PurchaseOrderSheet";
import ReceiveGoodsSheet from "./ReceiveGoodsSheet";

export default function PurchaseOrdersTab() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [sheetMode, setSheetMode] = useState<"create" | "edit" | "view" | null>(null);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receivePO, setReceivePO] = useState<PurchaseOrder | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<PurchaseOrder | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [orderItems, supplierItems] = await Promise.all([
        fetchPurchaseOrders({
          status: statusFilter === "all" ? undefined : statusFilter,
          supplier_id: supplierFilter === "all" ? undefined : supplierFilter,
        }),
        fetchSuppliers(),
      ]);
      setOrders(orderItems);
      setSuppliers(supplierItems);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load purchase orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, supplierFilter]);

  const handleSend = async (po: PurchaseOrder) => {
    try {
      await sendPurchaseOrder(po.id);
      toast.success(`PO ${po.po_number} sent to supplier.`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send PO.");
    }
  };

  const handleCancel = async (po: PurchaseOrder) => {
    try {
      await cancelPurchaseOrder(po.id);
      toast.success(`PO ${po.po_number} cancelled.`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel PO.");
    } finally {
      setConfirmCancel(null);
    }
  };

  const renderActions = (po: PurchaseOrder) => {
    const view = (
      <Button size="sm" variant="ghost" onClick={() => { setSelectedPO(po); setSheetMode("view"); }}>
        View
      </Button>
    );
    switch (po.status) {
      case "Draft":
        return (
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="outline" onClick={() => { setSelectedPO(po); setSheetMode("edit"); }}>
              Edit
            </Button>
            <Button size="sm" onClick={() => handleSend(po)}>Send</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(po)}>Cancel</Button>
          </div>
        );
      case "Sent":
        return (
          <div className="flex gap-1 justify-end">
            <Button size="sm" onClick={() => { setReceivePO(po); setReceiveOpen(true); }}>
              Receive Goods
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(po)}>Cancel</Button>
          </div>
        );
      case "PartiallyReceived":
        return (
          <div className="flex gap-1 justify-end">
            <Button size="sm" onClick={() => { setReceivePO(po); setReceiveOpen(true); }}>
              Receive More
            </Button>
            {view}
          </div>
        );
      default:
        return <div className="flex justify-end">{view}</div>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Sent">Sent</SelectItem>
              <SelectItem value="PartiallyReceived">Partial</SelectItem>
              <SelectItem value="Received">Received</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setSelectedPO(null); setSheetMode("create"); }}>
          <Plus className="h-4 w-4 mr-1" /> New Purchase Order
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>PO Date</TableHead>
                <TableHead>Expected Delivery</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Est. Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No purchase orders yet.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-semibold">{po.po_number}</TableCell>
                    <TableCell>{po.supplier_name}</TableCell>
                    <TableCell>{fmtDate(po.po_date)}</TableCell>
                    <TableCell>{fmtDate(po.expected_delivery_date)}</TableCell>
                    <TableCell><PurchaseOrderStatusBadge status={po.status} /></TableCell>
                    <TableCell className="text-right">{fmtCurrency(po.subtotal_estimate)}</TableCell>
                    <TableCell className="text-right">{renderActions(po)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {sheetMode && (
        <PurchaseOrderSheet
          open={!!sheetMode}
          mode={sheetMode}
          po={selectedPO ?? undefined}
          onClose={() => { setSheetMode(null); setSelectedPO(null); }}
          onSaved={() => { void load(); }}
        />
      )}

      {receiveOpen && receivePO && (
        <ReceiveGoodsSheet
          open={receiveOpen}
          po={receivePO}
          onClose={() => { setReceiveOpen(false); setReceivePO(null); }}
          onReceived={() => { void load(); }}
        />
      )}

      <AlertDialog open={!!confirmCancel} onOpenChange={(o) => !o && setConfirmCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel purchase order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel PO {confirmCancel?.po_number}. This action can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep PO</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmCancel && handleCancel(confirmCancel)}>
              Cancel PO
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
