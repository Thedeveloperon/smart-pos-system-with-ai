import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Boxes,
  ClipboardList,
  History,
  PackageX,
  PackageCheck,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchInventoryDashboard, type InventoryDashboard } from "@/lib/api";
import { cn } from "@/lib/utils";

type InventoryTab = "overview" | "movements" | "serials" | "batches" | "stocktake" | "claims";

const TAB_ITEMS: Array<{ value: InventoryTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "movements", label: "Movements" },
  { value: "serials", label: "Serials" },
  { value: "batches", label: "Batches" },
  { value: "stocktake", label: "Stocktake" },
  { value: "claims", label: "Claims" },
];

type OverviewCardProps = {
  title: string;
  value: number;
  hint: string;
  icon: typeof PackageX;
  toneClassName: string;
};

const formatShortDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });

function getReturnTarget() {
  if (typeof window === "undefined") {
    return "/";
  }

  const rawReturnTarget = new URLSearchParams(window.location.search).get("returnTo")?.trim();
  if (!rawReturnTarget) {
    return "/";
  }

  try {
    const targetUrl = new URL(rawReturnTarget, window.location.origin);
    if (targetUrl.origin !== window.location.origin) {
      return "/";
    }

    return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}` || "/";
  } catch {
    return "/";
  }
}

function getInitialTab(): InventoryTab {
  if (typeof window === "undefined") {
    return "overview";
  }

  const rawTab = new URLSearchParams(window.location.search).get("tab")?.trim().toLowerCase();
  if (
    rawTab === "overview" ||
    rawTab === "movements" ||
    rawTab === "serials" ||
    rawTab === "batches" ||
    rawTab === "stocktake" ||
    rawTab === "claims"
  ) {
    return rawTab;
  }

  return "overview";
}

function syncTabToUrl(tab: InventoryTab) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url);
}

function OverviewCard({ title, value, hint, icon: Icon, toneClassName }: OverviewCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", toneClassName)} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function OverviewPanel() {
  const [summary, setSummary] = useState<InventoryDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const dashboard = await fetchInventoryDashboard();
        if (!alive) {
          return;
        }
        setSummary(dashboard);
        setError(null);
      } catch (fetchError) {
        if (!alive) {
          return;
        }
        const message =
          fetchError instanceof Error ? fetchError.message : "Failed to load inventory overview.";
        setSummary(null);
        setError(message);
        toast.error(message);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive">
          <PackageX className="mx-auto mb-2 h-8 w-8 opacity-70" />
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <OverviewCard
          title="Low stock"
          value={summary.low_stock_count}
          hint="items below threshold"
          icon={PackageX}
          toneClassName="text-destructive"
        />
        <OverviewCard
          title="Expiring soon"
          value={summary.expiry_alert_count}
          hint="batches in next 30 days"
          icon={PackageCheck}
          toneClassName="text-warning"
        />
        <OverviewCard
          title="Open stocktake"
          value={summary.open_stocktake_sessions}
          hint="sessions in progress"
          icon={ClipboardList}
          toneClassName="text-info"
        />
        <OverviewCard
          title="Open claims"
          value={summary.open_warranty_claims}
          hint="warranty claims pending"
          icon={ShieldAlert}
          toneClassName="text-primary"
        />
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Expiring batches (next 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.expiry_alerts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <PackageCheck className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No batches expiring soon.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Qty left</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.expiry_alerts.map((batch) => (
                  <TableRow key={batch.batch_id}>
                    <TableCell className="font-medium">{batch.product_name}</TableCell>
                    <TableCell>{batch.batch_number}</TableCell>
                    <TableCell>{formatShortDate(batch.expiry_date)}</TableCell>
                    <TableCell className="text-right">{batch.remaining_quantity}</TableCell>
                    <TableCell>
          <Badge variant="destructive">
            {new Date(batch.expiry_date) < new Date() ? "Expired" : "Expiring"}
          </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StubPanel({ title, description, icon: Icon }: { title: string; description: string; icon: typeof History }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
        <Icon className="h-10 w-10 text-muted-foreground/70" />
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="max-w-lg text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const InventoryManagerDashboard = () => {
  const [activeTab, setActiveTab] = useState<InventoryTab>(() => getInitialTab());
  const returnTarget = useMemo(() => getReturnTarget(), []);

  useEffect(() => {
    syncTabToUrl(activeTab);
  }, [activeTab]);

  return (
    <div className="min-h-screen pos-shell">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-pos-header text-pos-header-foreground shadow-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.assign(returnTarget)}
            className="text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="h-4 w-px bg-white/15" />
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold">Inventory Management</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Tabs
          defaultValue={activeTab}
          onValueChange={(value) => setActiveTab(value as InventoryTab)}
        >
          <div className="sticky top-14 z-40 mb-6 bg-background/95 pb-3 pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <TabsList className="grid h-12 w-full grid-cols-2 gap-1 border border-border/60 bg-secondary/60 p-1 md:grid-cols-6">
              {TAB_ITEMS.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-0">
            <OverviewPanel />
          </TabsContent>
          <TabsContent value="movements" className="mt-0">
            <StubPanel
              title="Movements"
              description="Stock movement history and filters will appear here."
              icon={History}
            />
          </TabsContent>
          <TabsContent value="serials" className="mt-0">
            <StubPanel
              title="Serials"
              description="Serial number lookup and maintenance will appear here."
              icon={History}
            />
          </TabsContent>
          <TabsContent value="batches" className="mt-0">
            <StubPanel
              title="Batches"
              description="Batch tracking and expiry management will appear here."
              icon={History}
            />
          </TabsContent>
          <TabsContent value="stocktake" className="mt-0">
            <StubPanel
              title="Stocktake"
              description="Stock count sessions and reconciliation will appear here."
              icon={History}
            />
          </TabsContent>
          <TabsContent value="claims" className="mt-0">
            <StubPanel
              title="Claims"
              description="Warranty and claim workflows will appear here."
              icon={History}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default InventoryManagerDashboard;
