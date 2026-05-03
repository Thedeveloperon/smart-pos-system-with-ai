import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});
  const [savingItemIds, setSavingItemIds] = useState<Record<string, boolean>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [readonlyMode, setReadonlyMode] = useState(false);
  const [completing, setCompleting] = useState(false);
  const itemsRef = useRef<StocktakeItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const getPersistedCountValue = (countedQuantity?: number) =>
    countedQuantity == null ? "" : String(countedQuantity);

  const parseDraftCount = (value: string) => {
    if (value.trim() === "") return null;
    const qty = Number(value);
    return Number.isFinite(qty) ? qty : null;
  };

  const roundVariance = (countedQuantity: number, systemQuantity: number) =>
    Math.round((countedQuantity - systemQuantity) * 1000) / 1000;

  const syncSessionVarianceCount = (sessionId: string, nextItems: StocktakeItem[]) => {
    const varianceCount = nextItems.filter(
      (item) => item.variance_quantity != null && item.variance_quantity !== 0,
    ).length;
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId ? { ...session, variance_count: varianceCount } : session,
      ),
    );
  };

  const loadSessionItems = (loadedItems: StocktakeItem[]) => {
    itemsRef.current = loadedItems;
    setItems(loadedItems);
    setDraftCounts(
      Object.fromEntries(
        loadedItems.map((item) => [item.id, getPersistedCountValue(item.counted_quantity)]),
      ),
    );
  };

  const applyItemUpdate = (
    sessionId: string,
    updatedItem: Pick<StocktakeItem, "id" | "counted_quantity" | "variance_quantity">,
  ) => {
    const nextItems = itemsRef.current.map((item) =>
      item.id === updatedItem.id ? { ...item, ...updatedItem } : item,
    );
    itemsRef.current = nextItems;
    setItems(nextItems);
    syncSessionVarianceCount(sessionId, nextItems);
  };

  const reload = async () => {
    setLoading(true);
    try {
      setSessions(await fetchStocktakeSessions());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load stocktake sessions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const openSession = async (s: StocktakeSession, readonly: boolean) => {
    try {
      const { session, items: loadedItems } = await getStocktakeSession(s.id);
      setActiveSession(session);
      loadSessionItems(loadedItems);
      setReadonlyMode(readonly);
      setSheetOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to open stocktake session.");
    }
  };

  const handleStart = async (s: StocktakeSession) => {
    try {
      await startStocktakeSession(s.id);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start stocktake session.");
    }
  };

  const handleNew = async () => {
    try {
      const created = await createStocktakeSession();
      await startStocktakeSession(created.id);
      await reload();
      await openSession({ ...created, status: "InProgress" }, false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create stocktake session.");
    }
  };

  const handleCount = async (item: StocktakeItem, value: string) => {
    const currentItem = itemsRef.current.find((entry) => entry.id === item.id);
    if (!currentItem) return true;

    const persistedValue = getPersistedCountValue(currentItem.counted_quantity);
    const qty = parseDraftCount(value);
    if (qty == null) {
      if (value.trim() !== "") {
        toast.error("Enter a valid counted quantity.");
      }
      setDraftCounts((prev) => ({ ...prev, [item.id]: persistedValue }));
      return value.trim() === "";
    }

    if (!currentItem.session_id) {
      toast.error("Failed to update stocktake count. Refresh and try again.");
      setDraftCounts((prev) => ({ ...prev, [item.id]: persistedValue }));
      return false;
    }

    if (currentItem.counted_quantity === qty) {
      setDraftCounts((prev) => ({ ...prev, [item.id]: String(qty) }));
      return true;
    }

    setSavingItemIds((prev) => ({ ...prev, [item.id]: true }));
    try {
      const updated = await updateStocktakeItem(currentItem.session_id, item.id, qty);
      applyItemUpdate(currentItem.session_id, updated);
      setDraftCounts((prev) => ({
        ...prev,
        [item.id]: getPersistedCountValue(updated.counted_quantity),
      }));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update stocktake count.");
      setDraftCounts((prev) => ({ ...prev, [item.id]: persistedValue }));
      return false;
    } finally {
      setSavingItemIds((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleCountChange = (itemId: string, value: string) => {
    setDraftCounts((prev) => ({ ...prev, [itemId]: value }));
  };

  const flushDraftCounts = async () => {
    const results = await Promise.all(
      itemsRef.current.map((item) =>
        handleCount(item, draftCounts[item.id] ?? getPersistedCountValue(item.counted_quantity)),
      ),
    );
    return results.every(Boolean);
  };

  const handleComplete = async () => {
    if (!activeSession) return;
    setCompleting(true);
    try {
      const countsSaved = await flushDraftCounts();
      if (!countsSaved) return;
      await completeStocktakeSession(activeSession.id);
      setConfirmOpen(false);
      setSheetOpen(false);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to complete stocktake session.");
    } finally {
      setCompleting(false);
    }
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
                  const draftCount = draftCounts[it.id] ?? getPersistedCountValue(it.counted_quantity);
                  const parsedDraftCount = parseDraftCount(draftCount);
                  const countedQuantity = parsedDraftCount ?? it.counted_quantity ?? null;
                  const variance =
                    countedQuantity == null
                      ? null
                      : roundVariance(countedQuantity, it.system_quantity);
                  return (
                    <TableRow key={it.id}>
                      <TableCell>{it.product_name}</TableCell>
                      <TableCell className="text-right">{it.system_quantity}</TableCell>
                      <TableCell className="text-right w-32">
                        {readonlyMode ? (
                          countedQuantity ?? "—"
                        ) : (
                          <Input
                            type="number"
                            step="0.001"
                            className="text-right"
                            value={draftCount}
                            disabled={Boolean(savingItemIds[it.id]) || completing}
                            onChange={(e) => handleCountChange(it.id, e.target.value)}
                            onBlur={(e) => void handleCount(it, e.target.value)}
                          />
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          variance != null && variance > 0
                            ? "text-success"
                            : variance != null && variance < 0
                              ? "text-destructive"
                              : ""
                        }`}
                      >
                        {countedQuantity == null ? "—" : variance != null && variance > 0 ? `+${variance}` : variance}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!readonlyMode && (
              <div className="flex justify-end mt-4">
                <Button disabled={completing} onClick={() => setConfirmOpen(true)}>
                  Complete session
                </Button>
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
            <AlertDialogAction
              disabled={completing}
              onClick={(event) => {
                event.preventDefault();
                void handleComplete();
              }}
            >
              {completing ? "Completing..." : "Complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
