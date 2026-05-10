import type { Product } from "@/lib/api";

export type SaleLinePricing = {
  lineGross: number;
  catalogDiscountAmount: number;
  lineTotal: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function computeSaleLinePricing(product: Product, quantity: number): SaleLinePricing {
  const lineGross = roundMoney((product.price || 0) * quantity);
  if (lineGross <= 0) {
    return {
      lineGross,
      catalogDiscountAmount: 0,
      lineTotal: 0,
    };
  }

  const fixed = product.permanent_discount_fixed;
  const percent = product.permanent_discount_percent;
  const catalogDiscountAmount =
    typeof fixed === "number" && fixed > 0
      ? roundMoney(clamp(fixed, 0, lineGross))
      : typeof percent === "number" && percent > 0
        ? roundMoney(clamp(lineGross * (percent / 100), 0, lineGross))
        : 0;

  return {
    lineGross,
    catalogDiscountAmount,
    lineTotal: roundMoney(Math.max(0, lineGross - catalogDiscountAmount)),
  };
}
