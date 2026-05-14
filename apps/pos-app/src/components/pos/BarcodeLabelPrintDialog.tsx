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

type LabelPreset = "thermal" | "a4";
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
      <div class="barcode-text">${barcode}</div>
      ${showPrice ? `<div class="price">${escapeHtml(price)}</div>` : ""}
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
  runtime: PrintRuntime,
  a4Columns = 6
): string {
  const labels: CatalogProduct[] = [];
  const safeQuantity = Math.max(1, Math.min(200, Math.trunc(quantityPerProduct)));

  products.forEach((product) => {
    for (let count = 0; count < safeQuantity; count += 1) {
      labels.push(product);
    }
  });

  const labelMarkup = labels.map((product) => buildLabelMarkup(product, showPrice)).join("");
  const isThermal = preset === "thermal";
  const safeA4Columns = Math.max(1, Math.min(6, Math.trunc(a4Columns) || 6));
  const runtimeNote =
    runtime === "electron"
      ? "Electron runtime detected: open the system print dialog and verify selected label printer before confirming."
      : "Use browser print options to select the connected label printer.";
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
        size: ${isThermal ? "58mm 40mm" : "A4"};
        margin: ${isThermal ? "2mm" : "10mm"};
      }
      body {
        margin: 0;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: #0f172a;
      }
      .sheet {
        display: ${isThermal ? "block" : "grid"};
        ${isThermal ? "" : `grid-template-columns: repeat(${safeA4Columns}, minmax(0, 1fr));`}
        gap: ${isThermal ? "2mm" : "4mm"};
      }
      .label {
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 3mm;
        padding: ${isThermal ? "2mm" : "3mm"};
        width: ${isThermal ? "54mm" : "100%"};
        min-height: ${isThermal ? "34mm" : "38mm"};
        break-inside: avoid;
        margin-bottom: ${isThermal ? "2mm" : "0"};
      }
      .label-name {
        font-size: ${isThermal ? "11px" : "12px"};
        font-weight: 700;
        line-height: 1.25;
        margin-bottom: 1mm;
        max-height: 7mm;
        overflow: hidden;
      }
      .label-meta {
        font-size: 10px;
        color: #475569;
        margin-bottom: 1.5mm;
      }
      .barcode-wrap {
        width: 100%;
        margin-bottom: 1mm;
      }
      .barcode-text {
        text-align: center;
        letter-spacing: 0.08em;
        font-size: 11px;
        font-weight: 600;
      }
      .price {
        text-align: right;
        font-size: 11px;
        margin-top: 1mm;
        font-weight: 700;
      }
      .footer-note {
        margin-top: 6mm;
        font-size: 10px;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <main class="sheet">${labelMarkup}</main>
    <div class="footer-note">${runtimeNote}</div>
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
  const [a4Columns, setA4Columns] = useState("6");
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
  const a4ColumnsNumber = useMemo(() => {
    const parsed = Number(a4Columns);
    if (!Number.isFinite(parsed)) {
      return 6;
    }

    return Math.max(1, Math.min(6, Math.trunc(parsed)));
  }, [a4Columns]);

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

      popup.document.write(
        buildPrintDocumentHtml(products, quantityNumber, showPrice, preset, printRuntime, a4ColumnsNumber),
      );
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
                  <SelectItem value="thermal">Thermal (58mm)</SelectItem>
                  <SelectItem value="a4">A4 Grid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {preset === "a4" ? (
              <div className="space-y-2">
                <Label htmlFor="label-columns">Columns per row</Label>
                <Select value={a4Columns} onValueChange={setA4Columns}>
                  <SelectTrigger id="label-columns">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 column</SelectItem>
                    <SelectItem value="2">2 columns</SelectItem>
                    <SelectItem value="3">3 columns</SelectItem>
                    <SelectItem value="4">4 columns</SelectItem>
                    <SelectItem value="5">5 columns</SelectItem>
                    <SelectItem value="6">6 columns</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

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
              <div className={`rounded-md border border-border bg-white p-3 ${preset === "thermal" ? "max-w-[280px]" : "max-w-[340px]"}`}>
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
