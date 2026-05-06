import type { CartDiscount, CartItem } from "@/components/pos/types";

export type CartLineMath = {
  lineId: string;
  lineGross: number;
  catalogDiscountAmount: number;
  cashierLineDiscountAmount: number;
  discountAmount: number;
  lineTotal: number;
};

export type CartTotalsMath = {
  lines: CartLineMath[];
  subtotal: number;
  lineDiscountTotal: number;
  subtotalAfterLines: number;
  customerTransactionDiscountAmount: number;
  cashierTransactionDiscountAmount: number;
  transactionDiscountAmount: number;
  discountTotal: number;
  grandTotal: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const resolveLineId = (item: CartItem) =>
  item.lineId
  ?? (item.selectedSerial?.id
    ? `serial:${item.selectedSerial.id}`
    : item.sellMode === "service"
      ? `service:${item.product.serviceId || item.product.id.replace(/^service:/, "")}`
      : item.sellMode === "bundle"
        ? `bundle:${item.bundleId || item.product.bundleId || item.product.id.replace(/^bundle:/, "")}`
        : `product:${item.product.id.replace(/^bundle:/, "")}:${item.sellMode ?? "unit"}`);

const linePrice = (item: CartItem) => {
  const unitPrice = item.product.price || 0;
  return roundMoney(unitPrice * item.quantity);
};

const resolveCatalogDiscount = (item: CartItem, lineGross: number) => {
  if (lineGross <= 0) {
    return 0;
  }

  const fixed = item.product.permanentDiscountFixed;
  const percent = item.product.permanentDiscountPercent;
  if (typeof fixed === "number" && fixed > 0) {
    return roundMoney(clamp(fixed, 0, lineGross));
  }
  if (typeof percent === "number" && percent > 0) {
    return roundMoney(clamp(lineGross * (percent / 100), 0, lineGross));
  }
  return 0;
};

const resolveCashierLineDiscount = (item: CartItem, eligibleBase: number) => {
  if (eligibleBase <= 0) {
    return 0;
  }

  const fixed = item.cashierLineDiscountFixed;
  const percent = item.cashierLineDiscountPercent;
  if (typeof fixed === "number" && fixed > 0) {
    return roundMoney(clamp(fixed, 0, eligibleBase));
  }
  if (typeof percent === "number" && percent > 0) {
    return roundMoney(clamp(eligibleBase * (percent / 100), 0, eligibleBase));
  }
  return 0;
};

export function computeCartTotals(
  items: CartItem[],
  discount: CartDiscount,
  customerTransactionDiscountPercent = 0,
): CartTotalsMath {
  const lines = items.map((item) => {
    const lineGross = linePrice(item);
    const catalogDiscountAmount = resolveCatalogDiscount(item, lineGross);
    const baseAfterCatalog = roundMoney(Math.max(0, lineGross - catalogDiscountAmount));
    const cashierLineDiscountAmount = resolveCashierLineDiscount(item, baseAfterCatalog);
    const discountAmount = roundMoney(catalogDiscountAmount + cashierLineDiscountAmount);
    const lineTotal = roundMoney(Math.max(0, lineGross - discountAmount));

    return {
      lineId: resolveLineId(item),
      lineGross,
      catalogDiscountAmount,
      cashierLineDiscountAmount,
      discountAmount,
      lineTotal,
    } satisfies CartLineMath;
  });

  const subtotal = roundMoney(lines.reduce((sum, item) => sum + item.lineGross, 0));
  const lineDiscountTotal = roundMoney(lines.reduce((sum, item) => sum + item.discountAmount, 0));
  const subtotalAfterLines = roundMoney(lines.reduce((sum, item) => sum + item.lineTotal, 0));

  const normalizedCustomerPercent = clamp(customerTransactionDiscountPercent || 0, 0, 100);
  const customerTransactionDiscountAmount = roundMoney(subtotalAfterLines * (normalizedCustomerPercent / 100));
  const subtotalAfterCustomer = roundMoney(Math.max(0, subtotalAfterLines - customerTransactionDiscountAmount));

  const cashierPercent = clamp(discount.cashierTransactionDiscountPercent || 0, 0, 100);
  const cashierFixed = discount.cashierTransactionDiscountFixed && discount.cashierTransactionDiscountFixed > 0
    ? discount.cashierTransactionDiscountFixed
    : null;
  const cashierTransactionDiscountAmount = cashierFixed != null
    ? roundMoney(clamp(cashierFixed, 0, subtotalAfterCustomer))
    : roundMoney(clamp(subtotalAfterCustomer * (cashierPercent / 100), 0, subtotalAfterCustomer));

  const transactionDiscountAmount = roundMoney(customerTransactionDiscountAmount + cashierTransactionDiscountAmount);
  const discountTotal = roundMoney(lineDiscountTotal + transactionDiscountAmount);
  const grandTotal = roundMoney(Math.max(0, subtotalAfterCustomer - cashierTransactionDiscountAmount));

  return {
    lines,
    subtotal,
    lineDiscountTotal,
    subtotalAfterLines,
    customerTransactionDiscountAmount,
    cashierTransactionDiscountAmount,
    transactionDiscountAmount,
    discountTotal,
    grandTotal,
  };
}
