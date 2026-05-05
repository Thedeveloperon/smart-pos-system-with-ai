import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedRow = Record<string, string>;

export type ParseResult = {
  rows: ParsedRow[];
  headers: string[];
  error: string | null;
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseCsv(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      complete: (result) => {
        resolve({
          rows: result.data,
          headers: result.meta.fields ?? [],
          error: result.errors.length > 0 ? result.errors[0].message : null,
        });
      },
      error: (error) => {
        resolve({
          rows: [],
          headers: [],
          error: error.message,
        });
      },
    });
  });
}

function parseExcel(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, defval: "" });

        if (rawRows.length === 0) {
          resolve({ rows: [], headers: [], error: "The spreadsheet appears to be empty." });
          return;
        }

        const headers = (rawRows[0] as string[]).map((header) => normalizeHeader(String(header ?? "")));
        const rows = rawRows
          .slice(1)
          .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
          .map((row) => {
            const mapped: ParsedRow = {};
            headers.forEach((header, index) => {
              mapped[header] = String(row[index] ?? "").trim();
            });
            return mapped;
          });

        resolve({ rows, headers, error: null });
      } catch (error) {
        resolve({
          rows: [],
          headers: [],
          error: error instanceof Error ? error.message : "Failed to parse Excel file.",
        });
      }
    };

    reader.onerror = () => {
      resolve({ rows: [], headers: [], error: "Failed to read file." });
    };

    reader.readAsArrayBuffer(file);
  });
}

export async function parseFile(file: File): Promise<ParseResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx" || extension === "xls") {
    return parseExcel(file);
  }

  return parseCsv(file);
}
