import { useEffect, useState } from "react";
import { useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  BadgeAlert,
  Hash,
  MoreHorizontal,
  PencilLine,
  Search,
  Trash2,
} from "lucide-react";
import {
  addSerialNumbers,
  deleteSerialNumber,
  fetchProductCatalogItems,
  fetchSerialHistory,
  fetchSerialNumbers,
  lookupSerial,
  replaceSerialNumber,
  updateSerialNumber,
  type CatalogProduct,
  type SerialHistoryItem,
  type SerialLookupResult,
  type SerialNumberRecord,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SerialInputList from "./SerialInputList";

const STATUS_TONES: Record<string, string> = {
  Available: "bg-success/15 text-success",
  Sold: "bg-info/15 text-info",
  Returned: "bg-warning/15 text-warning-foreground",
  Defective: "bg-destructive/15 text-destructive",
  UnderWarranty: "bg-primary/15 text-primary",
};

const STATUS_OPTIONS: SerialNumberRecord["status"][] = [
  "Available",
  "Sold",
  "Returned",
  "Defective",
  "UnderWarranty",
];

const toDateInputValue = (value?: string) => (value ? value.slice(0, 10) : "");

const toIsoDateString = (value: string) => {
  if (!value) return null;
  return `${value}T00:00:00.000Z`;
};

const formatDateTime = (value?: string) => {
  if (!value) return "-";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
};

const serialLookupResultToRecord = (result: SerialLookupResult): SerialNumberRecord => ({
  id: result.serial_id,
  product_id: result.product_id,
  serial_value: result.serial_value,
  status: result.status as SerialNumberRecord["status"],
  sale_id: result.sale_id,
  sale_item_id: result.sale_item_id,
  refund_id: result.refund_id,
  warranty_expiry_date: result.warranty_expiry_date,
  created_at: result.sale_date ?? new Date(0).toISOString(),
});

function SerialActionsMenu({
  serial,
  onEdit,
  onMarkDefective,
  onUnmarkDefective,
  onReplace,
  onHistory,
  onDelete,
}: {
  serial: SerialNumberRecord;
  onEdit: (serial: SerialNumberRecord) => void;
  onMarkDefective: (serial: SerialNumberRecord) => void;
  onUnmarkDefective: (serial: SerialNumberRecord) => void;
  onReplace: (serial: SerialNumberRecord) => void;
  onHistory: (serial: SerialNumberRecord) => void;
  onDelete: (serial: SerialNumberRecord) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open serial actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit(serial)}>
          <PencilLine className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onHistory(serial)}>
          <Search className="mr-2 h-4 w-4" />
          View history
        </DropdownMenuItem>
        {serial.status === "Defective" ? (
          <>
            <DropdownMenuItem onClick={() => onReplace(serial)}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Replace
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUnmarkDefective(serial)}>
              <BadgeAlert className="mr-2 h-4 w-4" />
              Unmark defective
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onClick={() => onMarkDefective(serial)}>
            <BadgeAlert className="mr-2 h-4 w-4" />
            Mark defective
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onDelete(serial)} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function SerialNumbersTab() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [serials, setSerials] = useState<SerialNumberRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | SerialNumberRecord["status"]>("all");
  const [warrantyFrom, setWarrantyFrom] = useState("");
  const [warrantyTo, setWarrantyTo] = useState("");

  const [lookupValue, setLookupValue] = useState("");
  const [lookupResult, setLookupResult] = useState<SerialLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [newSerials, setNewSerials] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editSerial, setEditSerial] = useState<SerialNumberRecord | null>(null);
  const [editStatus, setEditStatus] = useState<SerialNumberRecord["status"]>("Available");
  const [editWarrantyDate, setEditWarrantyDate] = useState("");
  const [updating, setUpdating] = useState(false);

  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceSerial, setReplaceSerial] = useState<SerialNumberRecord | null>(null);
  const [replaceValue, setReplaceValue] = useState("");
  const [replacing, setReplacing] = useState(false);

  const [deleteSerial, setDeleteSerial] = useState<SerialNumberRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySerial, setHistorySerial] = useState<SerialNumberRecord | null>(null);
  const [historyItems, setHistoryItems] = useState<SerialHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const filteredSerials = useMemo(() => {
    return serials.filter((serial) => {
      if (statusFilter !== "all" && serial.status !== statusFilter) {
        return false;
      }

      if (warrantyFrom || warrantyTo) {
        const warrantyDate = serial.warranty_expiry_date?.slice(0, 10);
        if (!warrantyDate) {
          return false;
        }
        if (warrantyFrom && warrantyDate < warrantyFrom) {
          return false;
        }
        if (warrantyTo && warrantyDate > warrantyTo) {
          return false;
        }
      }

      return true;
    });
  }, [serials, statusFilter, warrantyFrom, warrantyTo]);

  useEffect(() => {
    let alive = true;
    fetchProductCatalogItems(200, true)
      .then((items) => {
        if (!alive) return;
        setProducts(items);
        const firstSerialProduct = items.find((item) => item.isSerialTracked) ?? items[0];
        if (firstSerialProduct) {
          setProductId(firstSerialProduct.id);
        }
      })
      .catch((error) => {
        if (alive) {
          toast.error(error instanceof Error ? error.message : "Failed to load products.");
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!productId) return;
    let alive = true;
    setLoading(true);
    fetchSerialNumbers(productId)
      .then((items) => {
        if (alive) {
          setSerials(items);
        }
      })
      .catch((error) => {
        if (alive) {
          toast.error(error instanceof Error ? error.message : "Failed to load serial numbers.");
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  const handleLookup = async () => {
    setLookupError(null);
    setLookupResult(null);
    if (!lookupValue.trim()) return;
    try {
      const result = await lookupSerial(lookupValue.trim());
      setLookupResult(result);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Failed to lookup serial number.");
    }
  };

  const handleOpenEdit = (serial: SerialNumberRecord) => {
    setEditSerial(serial);
    setEditStatus(serial.status);
    setEditWarrantyDate(toDateInputValue(serial.warranty_expiry_date));
    setEditOpen(true);
  };

  const handleMarkDefective = async (serial: SerialNumberRecord) => {
    if (!productId) return;
    try {
      const updated = await updateSerialNumber(productId, serial.id, {
        status: "Defective",
        warranty_expiry_date: serial.warranty_expiry_date ?? null,
      });
      setSerials((prev) =>
        prev.map((current) => (current.id === serial.id ? { ...current, ...updated } : current)),
      );
      toast.success(`Marked ${serial.serial_value} as defective.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark serial defective.");
    }
  };

  const handleUnmarkDefective = async (serial: SerialNumberRecord) => {
    if (!productId) return;
    try {
      const updated = await updateSerialNumber(productId, serial.id, {
        status: "Available",
        warranty_expiry_date: serial.warranty_expiry_date ?? null,
      });
      setSerials((prev) =>
        prev.map((current) => (current.id === serial.id ? { ...current, ...updated } : current)),
      );
      toast.success(`Unmarked ${serial.serial_value} as defective.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unmark serial defective.");
    }
  };

  const handleSaveSerial = async () => {
    if (!productId || !editSerial) return;
    setUpdating(true);
    try {
      const updated = await updateSerialNumber(productId, editSerial.id, {
        status: editStatus,
        warranty_expiry_date: toIsoDateString(editWarrantyDate),
      });
      setSerials((prev) =>
        prev.map((serial) => (serial.id === editSerial.id ? { ...serial, ...updated } : serial)),
      );
      setEditOpen(false);
      setEditSerial(null);
      toast.success("Serial updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update serial number.");
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenReplace = (serial: SerialNumberRecord) => {
    setReplaceSerial(serial);
    setReplaceValue("");
    setReplaceOpen(true);
  };

  const handleOpenHistory = async (serial: SerialNumberRecord) => {
    setHistorySerial(serial);
    setHistoryItems([]);
    setHistoryLoading(true);
    setHistoryOpen(true);
    try {
      const response = await fetchSerialHistory(serial.id);
      setHistoryItems(response.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load serial history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleReplaceSerial = async () => {
    if (!productId || !replaceSerial) return;
    const nextValue = replaceValue.trim();
    if (!nextValue) {
      toast.error("New serial number is required.");
      return;
    }

    setReplacing(true);
    try {
      const updated = await replaceSerialNumber(productId, replaceSerial.id, {
        new_serial_value: nextValue,
      });
      setSerials((prev) =>
        prev.map((serial) => (serial.id === replaceSerial.id ? { ...serial, ...updated } : serial)),
      );
      setReplaceOpen(false);
      setReplaceSerial(null);
      setReplaceValue("");
      toast.success("Serial replaced.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to replace serial number.");
    } finally {
      setReplacing(false);
    }
  };

  const handleAdd = async () => {
    if (!productId || newSerials.length === 0) return;
    setSaving(true);
    try {
      const added = await addSerialNumbers(productId, newSerials);
      setSerials((prev) => [...prev, ...added]);
      setNewSerials([]);
      setAddOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add serial numbers.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSerial = async () => {
    if (!productId || !deleteSerial) return;
    setDeleting(true);
    try {
      await deleteSerialNumber(productId, deleteSerial.id);
      setSerials((prev) => prev.filter((serial) => serial.id !== deleteSerial.id));
      setDeleteSerial(null);
      toast.success("Serial deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete serial number.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" /> Serial lookup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search serial number..."
              value={lookupValue}
              onChange={(e) => setLookupValue(e.target.value)}
            />
            <Button onClick={handleLookup}>Lookup</Button>
          </div>
          {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}
          {lookupResult && (
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="space-y-1">
                <div className="font-medium">{lookupResult.product_name}</div>
                <div className="text-muted-foreground">
                  {lookupResult.serial_value} - {lookupResult.status}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenHistory(serialLookupResultToRecord(lookupResult))}
                >
                  View history
                </Button>
                <SerialActionsMenu
                  serial={serialLookupResultToRecord(lookupResult)}
                  onEdit={handleOpenEdit}
                  onMarkDefective={handleMarkDefective}
                  onUnmarkDefective={handleUnmarkDefective}
                  onReplace={handleOpenReplace}
                  onHistory={handleOpenHistory}
                  onDelete={setDeleteSerial}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Serial numbers</CardTitle>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => setNewSerials([])}>
                  Add serials
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add serial numbers</DialogTitle>
                  <DialogDescription>Paste serials or generate a range.</DialogDescription>
                </DialogHeader>
                <SerialInputList value={newSerials} onChange={setNewSerials} />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAdd} disabled={!productId || newSerials.length === 0 || saving}>
                    {saving ? "Saving..." : "Add serials"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Warranty from</Label>
              <Input type="date" value={warrantyFrom} onChange={(e) => setWarrantyFrom(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Warranty to</Label>
              <Input type="date" value={warrantyTo} onChange={(e) => setWarrantyTo(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : serials.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Hash className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No serial numbers found.
            </div>
          ) : filteredSerials.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Hash className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No serial numbers match your filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Purchase date/time</TableHead>
                  <TableHead>Warranty expiry</TableHead>
                  <TableHead>Sale</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSerials.map((serial) => (
                  <TableRow key={serial.id}>
                    <TableCell className="font-mono text-xs">{serial.serial_value}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONES[serial.status]}>{serial.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(serial.created_at)}</TableCell>
                    <TableCell>
                      {serial.warranty_expiry_date
                        ? new Date(serial.warranty_expiry_date).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {serial.sale_id ?? serial.refund_id ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenHistory(serial)}
                        >
                          View history
                        </Button>
                        <SerialActionsMenu
                          serial={serial}
                          onEdit={handleOpenEdit}
                          onMarkDefective={handleMarkDefective}
                          onUnmarkDefective={handleUnmarkDefective}
                          onReplace={handleOpenReplace}
                          onHistory={handleOpenHistory}
                          onDelete={setDeleteSerial}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit serial</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={(value) => setEditStatus(value as SerialNumberRecord["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Warranty expiry</Label>
              <Input
                type="date"
                value={editWarrantyDate}
                onChange={(e) => setEditWarrantyDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSerial} disabled={updating}>
              {updating ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) {
            setHistorySerial(null);
            setHistoryItems([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Serial history</DialogTitle>
            <DialogDescription>
              {historySerial
                ? `${historySerial.serial_value} · ${historySerial.status}`
                : "View sale, customer, and warranty events for this serial."}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-3">
              {historyLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-16" />
                  ))}
                </div>
              ) : historyItems.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No serial history available.
                </div>
              ) : (
                historyItems.map((item) => (
                  <div key={`${item.event_type}-${item.at}-${item.title}`} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-medium">{item.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(item.at).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {item.event_type.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    {item.description ? (
                      <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                    ) : null}
                    {item.customer_name ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Customer: {item.customer_name}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={replaceOpen}
        onOpenChange={(open) => {
          setReplaceOpen(open);
          if (!open) {
            setReplaceSerial(null);
            setReplaceValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace serial</DialogTitle>
            <DialogDescription>
              Replace the defective serial with a new serial number and mark it available again.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Current serial</Label>
              <Input value={replaceSerial?.serial_value ?? ""} readOnly />
            </div>
            <div className="grid gap-1">
              <Label>New serial</Label>
              <Input
                value={replaceValue}
                onChange={(e) => setReplaceValue(e.target.value)}
                placeholder="Enter replacement serial"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setReplaceOpen(false);
                setReplaceSerial(null);
                setReplaceValue("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleReplaceSerial} disabled={replacing || !replaceSerial}>
              {replacing ? "Replacing..." : "Replace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleteSerial != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteSerial(null);
          }
        }}
        title="Delete serial?"
        description={
          deleteSerial ? `Delete serial ${deleteSerial.serial_value}? This cannot be undone.` : ""
        }
        confirmText={deleting ? "Deleting..." : "Delete"}
        onConfirm={handleDeleteSerial}
        variant="destructive"
      />
    </div>
  );
}
