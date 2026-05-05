import { useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  bulkImportBrands,
  bulkImportCategories,
  bulkImportCustomers,
  bulkImportProducts,
  type BulkImportBrandRow,
  type BulkImportCategoryRow,
  type BulkImportCustomerRow,
  type BulkImportProductRow,
  type ImportRowResult,
  type ImportSummary,
} from "@/lib/api";
import { downloadTemplate, IMPORT_TEMPLATES, type ImportEntityType } from "./importTemplates";
import { parseFile, type ParsedRow } from "./useFileParser";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: ImportEntityType;
  onImportComplete: () => void;
};

type Step = "upload" | "preview" | "results";

function parseBool(value: string | undefined, fallback = true) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "no";
}

function parseNum(value: string | undefined, fallback = 0) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapBrandRows(rows: ParsedRow[]): BulkImportBrandRow[] {
  return rows.map((row, index) => ({
    row_index: index,
    name: row.name ?? "",
    code: row.code || null,
    description: row.description || null,
    is_active: parseBool(row.is_active),
  }));
}

function mapCategoryRows(rows: ParsedRow[]): BulkImportCategoryRow[] {
  return rows.map((row, index) => ({
    row_index: index,
    name: row.name ?? "",
    description: row.description || null,
    is_active: parseBool(row.is_active),
  }));
}

function mapProductRows(rows: ParsedRow[]): BulkImportProductRow[] {
  return rows.map((row, index) => ({
    row_index: index,
    name: row.name ?? "",
    sku: row.sku || null,
    barcode: row.barcode || null,
    category_name: row.category_name || null,
    brand_name: row.brand_name || null,
    unit_price: parseNum(row.unit_price),
    cost_price: parseNum(row.cost_price),
    initial_stock_quantity: parseNum(row.initial_stock_quantity),
    reorder_level: parseNum(row.reorder_level),
    safety_stock: parseNum(row.safety_stock),
    target_stock_level: parseNum(row.target_stock_level),
    allow_negative_stock: parseBool(row.allow_negative_stock),
    is_active: parseBool(row.is_active),
  }));
}

function mapCustomerRows(rows: ParsedRow[]): BulkImportCustomerRow[] {
  return rows.map((row, index) => ({
    row_index: index,
    name: row.name ?? "",
    code: row.code || null,
    phone: row.phone || null,
    email: row.email || null,
    address: row.address || null,
    date_of_birth: row.date_of_birth || null,
    credit_limit: parseNum(row.credit_limit),
    notes: row.notes || null,
    is_active: parseBool(row.is_active),
  }));
}

function RowStatus({ status }: { status: ImportRowResult["status"] }) {
  if (status === "ok" || status === "updated") {
    return <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">{status === "ok" ? "Inserted" : "Updated"}</span>;
  }

  if (status === "skipped") {
    return <Badge variant="secondary">Skipped</Badge>;
  }

  return <Badge variant="destructive">Error</Badge>;
}

function MetricCard({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", highlight && "border-destructive/30 bg-destructive/5")}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold", highlight && "text-destructive")}>{value}</p>
    </div>
  );
}

export default function BulkImportDialog({ open, onOpenChange, entityType, onImportComplete }: Props) {
  const config = IMPORT_TEMPLATES[entityType];
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [strategy, setStrategy] = useState<"" | "skip" | "update">("");
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);

  const missingColumns = useMemo(
    () => config.requiredColumns.filter((column) => !headers.includes(column)),
    [config.requiredColumns, headers],
  );

  function resetToUpload() {
    setStep("upload");
    setFile(null);
    setParsedRows([]);
    setHeaders([]);
    setStrategy("");
    setImportResult(null);
  }

  function closeDialog() {
    resetToUpload();
    onOpenChange(false);
  }

  async function handleParseAndNext() {
    if (!file || !strategy) {
      return;
    }

    setIsParsing(true);
    try {
      const result = await parseFile(file);
      if (result.error) {
        throw new Error(result.error);
      }

      setParsedRows(result.rows);
      setHeaders(result.headers);
      setStep("preview");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to parse file.");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleImport() {
    if (!strategy || missingColumns.length > 0) {
      return;
    }

    setIsImporting(true);
    try {
      let result: ImportSummary;
      if (entityType === "brand") {
        result = await bulkImportBrands(mapBrandRows(parsedRows), strategy);
      } else if (entityType === "category") {
        result = await bulkImportCategories(mapCategoryRows(parsedRows), strategy);
      } else if (entityType === "product") {
        result = await bulkImportProducts(mapProductRows(parsedRows), strategy);
      } else {
        result = await bulkImportCustomers(mapCustomerRows(parsedRows), strategy);
      }

      setImportResult(result);
      setStep("results");
      if (result.errors > 0) {
        toast.error(`Import finished with ${result.errors} error(s).`);
      } else {
        toast.success("Import completed successfully.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsImporting(false);
    }
  }

  const canProceed = Boolean(file) && strategy !== "";

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : closeDialog())}>
      <DialogContent className="max-w-5xl p-0">
        <DialogHeader className="space-y-1 border-b px-6 py-5">
          <DialogTitle className="flex items-center justify-between">
            <span>Import {config.label}</span>
            <Button type="button" size="icon" variant="ghost" onClick={closeDialog}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
          <DialogDescription>
            Download the template, upload CSV/Excel, preview, then import.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          {step === "upload" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-medium">Template</p>
                  <p className="text-xs text-muted-foreground">Use the expected columns for {config.label.toLowerCase()}.</p>
                </div>
                <Button type="button" variant="outline" className="gap-2" onClick={() => downloadTemplate(entityType)}>
                  <Download className="h-4 w-4" />
                  Download CSV Template
                </Button>
              </div>

              <div className="rounded-lg border border-dashed p-6 text-center">
                <UploadCloud className="mx-auto h-9 w-9 text-primary" />
                <p className="mt-2 text-sm font-medium">Upload file</p>
                <p className="mt-1 text-xs text-muted-foreground">Accepted: .csv, .xlsx, .xls</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <Button type="button" className="mt-4 gap-2" onClick={() => fileInputRef.current?.click()}>
                  <UploadCloud className="h-4 w-4" />
                  Choose File
                </Button>
                {file && <p className="mt-3 text-xs text-muted-foreground">{file.name}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Duplicate strategy</Label>
                <RadioGroup value={strategy} onValueChange={(value) => setStrategy(value as typeof strategy)} className="grid gap-2">
                  <label className="flex items-center gap-3 rounded-md border p-3">
                    <RadioGroupItem value="skip" id="skip" />
                    <div>
                      <p className="text-sm font-medium">Skip duplicates</p>
                      <p className="text-xs text-muted-foreground">Keep existing record unchanged.</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 rounded-md border p-3">
                    <RadioGroupItem value="update" id="update" />
                    <div>
                      <p className="text-sm font-medium">Update duplicates</p>
                      <p className="text-xs text-muted-foreground">Overwrite existing record fields.</p>
                    </div>
                  </label>
                </RadioGroup>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              {config.hint && <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{config.hint}</p>}

              {missingColumns.length > 0 && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Required columns missing</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{missingColumns.join(", ")}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {parsedRows.length} row(s) found
                  {parsedRows.length > 200 ? " — showing first 200" : ""}
                </p>
                <Badge variant="secondary">{config.label}</Badge>
              </div>

              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-xs uppercase tracking-wider">#</TableHead>
                      {config.columns.map((column) => (
                        <TableHead key={column} className="whitespace-nowrap text-xs uppercase tracking-wider">
                          {column}
                          {config.requiredColumns.includes(column) ? <span className="ml-1 text-destructive">*</span> : null}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 200).map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        <TableCell className="text-xs text-muted-foreground">{rowIndex + 1}</TableCell>
                        {config.columns.map((column) => {
                          const value = row[column];
                          const requiredMissing = config.requiredColumns.includes(column) && !value;
                          return (
                            <TableCell key={column} className={cn("max-w-[220px] truncate text-sm", requiredMissing && "bg-muted/60")}>
                              {value || (requiredMissing ? <span className="text-xs italic text-destructive">required</span> : <span className="text-muted-foreground/40">—</span>)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {step === "results" && importResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard label="Inserted" value={importResult.inserted} />
                <MetricCard label="Updated" value={importResult.updated} />
                <MetricCard label="Skipped" value={importResult.skipped} />
                <MetricCard label="Errors" value={importResult.errors} highlight />
              </div>

              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14 text-xs uppercase tracking-wider">Row</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Name</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResult.rows.map((row) => (
                      <TableRow key={`${row.row_index}-${row.status}`}>
                        <TableCell className="text-xs text-muted-foreground">{row.row_index + 1}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm font-medium">{row.name ?? "—"}</TableCell>
                        <TableCell><RowStatus status={row.status} /></TableCell>
                        <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground">{row.error ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <Separator />

        <DialogFooter className="px-6 py-4">
          {step === "upload" && (
            <>
              <Button type="button" variant="ghost" onClick={closeDialog}>Cancel</Button>
              <Button type="button" className="gap-2" disabled={!canProceed || isParsing} onClick={() => void handleParseAndNext()}>
                {isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Next: Preview
              </Button>
            </>
          )}

          {step === "preview" && (
            <>
              <Button type="button" variant="ghost" onClick={() => setStep("upload")}>Back</Button>
              <Button
                type="button"
                className="gap-2"
                disabled={missingColumns.length > 0 || parsedRows.length === 0 || isImporting}
                onClick={() => void handleImport()}
              >
                {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Import {parsedRows.length} row(s)
              </Button>
            </>
          )}

          {step === "results" && (
            <>
              <Button type="button" variant="outline" onClick={resetToUpload}>Import Another</Button>
              <Button
                type="button"
                className="gap-2"
                onClick={() => {
                  onImportComplete();
                  closeDialog();
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                Done
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
