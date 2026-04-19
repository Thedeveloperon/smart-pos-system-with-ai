import { describe, expect, it } from "vitest";
import { buildPrintDocumentHtml, detectPrintRuntime } from "./BarcodeLabelPrintDialog";
import type { CatalogProduct } from "@/lib/api";

const sampleProduct: CatalogProduct = {
  id: "prod-1",
  name: "Milk 1L",
  sku: "MILK-1L",
  barcode: "4006381333931",
  image: undefined,
  imageUrl: null,
  categoryId: null,
  categoryName: null,
  unitPrice: 450,
  costPrice: 300,
  stockQuantity: 20,
  reorderLevel: 5,
  alertLevel: 5,
  allowNegativeStock: true,
  isActive: true,
  isLowStock: false,
  createdAt: "2026-04-03T00:00:00Z",
  updatedAt: "2026-04-03T00:00:00Z",
};

describe("BarcodeLabelPrintDialog runtime print output", () => {
  it("detects Chromium runtime from user agent", () => {
    const runtime = detectPrintRuntime(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    );

    expect(runtime).toBe("chromium");
  });

  it("detects Electron runtime from user agent", () => {
    const runtime = detectPrintRuntime(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Electron/31.2.0 Safari/537.36"
    );

    expect(runtime).toBe("electron");
  });

  it("builds thermal print document for Electron runtime", () => {
    const html = buildPrintDocumentHtml([sampleProduct], 2, true, "thermal", "electron");

    expect(html).toContain("size: 58mm 40mm");
    expect(html).toContain("margin: 0");
    expect(html).toContain("break-after: page");
    expect(html).not.toContain("footer-note");
    expect(html).toContain("setTimeout(function () { window.print(); }, 80);");
    expect(html).toContain("4006381333931");
  });

  it("builds A4 print document for Chromium runtime", () => {
    const html = buildPrintDocumentHtml([sampleProduct], 1, false, "a4", "chromium");

    expect(html).toContain("size: A4");
    expect(html).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(html).not.toContain("Use browser print options to select the connected label printer.");
    expect(html).toContain("window.onload = function () { window.print(); };");
  });

  it("builds compact thermal print document for 40mm x 30mm labels", () => {
    const html = buildPrintDocumentHtml([sampleProduct], 1, true, "thermal-40x30", "chromium");

    expect(html).toContain("size: 40mm 30mm");
    expect(html).toContain("padding: 1.3mm 1.6mm 1.2mm");
    expect(html).toContain("height: 9.6mm");
    expect(html).toContain("font-size: 8px");
  });
});
