using System.Security.Claims;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Batches;

public static class BatchEndpoints
{
    public static IEndpointRouteBuilder MapBatchEndpoints(this IEndpointRouteBuilder app)
    {
        var productGroup = app.MapGroup("/api/products/{productId:guid}/batches")
            .WithTags("Batches")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        productGroup.MapGet("/", async (
            Guid productId,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var product = await dbContext.Products.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == productId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (product is null)
            {
                return Results.NotFound(new { message = "Product not found." });
            }

            var batches = await dbContext.ProductBatches
                .AsNoTracking()
                .Where(x => x.ProductId == productId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value))
                .OrderByDescending(x => x.CreatedAtUtc)
                .Select(x => new
                {
                    id = x.Id,
                    product_id = x.ProductId,
                    supplier_id = x.SupplierId,
                    purchase_bill_id = x.PurchaseBillId,
                    batch_number = x.BatchNumber,
                    manufacture_date = x.ManufactureDate,
                    expiry_date = x.ExpiryDate,
                    initial_quantity = x.InitialQuantity,
                    remaining_quantity = x.RemainingQuantity,
                    cost_price = x.CostPrice,
                    received_at = x.ReceivedAtUtc,
                    created_at = x.CreatedAtUtc,
                    updated_at = x.UpdatedAtUtc
                })
                .ToListAsync(cancellationToken);

            return Results.Ok(new { product_id = productId, items = batches });
        })
        .WithName("ListProductBatches")
        .WithOpenApi();

        productGroup.MapPost("/", async (
            Guid productId,
            CreateBatchRequest request,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var product = await dbContext.Products
                .FirstOrDefaultAsync(x => x.Id == productId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (product is null)
            {
                return Results.NotFound(new { message = "Product not found." });
            }

            if (!product.IsBatchTracked)
            {
                return Results.BadRequest(new { message = "Product is not batch tracked." });
            }

            var batchNumber = Normalize(request.BatchNumber);
            if (string.IsNullOrWhiteSpace(batchNumber))
            {
                return Results.BadRequest(new { message = "batch_number is required." });
            }

            var existing = await dbContext.ProductBatches.AnyAsync(
                x => x.ProductId == productId &&
                     x.StoreId == product.StoreId &&
                     x.BatchNumber == batchNumber,
                cancellationToken);
            if (existing)
            {
                return Results.BadRequest(new { message = "Batch number already exists for this product." });
            }

            var now = DateTimeOffset.UtcNow;
            var batch = new ProductBatch
            {
                StoreId = product.StoreId,
                ProductId = product.Id,
                SupplierId = request.SupplierId,
                PurchaseBillId = request.PurchaseBillId,
                BatchNumber = batchNumber,
                ManufactureDate = request.ManufactureDate,
                ExpiryDate = request.ExpiryDate,
                InitialQuantity = request.InitialQuantity,
                RemainingQuantity = request.RemainingQuantity ?? request.InitialQuantity,
                CostPrice = request.CostPrice,
                ReceivedAtUtc = request.ReceivedAtUtc ?? now,
                CreatedAtUtc = now,
                UpdatedAtUtc = now,
                Product = product
            };

            dbContext.ProductBatches.Add(batch);
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Failed to save batch changes. Refresh and try again." });
            }

            return Results.Ok(ToBatchResponse(batch));
        })
        .WithName("CreateProductBatch")
        .WithOpenApi();

        productGroup.MapPut("/{batchId:guid}", async (
            Guid productId,
            Guid batchId,
            UpdateBatchRequest request,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var batch = await dbContext.ProductBatches
                .FirstOrDefaultAsync(x => x.Id == batchId && x.ProductId == productId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (batch is null)
            {
                return Results.NotFound(new { message = "Batch not found." });
            }

            if (batch.BatchNumber != Normalize(request.BatchNumber) && !string.IsNullOrWhiteSpace(Normalize(request.BatchNumber)))
            {
                var duplicate = await dbContext.ProductBatches.AnyAsync(
                    x => x.ProductId == productId &&
                         x.StoreId == batch.StoreId &&
                         x.BatchNumber == Normalize(request.BatchNumber) &&
                         x.Id != batchId,
                    cancellationToken);
                if (duplicate)
                {
                    return Results.BadRequest(new { message = "Batch number already exists for this product." });
                }
            }

            batch.SupplierId = request.SupplierId;
            batch.PurchaseBillId = request.PurchaseBillId;
            batch.BatchNumber = Normalize(request.BatchNumber) ?? batch.BatchNumber;
            batch.ManufactureDate = request.ManufactureDate;
            batch.ExpiryDate = request.ExpiryDate;
            batch.CostPrice = request.CostPrice;
            batch.RemainingQuantity = request.RemainingQuantity;
            batch.UpdatedAtUtc = DateTimeOffset.UtcNow;

            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Failed to save batch changes. Refresh and try again." });
            }

            return Results.Ok(ToBatchResponse(batch));
        })
        .WithName("UpdateProductBatch")
        .WithOpenApi();

        app.MapGet("/api/batches/expiring", async (
            int? days,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var thresholdDays = Math.Clamp(days ?? 30, 1, 3650);
            var limitDate = DateTimeOffset.UtcNow.AddDays(thresholdDays);

            var batches = await dbContext.ProductBatches
                .AsNoTracking()
                .Include(x => x.Product)
                .Where(x => !currentStoreId.HasValue || x.StoreId == currentStoreId.Value)
                .Where(x => x.ExpiryDate.HasValue && x.ExpiryDate <= limitDate)
                .OrderBy(x => x.ExpiryDate)
                .ToListAsync(cancellationToken);

            var now = DateTimeOffset.UtcNow.Date;
            var items = batches
                .Select(x => new
                {
                    id = x.Id,
                    product_id = x.ProductId,
                    product_name = x.Product.Name,
                    batch_number = x.BatchNumber,
                    expiry_date = x.ExpiryDate,
                    remaining_quantity = x.RemainingQuantity,
                    days_until_expiry = x.ExpiryDate.HasValue
                        ? (int)Math.Floor((x.ExpiryDate.Value.UtcDateTime.Date - now).TotalDays)
                        : (int?)null
                })
                .ToList();

            return Results.Ok(new
            {
                days = thresholdDays,
                items
            });
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithTags("Batches")
        .WithName("ListExpiringBatches")
        .WithOpenApi();

        return app;
    }

    private static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static object ToBatchResponse(ProductBatch batch)
    {
        return new
        {
            id = batch.Id,
            product_id = batch.ProductId,
            supplier_id = batch.SupplierId,
            purchase_bill_id = batch.PurchaseBillId,
            batch_number = batch.BatchNumber,
            manufacture_date = batch.ManufactureDate,
            expiry_date = batch.ExpiryDate,
            initial_quantity = batch.InitialQuantity,
            remaining_quantity = batch.RemainingQuantity,
            cost_price = batch.CostPrice,
            received_at = batch.ReceivedAtUtc,
            created_at = batch.CreatedAtUtc,
            updated_at = batch.UpdatedAtUtc
        };
    }
}

public sealed class CreateBatchRequest
{
    [JsonPropertyName("supplier_id")]
    public Guid? SupplierId { get; set; }

    [JsonPropertyName("purchase_bill_id")]
    public Guid? PurchaseBillId { get; set; }

    [JsonPropertyName("batch_number")]
    public string BatchNumber { get; set; } = string.Empty;

    [JsonPropertyName("manufacture_date")]
    public DateTimeOffset? ManufactureDate { get; set; }

    [JsonPropertyName("expiry_date")]
    public DateTimeOffset? ExpiryDate { get; set; }

    [JsonPropertyName("initial_quantity")]
    public decimal InitialQuantity { get; set; }

    [JsonPropertyName("remaining_quantity")]
    public decimal? RemainingQuantity { get; set; }

    [JsonPropertyName("cost_price")]
    public decimal CostPrice { get; set; }

    [JsonPropertyName("received_at")]
    public DateTimeOffset? ReceivedAtUtc { get; set; }
}

public sealed class UpdateBatchRequest
{
    [JsonPropertyName("supplier_id")]
    public Guid? SupplierId { get; set; }

    [JsonPropertyName("purchase_bill_id")]
    public Guid? PurchaseBillId { get; set; }

    [JsonPropertyName("batch_number")]
    public string? BatchNumber { get; set; }

    [JsonPropertyName("manufacture_date")]
    public DateTimeOffset? ManufactureDate { get; set; }

    [JsonPropertyName("expiry_date")]
    public DateTimeOffset? ExpiryDate { get; set; }

    [JsonPropertyName("remaining_quantity")]
    public decimal RemainingQuantity { get; set; }

    [JsonPropertyName("cost_price")]
    public decimal CostPrice { get; set; }
}
