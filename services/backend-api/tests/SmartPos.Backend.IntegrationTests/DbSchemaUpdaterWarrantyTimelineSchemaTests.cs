using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class DbSchemaUpdaterWarrantyTimelineSchemaTests
{
    [Fact]
    public async Task EnsureWarrantyTimelineSchemaAsync_Sqlite_BackfillsLegacyWarrantyColumns()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"smartpos-warranty-schema-it-{Guid.NewGuid():N}.db");

        try
        {
            var options = new DbContextOptionsBuilder<SmartPosDbContext>()
                .UseSqlite($"Data Source={dbPath}")
                .Options;

            await using var dbContext = new SmartPosDbContext(options);
            await dbContext.Database.OpenConnectionAsync();

            await dbContext.Database.ExecuteSqlRawAsync(
                """
                CREATE TABLE IF NOT EXISTS "warranty_claims" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_warranty_claims" PRIMARY KEY,
                  "StoreId" TEXT NULL,
                  "SerialNumberId" TEXT NOT NULL,
                  "ClaimDate" TEXT NOT NULL,
                  "Status" TEXT NOT NULL DEFAULT 'Open',
                  "ResolutionNotes" TEXT NULL,
                  "CreatedByUserId" TEXT NULL,
                  "CreatedAtUtc" TEXT NOT NULL,
                  "UpdatedAtUtc" TEXT NULL
                );
                """);

            await DbSchemaUpdater.EnsureWarrantyTimelineSchemaAsync(dbContext);

            Assert.True(await ColumnExistsAsync(dbContext, "warranty_claims", "SupplierName"));
            Assert.True(await ColumnExistsAsync(dbContext, "warranty_claims", "HandoverDate"));
            Assert.True(await ColumnExistsAsync(dbContext, "warranty_claims", "PickupPersonName"));
            Assert.True(await ColumnExistsAsync(dbContext, "warranty_claims", "ReceivedBackDate"));
            Assert.True(await ColumnExistsAsync(dbContext, "warranty_claims", "ReceivedBackPersonName"));
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
