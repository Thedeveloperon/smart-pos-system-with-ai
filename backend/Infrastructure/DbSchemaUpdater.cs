using Microsoft.EntityFrameworkCore;

namespace SmartPos.Backend.Infrastructure;

public static class DbSchemaUpdater
{
    public static async Task EnsureProductImageSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            if (await ColumnExistsAsync(dbContext, "products", "ImageUrl", cancellationToken))
            {
                return;
            }

            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE "products" ADD COLUMN "ImageUrl" TEXT NULL;""",
                cancellationToken);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            if (await ColumnExistsAsync(dbContext, "products", "ImageUrl", cancellationToken))
            {
                return;
            }

            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE products ADD COLUMN IF NOT EXISTS "ImageUrl" varchar(500);""",
                cancellationToken);
        }
    }

    public static async Task EnsureShopProfileSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            var sql = """
                CREATE TABLE IF NOT EXISTS "shop_profiles" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_shop_profiles" PRIMARY KEY,
                  "ShopName" TEXT NOT NULL,
                  "AddressLine1" TEXT NULL,
                  "AddressLine2" TEXT NULL,
                  "Phone" TEXT NULL,
                  "Email" TEXT NULL,
                  "Website" TEXT NULL,
                  "LogoUrl" TEXT NULL,
                  "ReceiptFooter" TEXT NULL,
                  "CreatedAtUtc" TEXT NOT NULL,
                  "UpdatedAtUtc" TEXT NULL
                );
                """;

            await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            var sql = """
                CREATE TABLE IF NOT EXISTS shop_profiles (
                  "Id" uuid NOT NULL PRIMARY KEY,
                  "ShopName" varchar(160) NOT NULL,
                  "AddressLine1" varchar(180) NULL,
                  "AddressLine2" varchar(180) NULL,
                  "Phone" varchar(32) NULL,
                  "Email" varchar(120) NULL,
                  "Website" varchar(120) NULL,
                  "LogoUrl" varchar(500) NULL,
                  "ReceiptFooter" varchar(500) NULL,
                  "CreatedAtUtc" timestamptz NOT NULL,
                  "UpdatedAtUtc" timestamptz NULL
                );
                """;

            await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
        }
    }

    public static async Task EnsureRefundSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            await EnsureSqliteRefundSchemaAsync(dbContext, cancellationToken);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            await EnsurePostgresRefundSchemaAsync(dbContext, cancellationToken);
        }
    }

    public static async Task EnsurePurchasingSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            await EnsureSqlitePurchasingSchemaAsync(dbContext, cancellationToken);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            await EnsurePostgresPurchasingSchemaAsync(dbContext, cancellationToken);
        }
    }

    private static async Task EnsureSqliteRefundSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var sql = """
            CREATE TABLE IF NOT EXISTS "refunds" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_refunds" PRIMARY KEY,
              "StoreId" TEXT NULL,
              "SaleId" TEXT NOT NULL,
              "RefundNumber" TEXT NOT NULL,
              "Reason" TEXT NOT NULL,
              "SubtotalAmount" TEXT NOT NULL,
              "DiscountAmount" TEXT NOT NULL,
              "TaxAmount" TEXT NOT NULL,
              "GrandTotal" TEXT NOT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              CONSTRAINT "FK_refunds_sales_SaleId" FOREIGN KEY ("SaleId") REFERENCES "sales" ("Id") ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS "refund_items" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_refund_items" PRIMARY KEY,
              "RefundId" TEXT NOT NULL,
              "SaleItemId" TEXT NOT NULL,
              "ProductId" TEXT NOT NULL,
              "ProductNameSnapshot" TEXT NOT NULL,
              "Quantity" TEXT NOT NULL,
              "SubtotalAmount" TEXT NOT NULL,
              "DiscountAmount" TEXT NOT NULL,
              "TaxAmount" TEXT NOT NULL,
              "TotalAmount" TEXT NOT NULL,
              CONSTRAINT "FK_refund_items_refunds_RefundId" FOREIGN KEY ("RefundId") REFERENCES "refunds" ("Id") ON DELETE CASCADE,
              CONSTRAINT "FK_refund_items_sale_items_SaleItemId" FOREIGN KEY ("SaleItemId") REFERENCES "sale_items" ("Id") ON DELETE RESTRICT
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_refunds_RefundNumber" ON "refunds" ("RefundNumber");
            CREATE INDEX IF NOT EXISTS "IX_refunds_SaleId" ON "refunds" ("SaleId");
            CREATE INDEX IF NOT EXISTS "IX_refund_items_RefundId" ON "refund_items" ("RefundId");
            CREATE INDEX IF NOT EXISTS "IX_refund_items_SaleItemId" ON "refund_items" ("SaleItemId");
            """;

        await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
    }

    private static async Task<bool> ColumnExistsAsync(
        SmartPosDbContext dbContext,
        string tableName,
        string columnName,
        CancellationToken cancellationToken)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;
        var connection = dbContext.Database.GetDbConnection();

        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        var sql = provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase)
            ? $"""SELECT 1 FROM pragma_table_info('{tableName}') WHERE name = '{columnName}' LIMIT 1;"""
            : $"""SELECT 1 FROM information_schema.columns WHERE table_name = '{tableName}' AND column_name = '{columnName}' LIMIT 1;""";

        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null && result is not DBNull;
    }

    private static async Task EnsurePostgresRefundSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var sql = """
            CREATE TABLE IF NOT EXISTS refunds (
              "Id" uuid NOT NULL PRIMARY KEY,
              "StoreId" uuid NULL,
              "SaleId" uuid NOT NULL REFERENCES sales("Id") ON DELETE CASCADE,
              "RefundNumber" varchar(32) NOT NULL,
              "Reason" varchar(250) NOT NULL,
              "SubtotalAmount" numeric(18,2) NOT NULL,
              "DiscountAmount" numeric(18,2) NOT NULL,
              "TaxAmount" numeric(18,2) NOT NULL,
              "GrandTotal" numeric(18,2) NOT NULL,
              "CreatedAtUtc" timestamptz NOT NULL
            );

            CREATE TABLE IF NOT EXISTS refund_items (
              "Id" uuid NOT NULL PRIMARY KEY,
              "RefundId" uuid NOT NULL REFERENCES refunds("Id") ON DELETE CASCADE,
              "SaleItemId" uuid NOT NULL REFERENCES sale_items("Id") ON DELETE RESTRICT,
              "ProductId" uuid NOT NULL,
              "ProductNameSnapshot" varchar(200) NOT NULL,
              "Quantity" numeric(18,3) NOT NULL,
              "SubtotalAmount" numeric(18,2) NOT NULL,
              "DiscountAmount" numeric(18,2) NOT NULL,
              "TaxAmount" numeric(18,2) NOT NULL,
              "TotalAmount" numeric(18,2) NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_refunds_RefundNumber" ON refunds("RefundNumber");
            CREATE INDEX IF NOT EXISTS "IX_refunds_SaleId" ON refunds("SaleId");
            CREATE INDEX IF NOT EXISTS "IX_refund_items_RefundId" ON refund_items("RefundId");
            CREATE INDEX IF NOT EXISTS "IX_refund_items_SaleItemId" ON refund_items("SaleItemId");
            """;

        await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
    }

    private static async Task EnsureSqlitePurchasingSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var sql = """
            CREATE TABLE IF NOT EXISTS "suppliers" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_suppliers" PRIMARY KEY,
              "StoreId" TEXT NULL,
              "Name" TEXT NOT NULL,
              "Code" TEXT NULL,
              "ContactName" TEXT NULL,
              "Phone" TEXT NULL,
              "Email" TEXT NULL,
              "Address" TEXT NULL,
              "IsActive" INTEGER NOT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              "UpdatedAtUtc" TEXT NULL
            );

            CREATE TABLE IF NOT EXISTS "purchase_bills" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_purchase_bills" PRIMARY KEY,
              "StoreId" TEXT NULL,
              "ImportRequestId" TEXT NULL,
              "SupplierId" TEXT NOT NULL,
              "InvoiceNumber" TEXT NOT NULL,
              "InvoiceDateUtc" TEXT NOT NULL,
              "Currency" TEXT NOT NULL,
              "Subtotal" TEXT NOT NULL,
              "DiscountTotal" TEXT NOT NULL,
              "TaxTotal" TEXT NOT NULL,
              "GrandTotal" TEXT NOT NULL,
              "SourceType" TEXT NOT NULL,
              "OcrConfidence" TEXT NULL,
              "CreatedByUserId" TEXT NULL,
              "Notes" TEXT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              "UpdatedAtUtc" TEXT NULL,
              CONSTRAINT "FK_purchase_bills_suppliers_SupplierId" FOREIGN KEY ("SupplierId") REFERENCES "suppliers" ("Id") ON DELETE RESTRICT,
              CONSTRAINT "FK_purchase_bills_users_CreatedByUserId" FOREIGN KEY ("CreatedByUserId") REFERENCES "users" ("Id") ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS "purchase_bill_items" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_purchase_bill_items" PRIMARY KEY,
              "PurchaseBillId" TEXT NOT NULL,
              "ProductId" TEXT NOT NULL,
              "ProductNameSnapshot" TEXT NOT NULL,
              "SupplierItemName" TEXT NULL,
              "Quantity" TEXT NOT NULL,
              "UnitCost" TEXT NOT NULL,
              "TaxAmount" TEXT NOT NULL,
              "LineTotal" TEXT NOT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              CONSTRAINT "FK_purchase_bill_items_purchase_bills_PurchaseBillId" FOREIGN KEY ("PurchaseBillId") REFERENCES "purchase_bills" ("Id") ON DELETE CASCADE,
              CONSTRAINT "FK_purchase_bill_items_products_ProductId" FOREIGN KEY ("ProductId") REFERENCES "products" ("Id") ON DELETE RESTRICT
            );

            CREATE TABLE IF NOT EXISTS "bill_documents" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_bill_documents" PRIMARY KEY,
              "StoreId" TEXT NULL,
              "PurchaseBillId" TEXT NULL,
              "FileName" TEXT NOT NULL,
              "ContentType" TEXT NOT NULL,
              "StoragePath" TEXT NULL,
              "FileHash" TEXT NULL,
              "OcrStatus" TEXT NOT NULL,
              "OcrConfidence" TEXT NULL,
              "ExtractedPayloadJson" TEXT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              "ProcessedAtUtc" TEXT NULL,
              CONSTRAINT "FK_bill_documents_purchase_bills_PurchaseBillId" FOREIGN KEY ("PurchaseBillId") REFERENCES "purchase_bills" ("Id") ON DELETE SET NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_suppliers_StoreId_Name" ON "suppliers" ("StoreId", "Name");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_suppliers_StoreId_Code" ON "suppliers" ("StoreId", "Code");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_SupplierId_InvoiceNumber" ON "purchase_bills" ("StoreId", "SupplierId", "InvoiceNumber");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_ImportRequestId" ON "purchase_bills" ("StoreId", "ImportRequestId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_ImportRequestId" ON "purchase_bills" ("ImportRequestId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bills_SupplierId" ON "purchase_bills" ("SupplierId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bills_CreatedByUserId" ON "purchase_bills" ("CreatedByUserId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bill_items_PurchaseBillId" ON "purchase_bill_items" ("PurchaseBillId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bill_items_ProductId" ON "purchase_bill_items" ("ProductId");
            CREATE INDEX IF NOT EXISTS "IX_bill_documents_PurchaseBillId" ON "bill_documents" ("PurchaseBillId");
            CREATE INDEX IF NOT EXISTS "IX_bill_documents_FileHash" ON "bill_documents" ("FileHash");
            """;

        await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);

        if (!await ColumnExistsAsync(dbContext, "purchase_bills", "ImportRequestId", cancellationToken))
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE "purchase_bills" ADD COLUMN "ImportRequestId" TEXT NULL;""",
                cancellationToken);
        }

        await dbContext.Database.ExecuteSqlRawAsync(
            """CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_ImportRequestId" ON "purchase_bills" ("StoreId", "ImportRequestId");""",
            cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync(
            """CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_ImportRequestId" ON "purchase_bills" ("ImportRequestId");""",
            cancellationToken);
    }

    private static async Task EnsurePostgresPurchasingSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var sql = """
            CREATE TABLE IF NOT EXISTS suppliers (
              "Id" uuid NOT NULL PRIMARY KEY,
              "StoreId" uuid NULL,
              "Name" varchar(160) NOT NULL,
              "Code" varchar(64) NULL,
              "ContactName" varchar(120) NULL,
              "Phone" varchar(32) NULL,
              "Email" varchar(120) NULL,
              "Address" varchar(500) NULL,
              "IsActive" boolean NOT NULL,
              "CreatedAtUtc" timestamptz NOT NULL,
              "UpdatedAtUtc" timestamptz NULL
            );

            CREATE TABLE IF NOT EXISTS purchase_bills (
              "Id" uuid NOT NULL PRIMARY KEY,
              "StoreId" uuid NULL,
              "ImportRequestId" varchar(80) NULL,
              "SupplierId" uuid NOT NULL REFERENCES suppliers("Id") ON DELETE RESTRICT,
              "InvoiceNumber" varchar(80) NOT NULL,
              "InvoiceDateUtc" timestamptz NOT NULL,
              "Currency" varchar(8) NOT NULL,
              "Subtotal" numeric(18,2) NOT NULL,
              "DiscountTotal" numeric(18,2) NOT NULL,
              "TaxTotal" numeric(18,2) NOT NULL,
              "GrandTotal" numeric(18,2) NOT NULL,
              "SourceType" varchar(32) NOT NULL,
              "OcrConfidence" numeric(6,4) NULL,
              "CreatedByUserId" uuid NULL REFERENCES users("Id") ON DELETE SET NULL,
              "Notes" varchar(500) NULL,
              "CreatedAtUtc" timestamptz NOT NULL,
              "UpdatedAtUtc" timestamptz NULL
            );

            CREATE TABLE IF NOT EXISTS purchase_bill_items (
              "Id" uuid NOT NULL PRIMARY KEY,
              "PurchaseBillId" uuid NOT NULL REFERENCES purchase_bills("Id") ON DELETE CASCADE,
              "ProductId" uuid NOT NULL REFERENCES products("Id") ON DELETE RESTRICT,
              "ProductNameSnapshot" varchar(200) NOT NULL,
              "SupplierItemName" varchar(200) NULL,
              "Quantity" numeric(18,3) NOT NULL,
              "UnitCost" numeric(18,2) NOT NULL,
              "TaxAmount" numeric(18,2) NOT NULL,
              "LineTotal" numeric(18,2) NOT NULL,
              "CreatedAtUtc" timestamptz NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bill_documents (
              "Id" uuid NOT NULL PRIMARY KEY,
              "StoreId" uuid NULL,
              "PurchaseBillId" uuid NULL REFERENCES purchase_bills("Id") ON DELETE SET NULL,
              "FileName" varchar(260) NOT NULL,
              "ContentType" varchar(120) NOT NULL,
              "StoragePath" varchar(500) NULL,
              "FileHash" varchar(128) NULL,
              "OcrStatus" varchar(32) NOT NULL,
              "OcrConfidence" numeric(6,4) NULL,
              "ExtractedPayloadJson" text NULL,
              "CreatedAtUtc" timestamptz NOT NULL,
              "ProcessedAtUtc" timestamptz NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_suppliers_StoreId_Name" ON suppliers("StoreId", "Name");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_suppliers_StoreId_Code" ON suppliers("StoreId", "Code");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_SupplierId_InvoiceNumber" ON purchase_bills("StoreId", "SupplierId", "InvoiceNumber");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_ImportRequestId" ON purchase_bills("StoreId", "ImportRequestId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_ImportRequestId" ON purchase_bills("ImportRequestId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bills_SupplierId" ON purchase_bills("SupplierId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bills_CreatedByUserId" ON purchase_bills("CreatedByUserId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bill_items_PurchaseBillId" ON purchase_bill_items("PurchaseBillId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bill_items_ProductId" ON purchase_bill_items("ProductId");
            CREATE INDEX IF NOT EXISTS "IX_bill_documents_PurchaseBillId" ON bill_documents("PurchaseBillId");
            CREATE INDEX IF NOT EXISTS "IX_bill_documents_FileHash" ON bill_documents("FileHash");
            """;

        await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);

        if (!await ColumnExistsAsync(dbContext, "purchase_bills", "ImportRequestId", cancellationToken))
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS "ImportRequestId" varchar(80);""",
                cancellationToken);
        }

        await dbContext.Database.ExecuteSqlRawAsync(
            """CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_ImportRequestId" ON purchase_bills("StoreId", "ImportRequestId");""",
            cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync(
            """CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_ImportRequestId" ON purchase_bills("ImportRequestId");""",
            cancellationToken);
    }
}
