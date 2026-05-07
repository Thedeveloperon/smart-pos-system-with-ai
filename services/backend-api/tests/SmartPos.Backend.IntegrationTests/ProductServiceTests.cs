using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Features.Products;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.IntegrationTests;

public sealed class ProductServiceTests
{
    [Fact]
    public async Task UpdateProductAsync_ShouldAllowReactivatingLegacyProductWithUnchangedInvalidBarcode()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var dbOptions = new DbContextOptionsBuilder<SmartPosDbContext>()
            .UseSqlite(connection)
            .Options;

        await using var dbContext = new SmartPosDbContext(dbOptions);
        await dbContext.Database.EnsureCreatedAsync();

        var now = DateTimeOffset.UtcNow;
        var product = new Product
        {
            Name = "Legacy Barcode Product",
            Sku = "LEG-001",
            Barcode = "20000016",
            UnitPrice = 175m,
            CostPrice = 120m,
            IsActive = false,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        var inventory = new InventoryRecord
        {
            Product = product,
            InitialStockQuantity = 4m,
            QuantityOnHand = 4m,
            ReorderLevel = 1m,
            SafetyStock = 0m,
            TargetStockLevel = 4m,
            AllowNegativeStock = false,
            UpdatedAtUtc = now
        };
        product.Inventory = inventory;

        dbContext.Products.Add(product);
        await dbContext.SaveChangesAsync();

        var httpContextAccessor = new HttpContextAccessor();
        var auditLogService = new AuditLogService(dbContext, httpContextAccessor);
        var stockMovementHelper = new StockMovementHelper(dbContext);
        var productService = new ProductService(dbContext, auditLogService, stockMovementHelper, httpContextAccessor);

        var result = await productService.UpdateProductAsync(
            product.Id,
            new UpdateProductRequest
            {
                Name = "Legacy Barcode Product",
                Sku = "LEG-001",
                Barcode = "20000016",
                UnitPrice = 175m,
                CostPrice = 120m,
                InitialStockQuantity = 4m,
                ReorderLevel = 1m,
                SafetyStock = 0m,
                TargetStockLevel = 4m,
                AllowNegativeStock = false,
                IsActive = true
            },
            CancellationToken.None);

        Assert.True(result.IsActive);
        Assert.Equal("20000016", result.Barcode);

        var persisted = await dbContext.Products.AsNoTracking().SingleAsync(x => x.Id == product.Id);
        Assert.True(persisted.IsActive);
        Assert.Equal("20000016", persisted.Barcode);
    }
}
