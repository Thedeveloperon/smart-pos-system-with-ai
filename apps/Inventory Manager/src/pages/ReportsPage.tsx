import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, DollarSign, ShoppingCart, TrendingUp, Package } from "lucide-react";

type Props = { onBack: () => void };

const stats = [
  { label: "Today's Sales", value: "$1,284.50", icon: DollarSign, hint: "+12% vs yesterday" },
  { label: "Transactions", value: "47", icon: ShoppingCart, hint: "Avg $27.33" },
  { label: "Top Product", value: "Espresso", icon: TrendingUp, hint: "18 sold" },
  { label: "Items Sold", value: "112", icon: Package, hint: "Across 47 sales" },
];

const recent = [
  { id: "TXN-1042", time: "10:42 AM", items: 3, total: 18.5 },
  { id: "TXN-1041", time: "10:31 AM", items: 1, total: 4.25 },
  { id: "TXN-1040", time: "10:18 AM", items: 5, total: 42.0 },
  { id: "TXN-1039", time: "10:02 AM", items: 2, total: 12.75 },
];

export default function ReportsPage({ onBack }: Props) {
  return (
    <div className="min-h-screen pos-shell">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-pos-header text-pos-header-foreground shadow-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-pos-header-foreground/80 hover:text-pos-header-foreground hover:bg-white/10"
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <h1 className="font-semibold">Reports</h1>
        </div>
      </header>
      <div className="mx-auto space-y-4 px-4 py-6 max-w-7xl">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">{s.label}</div>
                    <div className="text-2xl font-semibold mt-1">{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.hint}</div>
                  </div>
                  <s.icon className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{r.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.time} · {r.items} items
                    </div>
                  </div>
                  <div className="font-semibold">${r.total.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
