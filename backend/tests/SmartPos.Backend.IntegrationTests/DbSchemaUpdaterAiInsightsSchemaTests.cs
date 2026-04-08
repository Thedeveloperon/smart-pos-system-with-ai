using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class DbSchemaUpdaterAiInsightsSchemaTests
{
    [Fact]
    public async Task EnsureAiInsightsSchemaAsync_Sqlite_AddsShopScopedColumns()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"smartpos-schema-it-{Guid.NewGuid():N}.db");

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

                CREATE TABLE IF NOT EXISTS "shops" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_shops" PRIMARY KEY,
                  "Code" TEXT NOT NULL,
                  "Name" TEXT NOT NULL,
                  "CreatedAtUtc" TEXT NOT NULL
                );
                """);

            await DbSchemaUpdater.EnsureAiInsightsSchemaAsync(dbContext);

            Assert.True(await ColumnExistsAsync(dbContext, "ai_credit_wallets", "ShopId"));
            Assert.True(await ColumnExistsAsync(dbContext, "ai_credit_ledger", "ShopId"));
            Assert.True(await ColumnExistsAsync(dbContext, "ai_credit_payments", "ShopId"));
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
