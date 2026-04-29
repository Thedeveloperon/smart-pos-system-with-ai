import { useEffect, useState } from "react";
import HeaderBar from "@/components/pos/HeaderBar";
import ProductManagementDialog from "@/components/pos/ProductManagementDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchInventoryDashboard, fetchProducts, type Product } from "@/lib/api";
import { Pencil, Plus } from "lucide-react";

type Props = {
  onOpenInventory: () => void;
  onOpenReports?: () => void;
  onOpenManager?: () => void;
};

export default function PosHome({ onOpenInventory, onOpenReports, onOpenManager }: Props) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [editing, setEditing] = useState<Product | null>(null);
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([]);

  useEffect(() => {
    fetchProducts().then(setProducts);
    fetchInventoryDashboard()
      .then((d) => setAlertCount(d.expiry_alert_count + d.open_warranty_claims))
      .catch(() => setAlertCount(0));
  }, []);

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const found = prev.find((c) => c.product.id === p.id);
      if (found) {
        return prev.map((c) => (c.product.id === p.id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { product: p, qty: 1 }];
    });
  };

  const total = cart.reduce((sum, c) => sum + c.product.price * c.qty, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <HeaderBar
        onInventory={onOpenInventory}
        onReports={onOpenReports}
        onManager={onOpenManager}
        inventoryAlertCount={alertCount}
      />

      <div className="mx-auto max-w-7xl px-4 py-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Products</CardTitle>
            </CardHeader>
            <CardContent>
              {!products ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {products.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-md border p-3 hover:border-slate-400 transition cursor-pointer group"
                      onClick={() => addToCart(p)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="font-medium text-sm">{p.name}</div>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing(p);
                          }}
                          aria-label="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{p.sku}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="font-semibold">${p.price.toFixed(2)}</span>
                        <Badge variant={p.stock < 10 ? "destructive" : "secondary"}>
                          {p.stock} in stock
                        </Badge>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {p.is_serial_tracked && (
                          <Badge variant="outline" className="text-[10px]">
                            Serial
                          </Badge>
                        )}
                        {p.is_batch_tracked && (
                          <Badge variant="outline" className="text-[10px]">
                            Batch
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit sticky top-4">
          <CardHeader>
            <CardTitle className="text-base">Current sale</CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                <Plus className="mx-auto h-6 w-6 opacity-40 mb-2" />
                Tap a product to add it.
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((c) => (
                  <div key={c.product.id} className="flex justify-between text-sm">
                    <span>
                      {c.product.name} <span className="text-muted-foreground">× {c.qty}</span>
                    </span>
                    <span className="font-medium">${(c.product.price * c.qty).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
                <Button className="w-full mt-2">Charge ${total.toFixed(2)}</Button>
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setCart([])}>
                  Clear
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ProductManagementDialog
        open={!!editing}
        product={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={(updated) => {
          setProducts((prev) =>
            prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev,
          );
        }}
      />
    </div>
  );
}
