import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeAlert, Hash, MoreHorizontal, PencilLine, Search, Trash2 } from "lucide-react";
import {
  addSerialNumbers,
  deleteSerialNumber,
  fetchProductCatalogItems,
  fetchSerialNumbers,
  lookupSerial,
  updateSerialNumber,
  type CatalogProduct,
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

export default function SerialNumbersTab() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [serials, setSerials] = useState<SerialNumberRecord[]>([]);
  const [loading, setLoading] = useState(false);

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

  const [deleteSerial, setDeleteSerial] = useState<SerialNumberRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

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
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium">{lookupResult.product_name}</div>
              <div className="text-muted-foreground">
                {lookupResult.serial_value} - {lookupResult.status}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Serial numbers</CardTitle>
          <div className="flex items-center gap-2">
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Warranty expiry</TableHead>
                  <TableHead>Sale</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serials.map((serial) => (
                  <TableRow key={serial.id}>
                    <TableCell className="font-mono text-xs">{serial.serial_value}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONES[serial.status]}>{serial.status}</Badge>
                    </TableCell>
                    <TableCell>{serial.warranty_expiry_date ? new Date(serial.warranty_expiry_date).toLocaleDateString() : "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {serial.sale_id ?? serial.refund_id ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Open serial actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenEdit(serial)}>
                            <PencilLine className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleMarkDefective(serial)}>
                            <BadgeAlert className="mr-2 h-4 w-4" />
                            Mark defective
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteSerial(serial)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
