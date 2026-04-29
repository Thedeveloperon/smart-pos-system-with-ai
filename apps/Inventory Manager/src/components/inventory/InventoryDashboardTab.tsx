import { useEffect, useState } from "react";
import { fetchInventoryDashboard, type InventoryDashboard } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import ExpiryBadge from "./ExpiryBadge";
import { AlertTriangle, ClipboardList, PackageX, ShieldAlert } from "lucide-react";

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
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function InventoryDashboardTab() {
  const [data, setData] = useState<InventoryDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInventoryDashboard()
      .then(setData)
      .finally(() => setLoading(false));
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

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Low stock"
          value={data.low_stock_count}
          hint="items below threshold"
          icon={PackageX}
          tone="text-red-500"
        />
        <StatCard
          title="Expiring soon"
          value={data.expiry_alert_count}
          hint="batches in next 30 days"
          icon={AlertTriangle}
          tone="text-amber-500"
        />
        <StatCard
          title="Open stocktake"
          value={data.open_stocktake_sessions}
          hint="sessions in progress"
          icon={ClipboardList}
          tone="text-blue-500"
        />
        <StatCard
          title="Open claims"
          value={data.open_warranty_claims}
          hint="warranty claims pending"
          icon={ShieldAlert}
          tone="text-purple-500"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expiring batches (next 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.expiry_alerts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <AlertTriangle className="mx-auto h-8 w-8 mb-2 opacity-50" />
              No batches expiring soon. 🎉
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
                {data.expiry_alerts.map((b) => (
                  <TableRow key={b.batch_id}>
                    <TableCell className="font-medium">{b.product_name}</TableCell>
                    <TableCell>{b.batch_number}</TableCell>
                    <TableCell>{new Date(b.expiry_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">{b.remaining_quantity}</TableCell>
                    <TableCell>
                      <ExpiryBadge expiryDate={b.expiry_date} />
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
