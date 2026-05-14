import type { CartItem, Product } from "./types";

export const mergeHeldCartWithCurrentProducts = (items: CartItem[], products: Product[]): CartItem[] => {
  const currentProductsById = new Map(products.map((product) => [product.id, product]));

  return items.map((item) => {
    const sellMode = item.sellMode
      ?? (item.product.isService || item.product.serviceId ? "service" : item.bundleId || item.product.isBundle ? "bundle" : "unit");
    const currentProduct = sellMode === "bundle" || sellMode === "service"
      ? null
      : currentProductsById.get(item.product.id.replace(/^bundle:/, ""));
    const lineId = item.lineId ??
      (item.selectedSerial?.id
        ? `serial:${item.selectedSerial.id}`
        : sellMode === "service"
          ? `service:${item.product.serviceId || item.product.id.replace(/^service:/, "")}`
          : sellMode === "bundle"
          ? `bundle:${item.bundleId || item.product.bundleId || item.product.id.replace(/^bundle:/, "")}`
          : `product:${item.product.id.replace(/^bundle:/, "")}:${sellMode}`);

    if (!currentProduct) {
      return {
        ...item,
        lineId,
        sellMode,
      };
    }

    return {
      ...item,
      lineId,
      sellMode,
      product: {
        ...currentProduct,
        name: item.product.name,
        price: item.product.price,
      },
    };
  });
};
