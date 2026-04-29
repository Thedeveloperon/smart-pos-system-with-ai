import { useEffect, useState } from "react";
import {
  completeStocktakeSession,
  createStocktakeSession,
  fetchStocktakeSessions,
  getStocktakeSession,
  startStocktakeSession,
  updateStocktakeItem,
  type StocktakeItem,
  type StocktakeSession,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { ClipboardList } from "lucide-react";

const STATUS_TONES: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  InProgress: "bg-info/15 text-info",
  Completed: "bg-success/15 text-success",
};

export default function StocktakeTab() {
  const [sessions, setSessions] = useState<StocktakeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<StocktakeSession | null>(null);
  const [items, setItems] = useState<StocktakeItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [readonlyMode, setReadonlyMode] = useState(false);

  const reload = () => {
    setLoading(true);
    fetchStocktakeSessions()
      .then(setSessions)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const openSession = async (s: StocktakeSession, readonly: boolean) => {
    const { session, items } = await getStocktakeSession(s.id);
    setActiveSession(session);
    setItems(items);
    setReadonlyMode(readonly);
    setSheetOpen(true);
  };

  const handleStart = async (s: StocktakeSession) => {
    await startStocktakeSession(s.id);
    reload();
  };

  const handleNew = async () => {
    const created = await createStocktakeSession();
    await startStocktakeSession(created.id);
    reload();
    openSession({ ...created, status: "InProgress" }, false);
  };

  const handleCount = async (item: StocktakeItem, value: string) => {
    const qty = Number(value);
    if (Number.isNaN(qty)) return;
    const updated = await updateStocktakeItem(item.session_id, item.id, qty);
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  };

  const handleComplete = async () => {
    if (!activeSession) return;
    await completeStocktakeSession(activeSession.id);
    setConfirmOpen(false);
    setSheetOpen(false);
    reload();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Stocktake sessions</CardTitle>
          <Button size="sm" onClick={handleNew}>
            New session
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <ClipboardList className="mx-auto h-8 w-8 mb-2 opacity-50" />
              No stocktake sessions yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Variances</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.id}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_TONES[s.status]}>{s.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(s.started_at).toLocaleString()}</TableCell>
                    <TableCell>
                      {s.completed_at ? new Date(s.completed_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">{s.item_count}</TableCell>
                    <TableCell className="text-right">{s.variance_count}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {s.status === "Draft" && (
                        <Button size="sm" onClick={() => handleStart(s)}>
                          Start
                        </Button>
                      )}
                      {s.status === "InProgress" && (
                        <Button size="sm" onClick={() => openSession(s, false)}>
                          Enter counts
                        </Button>
                      )}
                      {s.status === "Completed" && (
                        <Button size="sm" variant="outline" onClick={() => openSession(s, true)}>
                          View report
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

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {readonlyMode ? "Variance report" : "Enter counts"} —{" "}
              <span className="font-mono text-sm">{activeSession?.id}</span>
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">System</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const variance = it.variance_quantity ?? 0;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>{it.product_name}</TableCell>
                      <TableCell className="text-right">{it.system_quantity}</TableCell>
                      <TableCell className="text-right w-32">
                        {readonlyMode ? (
                          (it.counted_quantity ?? "—")
                        ) : (
                          <Input
                            type="number"
                            className="text-right"
                            defaultValue={it.counted_quantity ?? ""}
                            onBlur={(e) => handleCount(it, e.target.value)}
                          />
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          variance > 0 ? "text-success" : variance < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {it.counted_quantity == null
                          ? "—"
                          : variance > 0
                            ? `+${variance}`
                            : variance}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!readonlyMode && (
              <div className="flex justify-end mt-4">
                <Button onClick={() => setConfirmOpen(true)}>Complete session</Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this stocktake?</AlertDialogTitle>
            <AlertDialogDescription>
              Variances will be reconciled and stock movements created. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete}>Complete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
