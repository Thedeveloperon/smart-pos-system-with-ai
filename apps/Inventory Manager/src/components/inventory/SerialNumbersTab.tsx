import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  addSerialNumbers,
  deleteSerialNumber,
  fetchProducts,
  fetchSerialNumbers,
  lookupSerial,
  updateSerialNumber,
  type Product,
  type SerialLookupResult,
  type SerialNumberRecord,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Search, Hash, MoreHorizontal, BadgeAlert, PencilLine, Trash2 } from "lucide-react";

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
  const [products, setProducts] = useState<Product[]>([]);
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
    fetchProducts()
      .then((p) => {
        if (!alive) return;
        setProducts(p);
        const firstSerialProduct = p.find((x) => x.is_serial_tracked) ?? p[0];
        if (firstSerialProduct) setProductId(firstSerialProduct.id);
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
      const r = await lookupSerial(lookupValue.trim());
      setLookupResult(r);
    } catch (e) {
      setLookupError((e as Error).message);
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
              placeholder="Enter a serial number..."
              value={lookupValue}
              onChange={(e) => setLookupValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            />
            <Button onClick={handleLookup}>Look up</Button>
          </div>
          {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}
          {lookupResult && (
            <div className="grid gap-1 rounded-md border p-3 text-sm">
              <div>
                <span className="text-muted-foreground">Serial:</span>{" "}
                <span className="font-mono">{lookupResult.serial_value}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Product:</span> {lookupResult.product_name}
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge className={STATUS_TONES[lookupResult.status] ?? ""}>
                  {lookupResult.status}
                </Badge>
              </div>
              {lookupResult.sale_date && (
                <div>
                  <span className="text-muted-foreground">Sold:</span>{" "}
                  {new Date(lookupResult.sale_date).toLocaleDateString()}
                </div>
              )}
              {lookupResult.warranty_expiry_date && (
                <div>
                  <span className="text-muted-foreground">Warranty until:</span>{" "}
                  {new Date(lookupResult.warranty_expiry_date).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Serials by product</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm">Add serials</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Add serial numbers</DialogTitle>
                  <DialogDescription>
                    Paste serials individually or generate them from a start and end range.
                  </DialogDescription>
                </DialogHeader>
                <SerialInputList value={newSerials} onChange={setNewSerials} />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAdd} disabled={saving || newSerials.length === 0}>
                    {saving ? "Saving..." : `Add ${newSerials.length}`}
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
              No serials recorded for this product yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Warranty</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serials.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono">{s.serial_value}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONES[s.status] ?? ""}>{s.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {s.warranty_expiry_date
                        ? new Date(s.warranty_expiry_date).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open serial actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => void handleMarkDefective(s)}>
                            <BadgeAlert className="mr-2 h-4 w-4" />
                            Mark defective
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenEdit(s)}>
                            <PencilLine className="mr-2 h-4 w-4" />
                            Update
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteSerial(s)}
                          >
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

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditSerial(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Update serial</DialogTitle>
            <DialogDescription>
              Adjust the status or warranty date for the selected serial number.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Serial number</Label>
              <Input value={editSerial?.serial_value ?? ""} readOnly />
            </div>

            <div className="space-y-2">
              <Label htmlFor="serial-status">Status</Label>
              <Select
                value={editStatus}
                onValueChange={(value) => setEditStatus(value as SerialNumberRecord["status"])}
              >
                <SelectTrigger id="serial-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="warranty-expiry">Warranty expiry date</Label>
              <Input
                id="warranty-expiry"
                type="date"
                value={editWarrantyDate}
                onChange={(e) => setEditWarrantyDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEditOpen(false);
                setEditSerial(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSerial} disabled={updating || !editSerial}>
              {updating ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteSerial}
        onOpenChange={(open) => !open && setDeleteSerial(null)}
        onCancel={() => setDeleteSerial(null)}
        onConfirm={() => void handleDeleteSerial()}
        title="Delete serial?"
        description={
          deleteSerial
            ? `Delete ${deleteSerial.serial_value}? This cannot be undone.`
            : "Delete this serial? This cannot be undone."
        }
        confirmLabel="Delete"
        confirmVariant="destructive"
        confirmDisabled={deleting}
      />
    </div>
  );
}
