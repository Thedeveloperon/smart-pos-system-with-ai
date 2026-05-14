using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class DbSchemaUpdaterPurchasingSchemaTests
{
    [Fact]
    public async Task EnsurePurchasingSchemaAsync_Sqlite_LegacyPurchaseBillsTableBackfillsLateColumnsBeforeIndexes()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"smartpos-purchasing-schema-it-{Guid.NewGuid():N}.db");

        try
        {
            var options = new DbContextOptionsBuilder<SmartPosDbContext>()
                .UseSqlite($"Data Source={dbPath}")
                .Options;

            await using var dbContext = new SmartPosDbContext(options);
            await dbContext.Database.OpenConnectionAsync();

            await dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE IF NOT EXISTS "users" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_users" PRIMARY KEY,
                  "StoreId" TEXT NULL
                );

                CREATE TABLE IF NOT EXISTS "products" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_products" PRIMARY KEY
                );

                CREATE TABLE IF NOT EXISTS "suppliers" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_suppliers" PRIMARY KEY,
                  "StoreId" TEXT NULL,
                  "Name" TEXT NOT NULL,
                  "Phone" TEXT NULL,
                  "Address" TEXT NULL,
                  "IsActive" INTEGER NOT NULL,
                  "CreatedAtUtc" TEXT NOT NULL,
                  "UpdatedAtUtc" TEXT NULL
                );

                CREATE TABLE IF NOT EXISTS "purchase_bills" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_purchase_bills" PRIMARY KEY,
                  "StoreId" TEXT NULL,
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
                  "UpdatedAtUtc" TEXT NULL
                );
                """);

            await DbSchemaUpdater.EnsurePurchasingSchemaAsync(dbContext);

            Assert.True(await ColumnExistsAsync(dbContext, "suppliers", "CompanyName"));
            Assert.True(await ColumnExistsAsync(dbContext, "suppliers", "CompanyPhone"));
            Assert.True(await ColumnExistsAsync(dbContext, "purchase_bills", "PurchaseOrderId"));
            Assert.True(await ColumnExistsAsync(dbContext, "purchase_bills", "ImportRequestId"));
            Assert.True(await IndexExistsAsync(dbContext, "purchase_bills", "IX_purchase_bills_PurchaseOrderId"));
            Assert.True(await IndexExistsAsync(dbContext, "purchase_bills", "IX_purchase_bills_StoreId_ImportRequestId"));
            Assert.True(await IndexExistsAsync(dbContext, "purchase_bills", "IX_purchase_bills_ImportRequestId"));
        }
        finally
        {
            try
            {
                if (File.Exists(dbPath))
                {
                    File.Delete(dbPath);
                }
            }
            catch
            {
                // best-effort cleanup
            }
        }
    }

    private static async Task<bool> ColumnExistsAsync(
        SmartPosDbContext dbContext,
        string tableName,
        string columnName)
    {
        var connection = dbContext.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync();
        }

        await using var command = connection.CreateCommand();
        command.CommandText = $"""SELECT 1 FROM pragma_table_info('{tableName}') WHERE name = '{columnName}' LIMIT 1;""";
        var result = await command.ExecuteScalarAsync();
        return result is not null && result is not DBNull;
    }

    private static async Task<bool> IndexExistsAsync(
        SmartPosDbContext dbContext,
        string tableName,
        string indexName)
    {
        var connection = dbContext.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync();
        }

        await using var command = connection.CreateCommand();
        command.CommandText = $"""SELECT 1 FROM pragma_index_list('{tableName}') WHERE name = '{indexName}' LIMIT 1;""";
        var result = await command.ExecuteScalarAsync();
        return result is not null && result is not DBNull;
    }
}
