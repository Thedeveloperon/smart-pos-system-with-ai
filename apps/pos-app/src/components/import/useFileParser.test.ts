import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseFile } from "./useFileParser";

describe("useFileParser", () => {
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

  it("parses XLSX headers and rows", async () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Name", "Credit Limit"],
      ["Jane", 100],
      ["Bob", 250],
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    const raw = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = new File([raw], "customers.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const result = await parseFile(file);
    expect(result.error).toBeNull();
    expect(result.headers).toEqual(["name", "credit_limit"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1].name).toBe("Bob");
    expect(result.rows[1].credit_limit).toBe("250");
  });
});
