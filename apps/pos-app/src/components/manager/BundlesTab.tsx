import { useCallback, useEffect, useMemo, useState } from "react";
import { Package, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  fetchBundles,
  type Bundle,
} from "@/lib/api";
import BundleManagementDialog from "@/components/manager/BundleManagementDialog";
import ReceiveBundlesSheet from "@/components/manager/ReceiveBundlesSheet";
import AssembleBundlesSheet from "@/components/manager/AssembleBundlesSheet";
import BreakBundlesSheet from "@/components/manager/BreakBundlesSheet";

const currencyFormatter = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function BundlesTab() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [selectedBundle, setSelectedBundle] = useState<Bundle | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [assembleOpen, setAssembleOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);

  const loadBundles = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchBundles(query, 120, true);
      setBundles(rows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load bundles.");
      setBundles([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadBundles();
  }, [loadBundles]);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return bundles;
    }

    const normalized = query.trim().toLowerCase();
    return bundles.filter((bundle) =>
      [bundle.name, bundle.barcode ?? "", bundle.description ?? ""].join(" ").toLowerCase().includes(normalized),
    );
  }, [bundles, query]);

  const handleSaved = (bundle: Bundle) => {
    setBundles((prev) => {
      const index = prev.findIndex((item) => item.id === bundle.id);
      if (index < 0) {
        return [bundle, ...prev];
      }

      return prev.map((item) => (item.id === bundle.id ? bundle : item));
    });
    setSelectedBundle(bundle);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search bundles by name or barcode..."
          className="sm:max-w-sm"
        />
        <Button
          type="button"
          className="gap-2"
          onClick={() => {
            setSelectedBundle(null);
            setManageOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New Bundle
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bundle</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  Loading bundles...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No bundles found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((bundle) => (
                <TableRow key={bundle.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      <span>{bundle.name}</span>
                    </div>
                    {bundle.description ? (
                      <p className="text-xs text-muted-foreground">{bundle.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{bundle.barcode || "-"}</TableCell>
                  <TableCell className="text-right">{currencyFormatter.format(bundle.price)}</TableCell>
                  <TableCell className="text-right">{bundle.stock_quantity.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={bundle.is_active ? "default" : "secondary"}>
                      {bundle.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setSelectedBundle(bundle); setManageOpen(true); }}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedBundle(bundle); setReceiveOpen(true); }}>
                        Receive
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedBundle(bundle); setAssembleOpen(true); }}>
                        Assemble
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedBundle(bundle); setBreakOpen(true); }}>
                        Break
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <BundleManagementDialog
        open={manageOpen}
        bundle={selectedBundle}
        onOpenChange={setManageOpen}
        onSaved={handleSaved}
      />
      <ReceiveBundlesSheet
        open={receiveOpen}
        bundle={selectedBundle}
        onOpenChange={setReceiveOpen}
        onSaved={handleSaved}
      />
      <AssembleBundlesSheet
        open={assembleOpen}
        bundle={selectedBundle}
        onOpenChange={setAssembleOpen}
        onSaved={handleSaved}
      />
      <BreakBundlesSheet
        open={breakOpen}
        bundle={selectedBundle}
        onOpenChange={setBreakOpen}
        onSaved={handleSaved}
      />
    </div>
  );
}
