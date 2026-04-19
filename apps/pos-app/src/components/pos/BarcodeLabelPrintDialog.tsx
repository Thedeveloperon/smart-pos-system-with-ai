import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Printer } from "lucide-react";
import type { CatalogProduct } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type LabelPreset = "thermal" | "thermal-40x30" | "a4";
type PrintRuntime = "chromium" | "electron";

type BarcodeLabelPrintDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: CatalogProduct[];
};

const EAN13_LEFT_A = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN13_LEFT_B = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN13_RIGHT = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN13_PARITY = ["AAAAAA", "AABABB", "AABBAB", "AABBBA", "ABAABB", "ABBAAB", "ABBBAA", "ABABAB", "ABABBA", "ABBABA"];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function computeEan13CheckDigit(firstTwelveDigits: string): number {
  let sum = 0;
  for (let index = 0; index < firstTwelveDigits.length; index += 1) {
    const digit = Number(firstTwelveDigits[index]);
    sum += index % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

function buildEan13Pattern(barcode: string): string | null {
  const digits = barcode.trim().replace(/\s+/g, "");
  if (!/^\d{13}$/.test(digits)) {
    return null;
  }

  const expectedCheckDigit = computeEan13CheckDigit(digits.slice(0, 12));
  if (expectedCheckDigit !== Number(digits[12])) {
    return null;
  }

  const firstDigit = Number(digits[0]);
  const parityPattern = EAN13_PARITY[firstDigit];
  if (!parityPattern) {
    return null;
  }

  const leftEncoded = digits
    .slice(1, 7)
    .split("")
    .map((char, index) => {
      const digit = Number(char);
      return parityPattern[index] === "A" ? EAN13_LEFT_A[digit] : EAN13_LEFT_B[digit];
    })
    .join("");
  const rightEncoded = digits
    .slice(7)
    .split("")
    .map((char) => EAN13_RIGHT[Number(char)])
    .join("");

  return `101${leftEncoded}01010${rightEncoded}101`;
}

function buildBarcodeSvgMarkup(barcode: string): string {
  const pattern = buildEan13Pattern(barcode);
  if (!pattern) {
    return `<div style="height:72px;display:flex;align-items:center;justify-content:center;border:1px dashed #cbd5e1;color:#475569;font-size:12px;">${escapeHtml(
      barcode
    )}</div>`;
  }

  const moduleWidth = 2;
  const width = pattern.length * moduleWidth;
  const normalBarHeight = 58;
  const guardBarHeight = 66;
  const bars: string[] = [];

  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] !== "1") {
      continue;
    }

    const isGuard = index < 3 || (index >= 45 && index <= 49) || index >= 92;
    const height = isGuard ? guardBarHeight : normalBarHeight;
    bars.push(`<rect x="${index * moduleWidth}" y="0" width="${moduleWidth}" height="${height}" fill="#0f172a" />`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${guardBarHeight}" width="100%" height="66" preserveAspectRatio="none">${bars.join(
    ""
  )}</svg>`;
}

function formatPriceLkr(price: number): string {
  return `Rs. ${Number(price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildLabelMarkup(product: CatalogProduct, showPrice: boolean): string {
  const name = escapeHtml(product.name || "Item");
  const sku = escapeHtml(product.sku || "-");
  const barcode = escapeHtml(product.barcode || "-");
  const barcodeSvg = buildBarcodeSvgMarkup(product.barcode || "");
  const price = formatPriceLkr(product.unitPrice);

  return `
    <article class="label">
      <div class="label-name">${name}</div>
      <div class="label-meta">SKU: ${sku}</div>
      <div class="barcode-wrap">${barcodeSvg}</div>
      <div class="label-footer">
        <div class="barcode-text">${barcode}</div>
        ${showPrice ? `<div class="price">${escapeHtml(price)}</div>` : ""}
      </div>
    </article>
  `;
}

export function detectPrintRuntime(userAgent?: string): PrintRuntime {
  const source =
    (userAgent ||
      (typeof navigator !== "undefined" ? navigator.userAgent : "") ||
      "").toLowerCase();
  return source.includes("electron") ? "electron" : "chromium";
}

export function buildPrintDocumentHtml(
  products: CatalogProduct[],
  quantityPerProduct: number,
  showPrice: boolean,
  preset: LabelPreset,
  runtime: PrintRuntime
): string {
  const labels: CatalogProduct[] = [];
  const safeQuantity = Math.max(1, Math.min(200, Math.trunc(quantityPerProduct)));

  products.forEach((product) => {
    for (let count = 0; count < safeQuantity; count += 1) {
      labels.push(product);
    }
  });

  const labelMarkup = labels.map((product) => buildLabelMarkup(product, showPrice)).join("");
  const isThermal = preset === "thermal" || preset === "thermal-40x30";
  const isCompactThermal = preset === "thermal-40x30";
  const thermalPageWidth = isCompactThermal ? "40mm" : "58mm";
  const thermalPageHeight = isCompactThermal ? "30mm" : "40mm";
  const thermalLabelPadding = isCompactThermal ? "1.3mm 1.6mm 1.2mm" : "2mm 2.4mm 1.8mm";
  const thermalNameFontSize = isCompactThermal ? "9px" : "11px";
  const thermalNameMaxHeight = isCompactThermal ? "4.4mm" : "6mm";
  const thermalMetaFontSize = isCompactThermal ? "8px" : "9px";
  const thermalBarcodeHeight = isCompactThermal ? "9.6mm" : "13.8mm";
  const thermalFooterFontSize = isCompactThermal ? "8px" : "10px";
  const thermalFooterGap = isCompactThermal ? "1mm" : "1.6mm";
  const printScript =
    runtime === "electron"
      ? `window.onload = function () { setTimeout(function () { window.print(); }, 80); };`
      : `window.onload = function () { window.print(); };`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Barcode Labels</title>
    <style>
      @page {
        size: ${isThermal ? `${thermalPageWidth} ${thermalPageHeight}` : "A4"};
        margin: ${isThermal ? "0" : "10mm"};
      }
      * {
        box-sizing: border-box;
      }
      html {
        ${isThermal ? `width: ${thermalPageWidth};` : ""}
      }
      body {
        margin: 0;
        ${isThermal ? `width: ${thermalPageWidth};` : ""}
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: #0f172a;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        display: ${isThermal ? "block" : "grid"};
        ${isThermal ? "" : "grid-template-columns: repeat(3, minmax(0, 1fr));"}
        gap: ${isThermal ? "0" : "4mm"};
      }
      .label {
        box-sizing: border-box;
        border: ${isThermal ? "none" : "1px solid #cbd5e1"};
        border-radius: ${isThermal ? "0" : "3mm"};
        padding: ${isThermal ? thermalLabelPadding : "3mm"};
        width: ${isThermal ? thermalPageWidth : "100%"};
        min-height: ${isThermal ? thermalPageHeight : "38mm"};
        break-inside: avoid;
        ${isThermal ? "break-after: page; page-break-after: always;" : ""}
      }
      .label:last-child { break-after: auto; page-break-after: auto; }
      .label-name {
        font-size: ${isThermal ? thermalNameFontSize : "12px"};
        font-weight: 700;
        line-height: 1.2;
        margin-bottom: ${isThermal ? (isCompactThermal ? "0.45mm" : "0.8mm") : "0.8mm"};
        max-height: ${isThermal ? thermalNameMaxHeight : "7mm"};
        overflow: hidden;
      }
      .label-meta {
        font-size: ${isThermal ? thermalMetaFontSize : "10px"};
        color: #475569;
        margin-bottom: ${isThermal ? (isCompactThermal ? "0.5mm" : "1mm") : "1mm"};
      }
      .barcode-wrap {
        width: 100%;
        margin-bottom: ${isThermal ? (isCompactThermal ? "0.4mm" : "0.6mm") : "0.6mm"};
      }
      .barcode-wrap svg {
        display: block;
        width: 100%;
        height: ${isThermal ? thermalBarcodeHeight : "66px"};
      }
      .label-footer {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: ${isThermal ? thermalFooterGap : "1.6mm"};
      }
      .barcode-text {
        flex: 1;
        text-align: left;
        letter-spacing: 0.08em;
        font-size: ${isThermal ? thermalFooterFontSize : "11px"};
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .price {
        text-align: right;
        font-size: ${isThermal ? thermalFooterFontSize : "11px"};
        font-weight: 700;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <main class="sheet">${labelMarkup}</main>
    <script>
      ${printScript}
    </script>
  </body>
</html>`;
}

export default function BarcodeLabelPrintDialog({
  open,
  onOpenChange,
  products,
}: BarcodeLabelPrintDialogProps) {
  const [preset, setPreset] = useState<LabelPreset>("thermal");
  const [quantity, setQuantity] = useState("1");
  const [showPrice, setShowPrice] = useState(true);
  const [printing, setPrinting] = useState(false);
  const printRuntime = useMemo(() => detectPrintRuntime(), []);

  const quantityNumber = useMemo(() => {
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed)) {
      return 1;
    }

    return Math.max(1, Math.min(200, Math.trunc(parsed)));
  }, [quantity]);

  const previewProduct = products[0];
  const missingBarcodeCount = products.filter((product) => !product.barcode?.trim()).length;
  const canPrint = products.length > 0 && missingBarcodeCount === 0;
  const totalLabels = products.length * quantityNumber;

  const handlePrint = () => {
    if (!canPrint) {
      toast.error("Every selected product needs a barcode before printing.");
      return;
    }

    setPrinting(true);
    try {
      const popup = window.open("", "_blank", "width=1100,height=900");
      if (!popup) {
        toast.error("Popup blocked. Allow popups to print labels.");
        return;
      }

      popup.document.write(buildPrintDocumentHtml(products, quantityNumber, showPrice, preset, printRuntime));
      popup.document.close();
      toast.success(`Opened ${totalLabels} labels for printing.`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Print Barcode Labels</DialogTitle>
          <DialogDescription>
            Preview and print labels for {products.length} product{products.length === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="label-preset">Label size</Label>
              <Select value={preset} onValueChange={(value) => setPreset(value as LabelPreset)}>
                <SelectTrigger id="label-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="thermal">Thermal (58mm x 40mm)</SelectItem>
                  <SelectItem value="thermal-40x30">Thermal (40mm x 30mm)</SelectItem>
                  <SelectItem value="a4">A4 Grid (3 columns)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="label-quantity">Copies per product</Label>
              <Input
                id="label-quantity"
                type="number"
                min={1}
                max={200}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>

            <label className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">Show price on label</p>
                <p className="text-xs text-muted-foreground">Useful for shelf labels</p>
              </div>
              <Switch checked={showPrice} onCheckedChange={setShowPrice} />
            </label>

            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Total labels: <span className="font-semibold text-foreground">{totalLabels}</span>
              <p className="mt-1 text-xs">
                Runtime target: {printRuntime === "electron" ? "Electron shell" : "Desktop Chromium"}
              </p>
              {missingBarcodeCount > 0 ? (
                <p className="mt-1 text-rose-600">
                  {missingBarcodeCount} selected product{missingBarcodeCount === 1 ? "" : "s"} missing barcode.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preview</Label>
            {previewProduct ? (
              <div
                className={`rounded-md border border-border bg-white p-3 ${
                  preset === "thermal-40x30" ? "max-w-[220px]" : preset === "thermal" ? "max-w-[280px]" : "max-w-[340px]"
                }`}
              >
                <p className="line-clamp-2 text-sm font-semibold">{previewProduct.name}</p>
                <p className="mb-2 text-[11px] text-muted-foreground">SKU: {previewProduct.sku || "-"}</p>
                <div
                  className="mb-1"
                  dangerouslySetInnerHTML={{ __html: buildBarcodeSvgMarkup(previewProduct.barcode || "") }}
                />
                <p className="text-center text-xs tracking-[0.12em]">{previewProduct.barcode || "-"}</p>
                {showPrice ? (
                  <p className="mt-1 text-right text-xs font-semibold">{formatPriceLkr(previewProduct.unitPrice)}</p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                Select products to preview labels.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={handlePrint} disabled={!canPrint || printing || !products.length}>
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
