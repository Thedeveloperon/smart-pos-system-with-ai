import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addSerialNumbers,
  deleteSerialNumber,
  fetchSerialHistory,
  fetchProducts,
  fetchSerialNumbers,
  lookupSerial,
  replaceSerialNumber,
  updateSerialNumber,
  type Product,
  type SerialHistoryEvent,
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
import {
  ArrowLeftRight,
  Search,
  Hash,
  MoreHorizontal,
  BadgeAlert,
  PencilLine,
  Trash2,
} from "lucide-react";

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

export default function SerialNumbersTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [serials, setSerials] = useState<SerialNumberRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [lookupValue, setLookupValue] = useState("");
  const [lookupResult, setLookupResult] = useState<SerialLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupHistory, setLookupHistory] = useState<SerialHistoryEvent[]>([]);
  const [lookupHistoryLoading, setLookupHistoryLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"All" | SerialNumberRecord["status"]>("All");
  const [warrantyWindowFilter, setWarrantyWindowFilter] = useState<"All" | 30 | 60 | 90>("All");

  const [addOpen, setAddOpen] = useState(false);
  const [newSerials, setNewSerials] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editSerial, setEditSerial] = useState<SerialNumberRecord | null>(null);
  const [editProductId, setEditProductId] = useState<string>("");
  const [editStatus, setEditStatus] = useState<SerialNumberRecord["status"]>("Available");
  const [editWarrantyDate, setEditWarrantyDate] = useState("");
  const [updating, setUpdating] = useState(false);

  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceSerial, setReplaceSerial] = useState<SerialNumberRecord | null>(null);
  const [replaceProductId, setReplaceProductId] = useState<string>("");
  const [replaceValue, setReplaceValue] = useState("");
  const [replacing, setReplacing] = useState(false);

  const [deleteSerial, setDeleteSerial] = useState<SerialNumberRecord | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string>("");
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

  const filteredSerials = useMemo(() => {
    const now = new Date();
    const windowEnd =
      warrantyWindowFilter === "All"
        ? null
        : new Date(now.getTime() + warrantyWindowFilter * 24 * 60 * 60 * 1000);

    return serials.filter((serial) => {
      if (statusFilter !== "All" && serial.status !== statusFilter) {
        return false;
      }

      if (!windowEnd) {
        return true;
      }

      if (!serial.warranty_expiry_date) {
        return false;
      }

      const expiry = new Date(serial.warranty_expiry_date);
      if (Number.isNaN(expiry.getTime())) {
        return false;
      }

      return expiry >= now && expiry <= windowEnd;
    });
  }, [serials, statusFilter, warrantyWindowFilter]);

  const lookupAsSerialRecord = useMemo<SerialNumberRecord | null>(() => {
    if (!lookupResult) {
      return null;
    }

    return {
      id: lookupResult.serial_id,
      product_id: lookupResult.product_id,
      serial_value: lookupResult.serial_value,
      status: lookupResult.status as SerialNumberRecord["status"],
      sale_id: lookupResult.sale_id,
      sale_item_id: lookupResult.sale_item_id,
      refund_id: lookupResult.refund_id,
      warranty_expiry_date: lookupResult.warranty_expiry_date,
      created_at: lookupResult.created_at ?? new Date().toISOString(),
      updated_at: lookupResult.updated_at,
    };
  }, [lookupResult]);

  const handleLookup = async () => {
    setLookupError(null);
    setLookupResult(null);
    setLookupHistory([]);
    if (!lookupValue.trim()) return;
    try {
      const r = await lookupSerial(lookupValue.trim());
      setLookupResult(r);
      setLookupHistoryLoading(true);
      try {
        setLookupHistory(await fetchSerialHistory(r.serial_id));
      } finally {
        setLookupHistoryLoading(false);
      }
    } catch (e) {
      setLookupError((e as Error).message);
      setLookupHistoryLoading(false);
    }
  };

  const handleOpenEdit = (serial: SerialNumberRecord, targetProductId = productId) => {
    if (!targetProductId) return;
    setEditSerial(serial);
    setEditProductId(targetProductId);
    setEditStatus(serial.status);
    setEditWarrantyDate(toDateInputValue(serial.warranty_expiry_date));
    setEditOpen(true);
  };

  const handleMarkDefective = async (serial: SerialNumberRecord, targetProductId = productId) => {
    if (!targetProductId) return;
    try {
      const updated = await updateSerialNumber(targetProductId, serial.id, {
        status: "Defective",
        warranty_expiry_date: serial.warranty_expiry_date ?? null,
      });
      setSerials((prev) =>
        prev.map((current) => (current.id === serial.id ? { ...current, ...updated } : current)),
      );
      if (lookupResult?.serial_id === serial.id) {
        setLookupResult((previous) =>
          previous ? { ...previous, status: updated.status, warranty_expiry_date: updated.warranty_expiry_date } : previous,
        );
      }
      toast.success(`Marked ${serial.serial_value} as defective.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark serial defective.");
    }
  };

  const handleUnmarkDefective = async (
    serial: SerialNumberRecord,
    targetProductId = productId,
  ) => {
    if (!targetProductId) return;
    try {
      const updated = await updateSerialNumber(targetProductId, serial.id, {
        status: "Available",
        warranty_expiry_date: serial.warranty_expiry_date ?? null,
      });
      setSerials((prev) =>
        prev.map((current) => (current.id === serial.id ? { ...current, ...updated } : current)),
      );
      if (lookupResult?.serial_id === serial.id) {
        setLookupResult((previous) =>
          previous ? { ...previous, status: updated.status, warranty_expiry_date: updated.warranty_expiry_date } : previous,
        );
      }
      toast.success(`Unmarked ${serial.serial_value} as defective.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unmark serial defective.");
    }
  };

  const handleSaveSerial = async () => {
    if (!editProductId || !editSerial) return;
    setUpdating(true);
    try {
      const updated = await updateSerialNumber(editProductId, editSerial.id, {
        status: editStatus,
        warranty_expiry_date: toIsoDateString(editWarrantyDate),
      });
      setSerials((prev) =>
        prev.map((serial) => (serial.id === editSerial.id ? { ...serial, ...updated } : serial)),
      );
      setEditOpen(false);
      setEditSerial(null);
      setEditProductId("");
      if (lookupResult?.serial_id === editSerial.id) {
        setLookupResult((previous) =>
          previous
            ? {
                ...previous,
                status: updated.status,
                warranty_expiry_date: updated.warranty_expiry_date,
                updated_at: updated.updated_at,
              }
            : previous,
        );
      }
      toast.success("Serial updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update serial number.");
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenReplace = (serial: SerialNumberRecord, targetProductId = productId) => {
    if (!targetProductId) return;
    setReplaceSerial(serial);
    setReplaceProductId(targetProductId);
    setReplaceValue("");
    setReplaceOpen(true);
  };

  const handleReplaceSerial = async () => {
    if (!replaceProductId || !replaceSerial) return;
    const nextValue = replaceValue.trim();
    if (!nextValue) {
      toast.error("New serial number is required.");
      return;
    }

    setReplacing(true);
    try {
      const updated = await replaceSerialNumber(replaceProductId, replaceSerial.id, {
        new_serial_value: nextValue,
      });
      setSerials((prev) =>
        prev.map((serial) => (serial.id === replaceSerial.id ? { ...serial, ...updated } : serial)),
      );
      setReplaceOpen(false);
      setReplaceSerial(null);
      setReplaceProductId("");
      setReplaceValue("");
      if (lookupResult?.serial_id === replaceSerial.id) {
        setLookupResult((previous) =>
          previous
            ? {
                ...previous,
                serial_value: updated.serial_value,
                status: updated.status,
                warranty_expiry_date: updated.warranty_expiry_date,
                updated_at: updated.updated_at,
              }
            : previous,
        );
      }
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
    if (!deleteProductId || !deleteSerial) return;
    setDeleting(true);
    try {
      await deleteSerialNumber(deleteProductId, deleteSerial.id);
      setSerials((prev) => prev.filter((serial) => serial.id !== deleteSerial.id));
      if (lookupResult?.serial_id === deleteSerial.id) {
        setLookupResult(null);
      }
      setDeleteSerial(null);
      setDeleteProductId("");
      toast.success("Serial deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete serial number.");
    } finally {
      setDeleting(false);
    }
  };

  const renderSerialActions = (serial: SerialNumberRecord, serialProductId: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open serial actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleOpenEdit(serial, serialProductId)}>
          <PencilLine className="mr-2 h-4 w-4" />
          Update
        </DropdownMenuItem>
        {serial.status === "Defective" ? (
          <>
            <DropdownMenuItem onClick={() => handleOpenReplace(serial, serialProductId)}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Replace
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleUnmarkDefective(serial, serialProductId)}>
              <BadgeAlert className="mr-2 h-4 w-4" />
              Unmark defective
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onClick={() => void handleMarkDefective(serial, serialProductId)}>
            <BadgeAlert className="mr-2 h-4 w-4" />
            Mark defective
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => {
            setDeleteSerial(serial);
            setDeleteProductId(serialProductId);
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

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
          {lookupResult && lookupAsSerialRecord && (
            <div className="space-y-3 rounded-md border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="grid gap-1">
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
                {renderSerialActions(lookupAsSerialRecord, lookupResult.product_id)}
              </div>

              <div className="rounded-md border bg-muted/30 p-2">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Serial history
                </p>
                {lookupHistoryLoading ? (
                  <p className="text-xs text-muted-foreground">Loading history...</p>
                ) : lookupHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No history events found for this serial.</p>
                ) : (
                  <ul className="space-y-2">
                    {lookupHistory.map((event, index) => (
                      <li
                        key={`${event.event_type}-${event.at}-${index}`}
                        className="rounded border bg-background p-2"
                      >
                        <p className="text-xs font-medium">{event.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.at).toLocaleString()}
                        </p>
                        {event.description && <p className="text-xs">{event.description}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Serials by product</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
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
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as "All" | SerialNumberRecord["status"])
              }
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All statuses</SelectItem>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(warrantyWindowFilter)}
              onValueChange={(value) =>
                setWarrantyWindowFilter(value === "All" ? "All" : (Number(value) as 30 | 60 | 90))
              }
            >
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Warranty window" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All warranty windows</SelectItem>
                <SelectItem value="30">Expiring in 30 days</SelectItem>
                <SelectItem value="60">Expiring in 60 days</SelectItem>
                <SelectItem value="90">Expiring in 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatusFilter("All");
                setWarrantyWindowFilter("All");
              }}
            >
              Clear filters
            </Button>

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
          ) : filteredSerials.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Hash className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No serials found for the selected filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Purchase date/time</TableHead>
                  <TableHead>Warranty</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSerials.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono">{s.serial_value}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONES[s.status] ?? ""}>{s.status}</Badge>
                    </TableCell>
                    <TableCell>{formatDateTime(s.created_at)}</TableCell>
                    <TableCell>
                      {s.warranty_expiry_date
                        ? new Date(s.warranty_expiry_date).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {renderSerialActions(s, productId)}
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
            setEditProductId("");
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
                min={toDateInputValue(editSerial?.created_at)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEditOpen(false);
                setEditSerial(null);
                setEditProductId("");
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

      <Dialog
        open={replaceOpen}
        onOpenChange={(open) => {
          setReplaceOpen(open);
          if (!open) {
            setReplaceSerial(null);
            setReplaceProductId("");
            setReplaceValue("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Replace serial</DialogTitle>
            <DialogDescription>
              Replace the defective serial with a new serial number and mark it available again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Current serial</Label>
              <Input value={replaceSerial?.serial_value ?? ""} readOnly />
            </div>

            <div className="space-y-2">
              <Label htmlFor="replacement-serial">New serial</Label>
              <Input
                id="replacement-serial"
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
                setReplaceProductId("");
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
        open={!!deleteSerial}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteSerial(null);
            setDeleteProductId("");
          }
        }}
        onCancel={() => {
          setDeleteSerial(null);
          setDeleteProductId("");
        }}
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
