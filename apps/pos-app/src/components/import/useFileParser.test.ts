import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFile } from "./useFileParser";

const readWorkbookMock = vi.fn();
const sheetToJsonMock = vi.fn();

vi.mock("xlsx", () => ({
  read: (...args: unknown[]) => readWorkbookMock(...args),
  utils: {
    sheet_to_json: (...args: unknown[]) => sheetToJsonMock(...args),
  },
}));

describe("useFileParser", () => {
  beforeEach(() => {
    readWorkbookMock.mockReset();
    sheetToJsonMock.mockReset();
  });

  it("parses CSV headers and rows", async () => {
    const csv = "Name,Unit Price\nItem A,10.5\nItem B,20";
    const file = new File([csv], "items.csv", { type: "text/csv" });

    const result = await parseFile(file);
    expect(result.error).toBeNull();
    expect(result.headers).toEqual(["name", "unit_price"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe("Item A");
    expect(result.rows[0].unit_price).toBe("10.5");
  });

  it("ignores delimiter-only CSV template rows", async () => {
    const csv = "Name,Description,Is Active\nBakery Foods,Breads and baked goods.,TRUE\n,,\nMeat & Fish,Fresh and processed meats & fish,TRUE\n,,";
    const file = new File([csv], "categories.csv", { type: "text/csv" });

    const result = await parseFile(file);
    expect(result.error).toBeNull();
    expect(result.headers).toEqual(["name", "description", "is_active"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe("Bakery Foods");
    expect(result.rows[1].name).toBe("Meat & Fish");
  });

  it("parses XLSX headers and rows", async () => {
    const originalFileReader = globalThis.FileReader;

    class MockFileReader {
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;

      readAsArrayBuffer() {
        this.onload?.({
          target: { result: new ArrayBuffer(16) },
        } as ProgressEvent<FileReader>);
      }
    }

    globalThis.FileReader = MockFileReader as typeof FileReader;

    readWorkbookMock.mockReturnValue({
      SheetNames: ["Sheet1"],
      Sheets: {
        Sheet1: {},
      },
    });
    sheetToJsonMock.mockReturnValue([
      ["Name", "Credit Limit"],
      ["Jane", 100],
      ["Bob", 250],
    ]);

    const file = new File([new ArrayBuffer(16)], "customers.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    try {
      const result = await parseFile(file);
      expect(result.error).toBeNull();
      expect(result.headers).toEqual(["name", "credit_limit"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[1].name).toBe("Bob");
      expect(result.rows[1].credit_limit).toBe("250");
    } finally {
      globalThis.FileReader = originalFileReader;
    }
  });
});
