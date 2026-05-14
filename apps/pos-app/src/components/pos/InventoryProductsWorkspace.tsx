import { useCallback, useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { fetchProducts } from "@/lib/api";
import ProductCard from "./ProductCard";
import type { Product } from "./types";

const InventoryProductsWorkspace = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <section className="rounded-3xl border border-border/60 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold text-foreground">Products</h2>
        <p className="mt-1 text-sm text-muted-foreground">Browse the current product list.</p>
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
            <ProductCard
              key={product.id}
              product={product}
              onAdd={() => {}}
              showAddButton={false}
              interactive={false}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default InventoryProductsWorkspace;
