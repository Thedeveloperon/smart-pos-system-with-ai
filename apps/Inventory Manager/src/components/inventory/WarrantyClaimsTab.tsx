import { useEffect, useState } from "react";
import {
  createWarrantyClaim,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert } from "lucide-react";

const STATUS_TONES: Record<string, string> = {
  Open: "bg-amber-100 text-amber-800",
  InRepair: "bg-blue-100 text-blue-800",
  Resolved: "bg-green-100 text-green-800",
  Rejected: "bg-red-100 text-red-800",
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

  const reload = () => {
    setLoading(true);
    fetchWarrantyClaims({
      status,
      from_date: from || undefined,
      to_date: to || undefined,
    })
      .then(setClaims)
      .finally(() => setLoading(false));
  };

  useEffect(reload, [status, from, to]);

  const validateSerial = async () => {
    setSerialError(null);
    setSerialId(null);
    try {
      const res = await lookupSerial(serialValue.trim());
      const { serials } = await import("@/lib/api").then(async (m) => ({
        serials: await m.fetchSerialNumbers(res.product_id),
      }));
      const match = serials.find(
        (s) => s.serial_value.toLowerCase() === serialValue.trim().toLowerCase(),
      );
      if (!match) throw new Error("Serial not found");
      setSerialId(match.id);
    } catch (e) {
      setSerialError((e as Error).message);
    }
  };

  const handleCreate = async () => {
    if (!serialId) return;
    setSaving(true);
    try {
      await createWarrantyClaim({
        serial_number_id: serialId,
        claim_date: claimDate,
        notes: notes || undefined,
      });
      setOpen(false);
      setSerialValue("");
      setSerialId(null);
      setNotes("");
      reload();
    } finally {
      setSaving(false);
    }
  };

  const transition = async (c: WarrantyClaim, next: WarrantyClaim["status"]) => {
    await updateWarrantyClaim(c.id, { status: next });
    reload();
  };

  const openResolve = (c: WarrantyClaim) => {
    setResolveTarget(c);
    setResolveNotes("");
    setResolveOpen(true);
  };

  const submitResolve = async () => {
    if (!resolveTarget) return;
    await updateWarrantyClaim(resolveTarget.id, {
      status: "Resolved",
      resolution_notes: resolveNotes || undefined,
    });
    setResolveOpen(false);
    reload();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
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
                    {serialId && <p className="text-xs text-green-600">Serial validated ✓</p>}
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
                    {saving ? "Saving…" : "Create claim"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : claims.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ShieldAlert className="mx-auto h-8 w-8 mb-2 opacity-50" />
              No claims match your filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resolution</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{new Date(c.claim_date).toLocaleDateString()}</TableCell>
                    <TableCell className="font-mono text-xs">{c.serial_value}</TableCell>
                    <TableCell>{c.product_name}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONES[c.status]}>{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {c.resolution_notes ?? "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {c.status === "Open" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => transition(c, "InRepair")}
                          >
                            In repair
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => transition(c, "Rejected")}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {c.status === "InRepair" && (
                        <Button size="sm" onClick={() => openResolve(c)}>
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
          <div className="grid gap-2">
            <Label>Resolution notes</Label>
            <Textarea
              rows={4}
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              placeholder="Replaced part, refunded, etc."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResolveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitResolve}>Mark resolved</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
