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
  hasPackOption?: boolean;
  packSize?: number | null;
  packPrice?: number | null;
  packLabel?: string | null;
  isBundle?: boolean;
  bundleId?: string;
  isService?: boolean;
  serviceId?: string;
  serviceDurationMinutes?: number | null;
  serviceDefaultPrice?: number;
  tracksStock?: boolean;
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
  sellMode?: "unit" | "pack" | "bundle" | "service";
  bundleId?: string;
  bundleName?: string;
  packSize?: number;
  packLabel?: string | null;
  baseUnitPrice?: number;
  customPrice?: number;
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
