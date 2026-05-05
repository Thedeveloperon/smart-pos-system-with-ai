using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Import;

public sealed class ImportRowResult
{
    [JsonPropertyName("row_index")]
    public int RowIndex { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "error";

    [JsonPropertyName("entity_id")]
    public Guid? EntityId { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("error")]
    public string? Error { get; set; }
}

public sealed class ImportSummary
{
    [JsonPropertyName("total")]
    public int Total { get; set; }

    [JsonPropertyName("inserted")]
    public int Inserted { get; set; }

    [JsonPropertyName("updated")]
    public int Updated { get; set; }

    [JsonPropertyName("skipped")]
    public int Skipped { get; set; }

    [JsonPropertyName("errors")]
    public int Errors { get; set; }

    [JsonPropertyName("rows")]
    public List<ImportRowResult> Rows { get; set; } = [];
}

public sealed class BulkImportBrandsRequest
{
    [JsonPropertyName("rows")]
    public List<BulkImportBrandRow> Rows { get; set; } = [];

    [JsonPropertyName("duplicate_strategy")]
    public string DuplicateStrategy { get; set; } = string.Empty;
}

public sealed class BulkImportBrandRow
{
    [JsonPropertyName("row_index")]
    public int RowIndex { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string? Code { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
}

public sealed class BulkImportCategoriesRequest
{
    [JsonPropertyName("rows")]
    public List<BulkImportCategoryRow> Rows { get; set; } = [];

    [JsonPropertyName("duplicate_strategy")]
    public string DuplicateStrategy { get; set; } = string.Empty;
}

public sealed class BulkImportCategoryRow
{
    [JsonPropertyName("row_index")]
    public int RowIndex { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string? Description { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
}

public sealed class BulkImportProductsRequest
{
    [JsonPropertyName("rows")]
    public List<BulkImportProductRow> Rows { get; set; } = [];

    [JsonPropertyName("duplicate_strategy")]
    public string DuplicateStrategy { get; set; } = string.Empty;
}

public sealed class BulkImportProductRow
{
    [JsonPropertyName("row_index")]
    public int RowIndex { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("sku")]
    public string? Sku { get; set; }

    [JsonPropertyName("barcode")]
    public string? Barcode { get; set; }

    [JsonPropertyName("category_name")]
    public string? CategoryName { get; set; }

    [JsonPropertyName("brand_name")]
    public string? BrandName { get; set; }

    [JsonPropertyName("unit_price")]
    public decimal UnitPrice { get; set; }

    [JsonPropertyName("cost_price")]
    public decimal CostPrice { get; set; }

    [JsonPropertyName("initial_stock_quantity")]
    public decimal InitialStockQuantity { get; set; }

    [JsonPropertyName("reorder_level")]
    public decimal ReorderLevel { get; set; }

    [JsonPropertyName("safety_stock")]
    public decimal SafetyStock { get; set; }

    [JsonPropertyName("target_stock_level")]
    public decimal TargetStockLevel { get; set; }

    [JsonPropertyName("allow_negative_stock")]
    public bool AllowNegativeStock { get; set; } = true;

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
}

public sealed class BulkImportCustomersRequest
{
    [JsonPropertyName("rows")]
    public List<BulkImportCustomerRow> Rows { get; set; } = [];

    [JsonPropertyName("duplicate_strategy")]
    public string DuplicateStrategy { get; set; } = string.Empty;
}

public sealed class BulkImportCustomerRow
{
    [JsonPropertyName("row_index")]
    public int RowIndex { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("code")]
    public string? Code { get; set; }

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("address")]
    public string? Address { get; set; }

    [JsonPropertyName("date_of_birth")]
    public string? DateOfBirth { get; set; }

    [JsonPropertyName("credit_limit")]
    public decimal CreditLimit { get; set; }

    [JsonPropertyName("notes")]
    public string? Notes { get; set; }

    [JsonPropertyName("is_active")]
    public bool IsActive { get; set; } = true;
}
