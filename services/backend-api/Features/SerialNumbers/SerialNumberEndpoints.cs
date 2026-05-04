using System.Security.Claims;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.SerialNumbers;

public static class SerialNumberEndpoints
{
    public static IEndpointRouteBuilder MapSerialNumberEndpoints(this IEndpointRouteBuilder app)
    {
        var productGroup = app.MapGroup("/api/products/{productId:guid}/serials")
            .WithTags("Serial Numbers")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        productGroup.MapGet("/", async (
            Guid productId,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var product = await dbContext.Products
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == productId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (product is null)
            {
                return Results.NotFound(new { message = "Product not found." });
            }

            // SQLite cannot translate ORDER BY over DateTimeOffset columns, so sort after materialization.
            var serials = (await dbContext.SerialNumbers
                    .AsNoTracking()
                    .Where(x => x.ProductId == productId)
                    .Select(x => new
                    {
                        id = x.Id,
                        product_id = x.ProductId,
                        serial_value = x.SerialValue,
                        status = x.Status,
                        sale_id = x.SaleId,
                        sale_item_id = x.SaleItemId,
                        refund_id = x.RefundId,
                        warranty_expiry_date = x.WarrantyExpiryDate,
                        created_at = x.CreatedAtUtc,
                        updated_at = x.UpdatedAtUtc
                    })
                    .ToListAsync(cancellationToken))
                .OrderByDescending(x => x.created_at)
                .ToList();

            return Results.Ok(new
            {
                product_id = productId,
                items = serials
            });
        })
        .WithName("ListProductSerialNumbers")
        .WithOpenApi();

        productGroup.MapPost("/", async (
            Guid productId,
            AddSerialNumbersRequest request,
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

            if (!product.IsSerialTracked)
            {
                return Results.BadRequest(new { message = "Product is not serial tracked." });
            }

            if (request.Serials.Count == 0)
            {
                return Results.BadRequest(new { message = "serials is required." });
            }

            var normalized = request.Serials
                .Select(NormalizeSerial)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (normalized.Count == 0)
            {
                return Results.BadRequest(new { message = "At least one serial value is required." });
            }

            var existing = await dbContext.SerialNumbers
                .Where(x => x.ProductId == productId && normalized.Contains(x.SerialValue))
                .Select(x => x.SerialValue)
                .ToListAsync(cancellationToken);

            if (existing.Count > 0)
            {
                return Results.BadRequest(new
                {
                    message = $"Serials already exist: {string.Join(", ", existing)}"
                });
            }

            var now = DateTimeOffset.UtcNow;
            var items = normalized.Select(serial => new SerialNumber
            {
                ProductId = productId,
                StoreId = product.StoreId,
                SerialValue = serial,
                Status = SerialNumberStatus.Available,
                CreatedAtUtc = now,
                Product = product!
            }).ToList();

            dbContext.SerialNumbers.AddRange(items);
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Failed to save serial number changes. Refresh and try again." });
            }

            return Results.Ok(new
            {
                items = items.Select(ToSerialResponse).ToList()
            });
        })
        .WithName("AddProductSerialNumbers")
        .WithOpenApi();

        productGroup.MapPut("/{serialId:guid}", async (
            Guid productId,
            Guid serialId,
            UpdateSerialNumberRequest request,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var serial = await dbContext.SerialNumbers
                .FirstOrDefaultAsync(x => x.Id == serialId && x.ProductId == productId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (serial is null)
            {
                return Results.NotFound(new { message = "Serial number not found." });
            }

            if (!IsValidStatusTransition(serial.Status, request.Status))
            {
                return Results.BadRequest(new { message = "Invalid serial status transition." });
            }

            serial.Status = request.Status;
            serial.WarrantyExpiryDate = request.WarrantyExpiryDate;
            serial.UpdatedAtUtc = DateTimeOffset.UtcNow;
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Failed to save serial number changes. Refresh and try again." });
            }

            return Results.Ok(ToSerialResponse(serial));
        })
        .WithName("UpdateProductSerialNumber")
        .WithOpenApi();

        productGroup.MapPost("/{serialId:guid}/replace", async (
            Guid productId,
            Guid serialId,
            ReplaceSerialNumberRequest request,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var serial = await dbContext.SerialNumbers
                .FirstOrDefaultAsync(x => x.Id == serialId && x.ProductId == productId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (serial is null)
            {
                return Results.NotFound(new { message = "Serial number not found." });
            }

            if (serial.Status != SerialNumberStatus.Defective)
            {
                return Results.BadRequest(new { message = "Only defective serial numbers can be replaced." });
            }

            var nextSerial = NormalizeSerial(request.NewSerialValue);
            if (string.IsNullOrWhiteSpace(nextSerial))
            {
                return Results.BadRequest(new { message = "new_serial_value is required." });
            }

            var duplicate = await dbContext.SerialNumbers.AnyAsync(
                x => x.Id != serial.Id &&
                     x.StoreId == serial.StoreId &&
                     x.SerialValue == nextSerial,
                cancellationToken);
            if (duplicate)
            {
                return Results.BadRequest(new { message = "A serial number with this value already exists." });
            }

            serial.SerialValue = nextSerial;
            serial.Status = SerialNumberStatus.Available;
            serial.UpdatedAtUtc = DateTimeOffset.UtcNow;

            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Failed to save serial number changes. Refresh and try again." });
            }

            return Results.Ok(ToSerialResponse(serial));
        })
        .WithName("ReplaceProductSerialNumber")
        .WithOpenApi();

        productGroup.MapDelete("/{serialId:guid}", async (
            Guid productId,
            Guid serialId,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var serial = await dbContext.SerialNumbers
                .FirstOrDefaultAsync(x => x.Id == serialId && x.ProductId == productId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (serial is null)
            {
                return Results.NotFound(new { message = "Serial number not found." });
            }

            var isReferenced = serial.SaleId.HasValue
                || serial.SaleItemId.HasValue
                || serial.RefundId.HasValue
                || await dbContext.WarrantyClaims.AnyAsync(
                    x => x.SerialNumberId == serial.Id || x.ReplacementSerialNumberId == serial.Id,
                    cancellationToken);

            if (isReferenced)
            {
                return Results.BadRequest(new { message = "Serial number cannot be deleted after it has been used in sales, refunds, or warranty claims." });
            }

            dbContext.SerialNumbers.Remove(serial);
            try
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                return Results.Conflict(new { message = "Failed to delete the serial number. Refresh and try again." });
            }

            return Results.NoContent();
        })
        .WithName("DeleteProductSerialNumber")
        .WithOpenApi();

        app.MapGet("/api/serials/lookup", async (
            string? serial,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var normalized = NormalizeSerial(serial);
            if (string.IsNullOrWhiteSpace(normalized))
            {
                return Results.BadRequest(new { message = "serial is required." });
            }

            var record = await dbContext.SerialNumbers
                .AsNoTracking()
                .Include(x => x.Product)
                    .ThenInclude(x => x.Category)
                .Include(x => x.Product)
                    .ThenInclude(x => x.Brand)
                .Include(x => x.Product)
                    .ThenInclude(x => x.Inventory)
                .Include(x => x.Sale)
                .Include(x => x.SaleItem)
                .Include(x => x.Refund)
                .FirstOrDefaultAsync(x => x.SerialValue == normalized && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);

            if (record is null)
            {
                return Results.NotFound(new { message = "Serial number not found." });
            }

            var stockQuantity = record.Product.Inventory?.QuantityOnHand ?? 0m;
            var reorderLevel = record.Product.Inventory?.ReorderLevel ?? 0m;
            var lowStockThreshold = Math.Max(reorderLevel, 5m);

            return Results.Ok(new
            {
                serial = new
                {
                    id = record.Id,
                    product_id = record.ProductId,
                    serial_value = record.SerialValue,
                    status = record.Status,
                    sale_id = record.SaleId,
                    sale_item_id = record.SaleItemId,
                    refund_id = record.RefundId,
                    warranty_expiry_date = record.WarrantyExpiryDate,
                    created_at = record.CreatedAtUtc,
                    updated_at = record.UpdatedAtUtc
                },
                product = new
                {
                    id = record.ProductId,
                    name = record.Product.Name,
                    sku = record.Product.Sku,
                    barcode = record.Product.Barcode,
                    image_url = record.Product.ImageUrl,
                    category_id = record.Product.CategoryId,
                    category_name = record.Product.Category?.Name,
                    brand_id = record.Product.BrandId,
                    brand_name = record.Product.Brand?.Name,
                    unit_price = record.Product.UnitPrice,
                    stock_quantity = stockQuantity,
                    is_low_stock = stockQuantity <= lowStockThreshold,
                    warranty_months = record.Product.WarrantyMonths,
                    is_serial_tracked = record.Product.IsSerialTracked
                },
                sale = record.Sale is null ? null : new
                {
                    id = record.Sale.Id,
                    sale_number = record.Sale.SaleNumber,
                    completed_at = record.Sale.CompletedAtUtc
                },
                sale_item = record.SaleItem is null ? null : new
                {
                    id = record.SaleItem.Id,
                    quantity = record.SaleItem.Quantity,
                    product_name = record.SaleItem.ProductNameSnapshot
                },
                refund = record.Refund is null ? null : new
                {
                    id = record.Refund.Id,
                    refund_number = record.Refund.RefundNumber,
                    created_at = record.Refund.CreatedAtUtc
                }
            });
        })
        .RequireAuthorization()
        .WithTags("Serial Numbers")
        .WithName("LookupSerialNumber")
        .WithOpenApi();

        return app;
    }

    private static string? NormalizeSerial(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static bool IsValidStatusTransition(SerialNumberStatus currentStatus, SerialNumberStatus nextStatus)
    {
        if (currentStatus == nextStatus)
        {
            return true;
        }

        return currentStatus switch
        {
            SerialNumberStatus.Available => nextStatus is SerialNumberStatus.Sold or SerialNumberStatus.Defective,
            SerialNumberStatus.Sold => nextStatus is SerialNumberStatus.Returned or SerialNumberStatus.UnderWarranty or SerialNumberStatus.Defective,
            SerialNumberStatus.Returned => nextStatus is SerialNumberStatus.Available or SerialNumberStatus.Defective,
            SerialNumberStatus.UnderWarranty => nextStatus is SerialNumberStatus.Sold or SerialNumberStatus.Defective,
            SerialNumberStatus.Defective => nextStatus is SerialNumberStatus.Available,
            _ => false
        };
    }

    private static object ToSerialResponse(SerialNumber serial)
    {
        return new
        {
            id = serial.Id,
            product_id = serial.ProductId,
            serial_value = serial.SerialValue,
            status = serial.Status,
            sale_id = serial.SaleId,
            sale_item_id = serial.SaleItemId,
            refund_id = serial.RefundId,
            warranty_expiry_date = serial.WarrantyExpiryDate,
            created_at = serial.CreatedAtUtc,
            updated_at = serial.UpdatedAtUtc
        };
    }
}

public sealed class AddSerialNumbersRequest
{
    [JsonPropertyName("serials")]
    public List<string> Serials { get; set; } = [];
}

public sealed class UpdateSerialNumberRequest
{
    [JsonPropertyName("status")]
    public SerialNumberStatus Status { get; set; } = SerialNumberStatus.Available;

    [JsonPropertyName("warranty_expiry_date")]
    public DateTimeOffset? WarrantyExpiryDate { get; set; }
}

public sealed class ReplaceSerialNumberRequest
{
    [JsonPropertyName("new_serial_value")]
    public string NewSerialValue { get; set; } = string.Empty;
}
