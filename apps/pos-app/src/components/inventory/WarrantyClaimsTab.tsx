import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createWarrantyClaim,
  fetchSerialNumbers,
  fetchWarrantyClaims,
  lookupSerial,
  updateWarrantyClaim,
  type WarrantyClaim,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { ClaimsTable } from "./ClaimsTable";
import { TimelineDialog } from "./TimelineDialog";
import { HandoverDialog } from "./HandoverDialog";
import { ReceiveBackDialog } from "./ReceiveBackDialog";
import { ResolveDialog } from "./ResolveDialog";
import { RejectDialog } from "./RejectDialog";

export default function WarrantyClaimsTab() {
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [serialValue, setSerialValue] = useState("");
  const [serialId, setSerialId] = useState<string | null>(null);
  const [serialError, setSerialError] = useState<string | null>(null);
  const [claimDate, setClaimDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [active, setActive] = useState<WarrantyClaim | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [receiveBackOpen, setReceiveBackOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setClaims(
        await fetchWarrantyClaims({
          status,
          from_date: from || undefined,
          to_date: to || undefined,
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load warranty claims.");
    } finally {
      setLoading(false);
    }
  }, [from, status, to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const suppliers = useMemo(() => {
    const supplierSet = new Set<string>();
    claims.forEach((claim) => {
      if (claim.supplier_name) supplierSet.add(claim.supplier_name);
    });
    return Array.from(supplierSet).sort();
  }, [claims]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return claims.filter((claim) => {
      if (supplierFilter !== "all" && claim.supplier_name !== supplierFilter) return false;
      if (!query) return true;
      const haystack = `${claim.product_name} ${claim.serial_value}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [claims, search, supplierFilter]);

  const validateSerial = async () => {
    setSerialError(null);
    setSerialId(null);
    try {
      const res = await lookupSerial(serialValue.trim());
      const serials = await fetchSerialNumbers(res.product_id);
      const match = serials.find(
        (s) => s.serial_value.toLowerCase() === serialValue.trim().toLowerCase(),
      );
      if (!match) throw new Error("Serial not found");
      setSerialId(match.id);
    } catch (error) {
      setSerialError(error instanceof Error ? error.message : "Failed to validate serial.");
    }
  };

  const handleCreate = async () => {
    if (!serialId) return;
    setSaving(true);
    try {
      await createWarrantyClaim({
        serial_number_id: serialId,
        claim_date: claimDate,
        resolution_notes: notes || undefined,
      });
      setOpen(false);
      setSerialValue("");
      setSerialId(null);
      setNotes("");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create warranty claim.");
    } finally {
      setSaving(false);
    }
  };

  const handleHandover = async (data: {
    supplier_name?: string;
    handover_date?: string;
    pickup_person_name?: string;
  }) => {
    if (!active) return;
    try {
      await updateWarrantyClaim(active.id, { status: "InRepair", ...data });
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update warranty claim.");
    }
  };

  const handleReceiveBack = async (data: {
    received_back_date?: string;
    received_back_person_name?: string;
  }) => {
    if (!active) return;
    try {
      await updateWarrantyClaim(active.id, { status: "InRepair", ...data });
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update receive back details.");
    }
  };

  const handleResolve = async (data: {
    resolution_notes?: string;
  }) => {
    if (!active) return;
    try {
      await updateWarrantyClaim(active.id, { status: "Resolved", ...data });
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resolve warranty claim.");
    }
  };

  const handleReject = async (data: { resolution_notes?: string }) => {
    if (!active) return;
    try {
      await updateWarrantyClaim(active.id, { status: "Rejected", ...data });
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject warranty claim.");
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base">Warranty claims</CardTitle>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Product or serial..."
                  className="pl-9 w-[200px]"
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="InRepair">In repair</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Supplier</Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All suppliers</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier} value={supplier}>
                      {supplier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">New claim</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New warranty claim</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <Label>Serial number</Label>
                    <div className="flex gap-2">
                      <Input
                        value={serialValue}
                        onChange={(e) => {
                          setSerialValue(e.target.value);
                          setSerialId(null);
                        }}
                        placeholder="SN-XXX-001"
                      />
                      <Button variant="outline" onClick={validateSerial}>
                        Validate
                      </Button>
                    </div>
                    {serialError && <p className="text-xs text-destructive">{serialError}</p>}
                    {serialId && <p className="text-xs text-success">Serial validated</p>}
                  </div>
                  <div className="grid gap-1">
                    <Label>Claim date</Label>
                    <Input
                      type="date"
                      value={claimDate}
                      onChange={(e) => setClaimDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>Notes (optional)</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={!serialId || saving}>
                    {saving ? "Saving..." : "Create claim"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-10" />
              ))}
            </div>
          ) : (
            <ClaimsTable
              claims={filtered}
              onTimeline={(claim) => {
                setActive(claim);
                setTimelineOpen(true);
              }}
              onHandover={(claim) => {
                setActive(claim);
                setHandoverOpen(true);
              }}
              onReceiveBack={(claim) => {
                setActive(claim);
                setReceiveBackOpen(true);
              }}
              onResolve={(claim) => {
                setActive(claim);
                setResolveOpen(true);
              }}
              onReject={(claim) => {
                setActive(claim);
                setRejectOpen(true);
              }}
            />
          )}
        </CardContent>
      </Card>

      <TimelineDialog open={timelineOpen} onOpenChange={setTimelineOpen} claim={active} />
      <HandoverDialog
        open={handoverOpen}
        onOpenChange={setHandoverOpen}
        claim={active}
        onConfirm={handleHandover}
      />
      <ReceiveBackDialog
        open={receiveBackOpen}
        onOpenChange={setReceiveBackOpen}
        claim={active}
        onConfirm={handleReceiveBack}
      />
      <ResolveDialog
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        claim={active}
        onConfirm={handleResolve}
      />
      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        claim={active}
        onConfirm={handleReject}
      />
    </>
  );
}
