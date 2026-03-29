export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  price: number;
  image?: string;
  category?: string;
  stock: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface HeldBill {
  id: string;
  items: CartItem[];
  customerMobile?: string;
  heldAt: Date;
  label?: string;
}

export interface RecentSale {
  id: string;
  items: CartItem[];
  total: number;
  paymentMethod: "cash" | "card" | "qr";
  customerMobile?: string;
  completedAt: Date;
  cashReceived?: number;
  change?: number;
}

export type PaymentMethod = "cash" | "card" | "qr";
