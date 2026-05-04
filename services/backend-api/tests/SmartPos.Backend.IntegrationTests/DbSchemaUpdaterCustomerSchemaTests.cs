using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class DbSchemaUpdaterCustomerSchemaTests
{
    [Fact]
    public async Task EnsureCustomerSchemaAsync_Sqlite_BackfillsLegacyCustomerIdNumberColumn()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"smartpos-customer-schema-it-{Guid.NewGuid():N}.db");

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
                  "Id" TEXT NOT NULL CONSTRAINT "PK_users" PRIMARY KEY
                );

                CREATE TABLE IF NOT EXISTS "sales" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_sales" PRIMARY KEY
                );

                CREATE TABLE IF NOT EXISTS "customer_price_tiers" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_customer_price_tiers" PRIMARY KEY
                );

                CREATE TABLE IF NOT EXISTS "customers" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_customers" PRIMARY KEY,
                  "StoreId" TEXT NULL,
                  "PriceTierId" TEXT NULL,
                  "Name" TEXT NOT NULL,
                  "Code" TEXT NULL,
                  "Phone" TEXT NULL,
                  "Email" TEXT NULL,
                  "Address" TEXT NULL,
                  "DateOfBirth" TEXT NULL,
                  "FixedDiscountPercent" TEXT NULL,
                  "CreditLimit" TEXT NOT NULL DEFAULT '0',
                  "OutstandingBalance" TEXT NOT NULL DEFAULT '0',
                  "LoyaltyPoints" TEXT NOT NULL DEFAULT '0',
                  "Notes" TEXT NULL,
                  "IsActive" INTEGER NOT NULL DEFAULT 1,
                  "CreatedAtUtc" TEXT NOT NULL,
                  "UpdatedAtUtc" TEXT NULL
                );
                """);

            await DbSchemaUpdater.EnsureCustomerSchemaAsync(dbContext);

            Assert.True(await ColumnExistsAsync(dbContext, "customers", "IdNumber"));
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
}
