import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ClipboardList, PackageX, ShieldAlert } from "lucide-react";
import { fetchInventoryDashboard, type InventoryDashboard } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import ExpiryBadge from "./ExpiryBadge";

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  title: string;
  value: number;
  hint: string;
  icon: typeof AlertTriangle;
  tone: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${tone}`} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function InventoryDashboardTab() {
  const [data, setData] = useState<InventoryDashboard | null>(null);
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
        setData(dashboard);
        setError(null);
      } catch (fetchError) {
        if (!alive) {
          return;
        }
        const message =
          fetchError instanceof Error ? fetchError.message : "Failed to load inventory dashboard.";
        setData(null);
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
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 opacity-70" />
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Low stock"
          value={data.low_stock_count}
          hint="items below threshold"
          icon={PackageX}
          tone="text-destructive"
        />
        <StatCard
          title="Expiring soon"
          value={data.expiry_alert_count}
          hint="batches in next 30 days"
          icon={AlertTriangle}
          tone="text-warning"
        />
        <StatCard
          title="Open stocktake"
          value={data.open_stocktake_sessions}
          hint="sessions in progress"
          icon={ClipboardList}
          tone="text-info"
        />
        <StatCard
          title="Open claims"
          value={data.open_warranty_claims}
          hint="warranty claims pending"
          icon={ShieldAlert}
          tone="text-primary"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expiring batches (next 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.expiry_alerts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <AlertTriangle className="mx-auto mb-2 h-8 w-8 opacity-50" />
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
                {data.expiry_alerts.map((batch) => (
                  <TableRow key={batch.batch_id}>
                    <TableCell className="font-medium">{batch.product_name}</TableCell>
                    <TableCell>{batch.batch_number}</TableCell>
                    <TableCell>{new Date(batch.expiry_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">{batch.remaining_quantity}</TableCell>
                    <TableCell>
                      <ExpiryBadge expiryDate={batch.expiry_date} />
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
