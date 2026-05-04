export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  price: number;
  image?: string;
  category?: string;
  categoryId?: string;
  categoryName?: string;
  brandId?: string;
  brandName?: string;
  isLowStock?: boolean;
  isSerialTracked?: boolean;
  is_serial_tracked?: boolean;
  matchedSerialId?: string;
  matchedSerialValue?: string;
  matchedSerialStatus?: string;
  stock: number;
}

export interface SelectedSerial {
  id: string;
  value: string;
}

export interface CartItem {
  lineId?: string;
  saleItemId?: string;
  product: Product;
  quantity: number;
  selectedSerial?: SelectedSerial;
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
  status: string;
  paymentMethod: "cash" | "credit" | "card" | "qr";
  customerMobile?: string;
  completedAt: Date;
  cashReceived?: number;
  change?: number;
}

export type PaymentMethod = "cash" | "credit" | "card" | "qr";
