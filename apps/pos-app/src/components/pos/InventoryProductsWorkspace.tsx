import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Loader2, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { completeSale, fetchProducts } from "@/lib/api";
import ProductCard from "./ProductCard";
import type { CartItem, Product } from "./types";

const money = (value: number) => `Rs. ${value.toLocaleString()}`;

const InventoryProductsWorkspace = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchProducts();
      setProducts(items);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const grandTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cartItems],
  );

  const handleAddToCart = useCallback((product: Product, qty: number) => {
    setCartItems((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + qty } : item,
        );
      }

      return [...current, { product, quantity: qty }];
    });
  }, []);

  const handleClear = useCallback(() => {
    setCartItems([]);
  }, []);

  const handleCharge = useCallback(async () => {
    if (cartItems.length === 0 || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      await completeSale(cartItems, "manager", "card", grandTotal);
      toast.success("Sale completed.");
      setCartItems([]);
      await loadProducts();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to complete sale.");
    } finally {
      setSubmitting(false);
    }
  }, [cartItems, grandTotal, loadProducts, submitting]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-3xl border border-border/60 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-foreground">Products</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse products and add items to the current sale.
          </p>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`skeleton-${index}`}
                className="h-64 animate-pulse rounded-2xl border border-border/50 bg-muted/40"
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-4 text-center text-muted-foreground">
            <ShoppingCart className="mb-3 h-11 w-11 opacity-40" />
            <p className="text-sm font-medium text-foreground">No products found</p>
            <p className="text-xs">There are no products to display yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onAdd={handleAddToCart} showAddButton={false} />
            ))}
          </div>
        )}
      </section>

      <aside className="h-fit rounded-3xl border border-border/60 bg-white shadow-sm xl:sticky xl:top-24">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-foreground">Current sale</h2>

          <div className="mt-4 space-y-3">
            {cartItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                Added items will appear here.
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {cartItems.map((item) => (
                    <div key={item.product.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {item.product.name} <span className="text-muted-foreground">× {item.quantity}</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{item.product.sku}</p>
                      </div>
                      <div className="text-right font-medium text-foreground">
                        {money(item.product.price * item.quantity)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border pt-3">
                  <div className="flex items-center justify-between text-base font-semibold text-foreground">
                    <span>Total</span>
                    <span>{money(grandTotal)}</span>
                  </div>
                </div>
              </>
            )}

            <Button
              type="button"
              variant="pos-primary"
              className="h-11 w-full rounded-xl text-base font-semibold"
              onClick={() => {
                void handleCharge();
              }}
              disabled={cartItems.length === 0 || submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Charge {money(grandTotal)}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full rounded-xl text-sm font-medium text-muted-foreground"
              onClick={handleClear}
              disabled={cartItems.length === 0 || submitting}
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default InventoryProductsWorkspace;
