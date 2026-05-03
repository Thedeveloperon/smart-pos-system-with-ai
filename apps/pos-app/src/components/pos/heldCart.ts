import type { CartItem, Product } from "./types";

export const mergeHeldCartWithCurrentProducts = (items: CartItem[], products: Product[]): CartItem[] => {
  const currentProductsById = new Map(products.map((product) => [product.id, product]));

  return items.map((item) => {
    const currentProduct = currentProductsById.get(item.product.id);

    if (!currentProduct) {
      return {
        ...item,
        lineId: item.selectedSerial ? `serial:${item.selectedSerial.id}` : `product:${item.product.id}`,
      };
    }

    return {
      ...item,
      lineId: item.selectedSerial ? `serial:${item.selectedSerial.id}` : `product:${item.product.id}`,
      product: {
        ...currentProduct,
        name: item.product.name,
        price: item.product.price,
      },
    };
  });
};
