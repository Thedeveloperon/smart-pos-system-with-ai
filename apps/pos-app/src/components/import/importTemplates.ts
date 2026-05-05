export type ImportEntityType = "brand" | "category" | "product" | "customer";

type TemplateConfig = {
  label: string;
  filename: string;
  columns: string[];
  requiredColumns: string[];
  exampleRows: string[][];
  hint?: string;
};

export const IMPORT_TEMPLATES: Record<ImportEntityType, TemplateConfig> = {
  brand: {
    label: "Brands",
    filename: "brands-template.csv",
    columns: ["name", "code", "description", "is_active"],
    requiredColumns: ["name"],
    exampleRows: [
      ["Nike", "NIKE", "Sports apparel and footwear", "true"],
      ["Adidas", "ADI", "", "true"],
      ["Puma", "", "", "true"],
    ],
  },
  category: {
    label: "Categories",
    filename: "categories-template.csv",
    columns: ["name", "description", "is_active"],
    requiredColumns: ["name"],
    exampleRows: [
      ["Footwear", "All shoes and sandals", "true"],
      ["Electronics", "Electronic devices and accessories", "true"],
    ],
  },
  product: {
    label: "Products",
    filename: "products-template.csv",
    columns: [
      "name",
      "sku",
      "barcode",
      "category_name",
      "brand_name",
      "unit_price",
      "cost_price",
      "initial_stock_quantity",
      "reorder_level",
      "safety_stock",
      "target_stock_level",
      "allow_negative_stock",
      "is_active",
    ],
    requiredColumns: ["name", "unit_price", "cost_price", "initial_stock_quantity"],
    exampleRows: [
      ["Running Shoe X1", "SHOE-X1", "1234567890128", "Footwear", "Nike", "49.99", "29.00", "50", "5", "2", "100", "true", "true"],
      ["Wireless Headphones", "WH-PRO-01", "", "Electronics", "Sony", "149.99", "89.00", "20", "3", "1", "50", "true", "true"],
    ],
    hint: "Use category_name and brand_name exactly as they appear in the system (case-insensitive).",
  },
  customer: {
    label: "Customers",
    filename: "customers-template.csv",
    columns: ["name", "code", "phone", "email", "address", "date_of_birth", "credit_limit", "notes", "is_active"],
    requiredColumns: ["name"],
    exampleRows: [
      ["Jane Smith", "C-0001", "+1-555-1234", "jane@example.com", "123 Main St", "1990-06-15", "0", "", "true"],
      ["Bob Johnson", "", "+1-555-5678", "", "", "", "500", "VIP customer", "true"],
    ],
    hint: "date_of_birth format: YYYY-MM-DD.",
  },
};

export function downloadTemplate(entityType: ImportEntityType): void {
  const config = IMPORT_TEMPLATES[entityType];
  const lines: string[] = [
    config.columns.join(","),
    ...config.exampleRows.map((row) =>
      row
        .map((cell) => {
          if (cell.includes(",") || cell.includes("\"")) {
            return `"${cell.replaceAll("\"", "\"\"")}"`;
          }

          return cell;
        })
        .join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = config.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
