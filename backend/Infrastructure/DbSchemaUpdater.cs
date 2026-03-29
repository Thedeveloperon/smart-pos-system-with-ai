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
}
