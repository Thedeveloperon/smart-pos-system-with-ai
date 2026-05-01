import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_TONES: Record<string, string> = {
  Open: "bg-warning/15 text-warning-foreground",
  InRepair: "bg-info/15 text-info",
  Resolved: "bg-success/15 text-success",
  Rejected: "bg-destructive/15 text-destructive",
};

export default function WarrantyClaimsTab() {
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [serialValue, setSerialValue] = useState("");
  const [serialId, setSerialId] = useState<string | null>(null);
  const [serialError, setSerialError] = useState<string | null>(null);
  const [claimDate, setClaimDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<WarrantyClaim | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");

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

  const validateSerial = async () => {
    setSerialError(null);
    setSerialId(null);
    try {
      const result = await lookupSerial(serialValue.trim());
      const serials = await fetchSerialNumbers(result.product_id);
      const match = serials.find(
        (serial) => serial.serial_value.toLowerCase() === serialValue.trim().toLowerCase(),
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

  const transition = async (claim: WarrantyClaim, next: WarrantyClaim["status"]) => {
    try {
      await updateWarrantyClaim(claim.id, { status: next });
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update warranty claim.");
    }
  };

  const openResolve = (claim: WarrantyClaim) => {
    setResolveTarget(claim);
    setResolveNotes("");
    setResolveOpen(true);
  };

  const submitResolve = async () => {
    if (!resolveTarget) return;
    try {
      await updateWarrantyClaim(resolveTarget.id, {
        status: "Resolved",
        resolution_notes: resolveNotes || undefined,
      });
      setResolveOpen(false);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resolve warranty claim.");
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">Warranty claims</CardTitle>
          <div className="flex flex-wrap items-end gap-2">
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
                    <Input type="date" value={claimDate} onChange={(e) => setClaimDate(e.target.value)} />
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
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : claims.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ShieldAlert className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No warranty claims found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Claim date</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell className="font-mono text-xs">{claim.serial_value}</TableCell>
                    <TableCell>{claim.product_name}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONES[claim.status]}>{claim.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(claim.claim_date).toLocaleDateString()}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {claim.resolution_notes ?? "-"}
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      {claim.status === "Open" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => transition(claim, "InRepair")}>
                            In repair
                          </Button>
                          <Button size="sm" onClick={() => openResolve(claim)}>
                            Resolve
                          </Button>
                        </>
                      )}
                      {claim.status === "InRepair" && (
                        <Button size="sm" onClick={() => openResolve(claim)}>
                          Resolve
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve claim</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Resolution notes</Label>
              <Textarea value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitResolve}>Save resolution</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
