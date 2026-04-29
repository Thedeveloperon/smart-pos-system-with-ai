import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, Settings as SettingsIcon, Store } from "lucide-react";

type Props = { onBack: () => void };

const staff = [
  { name: "Alex Morgan", role: "Manager", active: true },
  { name: "Jamie Lee", role: "Cashier", active: true },
  { name: "Sam Patel", role: "Cashier", active: false },
];

export default function ManagerPage({ onBack }: Props) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="font-semibold">Manager</h1>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="h-4 w-4" /> Store
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Store name</Label>
              <Input defaultValue="Inventory Manager Demo" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input defaultValue="USD" />
            </div>
            <div className="space-y-1.5">
              <Label>Tax rate (%)</Label>
              <Input defaultValue="8.25" type="number" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" /> Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Require manager PIN for refunds", on: true },
              { label: "Print receipt automatically", on: false },
              { label: "Low stock notifications", on: true },
              { label: "Show product images on POS", on: true },
            ].map((p) => (
              <div key={p.label} className="flex items-center justify-between">
                <span className="text-sm">{p.label}</span>
                <Switch defaultChecked={p.on} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Staff
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {staff.map((s) => (
                <div key={s.name} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.role}</div>
                  </div>
                  <Badge variant={s.active ? "secondary" : "outline"}>
                    {s.active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
