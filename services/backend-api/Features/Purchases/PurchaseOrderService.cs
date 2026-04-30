using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Purchases;

public sealed class PurchaseOrderService(
    SmartPosDbContext dbContext,
    PurchaseService purchaseService,
    IHttpContextAccessor httpContextAccessor,
    ILogger<PurchaseOrderService> logger)
{
    public async Task<List<PurchaseOrderResponse>> ListPurchaseOrdersAsync(
        Guid? supplierId,
        string? status,
        DateTimeOffset? fromDate,
        DateTimeOffset? toDate,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var query = dbContext.PurchaseOrders
            .AsNoTracking()
            .Include(x => x.Supplier)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Product)
            .Include(x => x.Bills)
            .AsQueryable();

        if (currentStoreId.HasValue)
        {
            query = query.Where(x => x.StoreId == currentStoreId.Value);
        }

        if (supplierId.HasValue)
        {
            query = query.Where(x => x.SupplierId == supplierId.Value);
        }

        if (!string.IsNullOrWhiteSpace(status) &&
            !string.Equals(status, "all", StringComparison.OrdinalIgnoreCase) &&
            Enum.TryParse<PurchaseOrderStatus>(status, true, out var parsedStatus))
        {
            query = query.Where(x => x.Status == parsedStatus);
        }

        if (fromDate.HasValue)
        {
            query = query.Where(x => x.PoDate >= fromDate.Value);
        }

        if (toDate.HasValue)
        {
            query = query.Where(x => x.PoDate < toDate.Value.AddDays(1));
        }

        var orders = await query
            .OrderByDescending(x => x.PoDate)
            .ThenByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return orders.Select(ToResponse).ToList();
    }

    public async Task<PurchaseOrderResponse> CreatePurchaseOrderAsync(
        CreatePurchaseOrderRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var currentUserId = GetCurrentUserId();

        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(x => x.Id == request.SupplierId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken)
            ?? throw new KeyNotFoundException("Supplier not found.");

        var poNumber = NormalizeRequired(request.PoNumber, "po_number is required.");
        if (request.Lines.Count == 0)
        {
            throw new InvalidOperationException("At least one purchase order line is required.");
        }

        var duplicate = await dbContext.PurchaseOrders
            .AsNoTracking()
            .AnyAsync(x => x.SupplierId == supplier.Id &&
                           x.PoNumber.ToLower() == poNumber.ToLower() &&
                           (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
        if (duplicate)
        {
            throw new InvalidOperationException("A purchase order with this supplier and PO number already exists.");
        }

        var normalizedLines = await NormalizePurchaseOrderLinesAsync(request.Lines, currentStoreId, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        var purchaseOrder = new PurchaseOrder
        {
            StoreId = currentStoreId,
            Supplier = supplier,
            SupplierId = supplier.Id,
            PoNumber = poNumber,
            PoDate = request.PoDate ?? now,
            ExpectedDeliveryDate = request.ExpectedDeliveryDate,
            Status = PurchaseOrderStatus.Draft,
            Currency = "LKR",
            SubtotalEstimate = RoundMoney(normalizedLines.Sum(x => x.QuantityOrdered * x.UnitCostEstimate)),
            Notes = NormalizeOptional(request.Notes),
            CreatedByUserId = currentUserId,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        foreach (var line in normalizedLines)
        {
            purchaseOrder.Lines.Add(new PurchaseOrderLine
            {
                PurchaseOrder = purchaseOrder,
                Product = line.Product,
                ProductId = line.Product.Id,
                ProductNameSnapshot = line.Product.Name,
                QuantityOrdered = line.QuantityOrdered,
                QuantityReceived = 0m,
                UnitCostEstimate = line.UnitCostEstimate,
                CreatedAtUtc = now
            });
        }

        dbContext.PurchaseOrders.Add(purchaseOrder);
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Purchase order created. PurchaseOrderId={PurchaseOrderId}, SupplierId={SupplierId}, ItemCount={ItemCount}.",
            purchaseOrder.Id,
            purchaseOrder.SupplierId,
            purchaseOrder.Lines.Count);

        return await GetPurchaseOrderAsync(purchaseOrder.Id, cancellationToken);
    }

    public async Task<PurchaseOrderResponse> GetPurchaseOrderAsync(
        Guid purchaseOrderId,
        CancellationToken cancellationToken)
    {
        if (purchaseOrderId == Guid.Empty)
        {
            throw new InvalidOperationException("purchase_order_id is required.");
        }

        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var order = await dbContext.PurchaseOrders
            .AsNoTracking()
            .Include(x => x.Supplier)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Product)
            .Include(x => x.Bills)
            .ThenInclude(x => x.Supplier)
            .FirstOrDefaultAsync(x => x.Id == purchaseOrderId, cancellationToken);

        if (order is null || (currentStoreId.HasValue && order.StoreId != currentStoreId.Value))
        {
            throw new KeyNotFoundException("Purchase order not found.");
        }

        return ToResponse(order);
    }

    public async Task<PurchaseOrderResponse> UpdatePurchaseOrderAsync(
        Guid purchaseOrderId,
        UpdatePurchaseOrderRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var order = await dbContext.PurchaseOrders
            .Include(x => x.Supplier)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Product)
            .Include(x => x.Bills)
            .FirstOrDefaultAsync(x => x.Id == purchaseOrderId, cancellationToken)
            ?? throw new KeyNotFoundException("Purchase order not found.");

        if (currentStoreId.HasValue && order.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Purchase order not found.");
        }

        if (order.Status != PurchaseOrderStatus.Draft)
        {
            throw new InvalidOperationException("Only draft purchase orders can be updated.");
        }

        var now = DateTimeOffset.UtcNow;

        if (request.SupplierId.HasValue && request.SupplierId.Value != order.SupplierId)
        {
            order.Supplier = await dbContext.Suppliers
                .FirstOrDefaultAsync(x => x.Id == request.SupplierId.Value && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken)
                ?? throw new KeyNotFoundException("Supplier not found.");
            order.SupplierId = order.Supplier.Id;
        }

        if (!string.IsNullOrWhiteSpace(request.PoNumber))
        {
            var normalizedPoNumber = NormalizeRequired(request.PoNumber, "po_number is required.");
            var duplicate = await dbContext.PurchaseOrders
                .AsNoTracking()
                .AnyAsync(x => x.Id != order.Id &&
                               x.SupplierId == order.SupplierId &&
                               x.PoNumber.ToLower() == normalizedPoNumber.ToLower() &&
                               (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (duplicate)
            {
                throw new InvalidOperationException("A purchase order with this supplier and PO number already exists.");
            }

            order.PoNumber = normalizedPoNumber;
        }

        if (request.ExpectedDeliveryDate.HasValue)
        {
            order.ExpectedDeliveryDate = request.ExpectedDeliveryDate;
        }

        if (request.Notes is not null)
        {
            order.Notes = NormalizeOptional(request.Notes);
        }

        if (request.Lines is not null)
        {
            if (request.Lines.Count == 0)
            {
                throw new InvalidOperationException("At least one purchase order line is required.");
            }

            var normalizedLines = await NormalizePurchaseOrderLinesAsync(request.Lines, currentStoreId, cancellationToken);
            dbContext.PurchaseOrderLines.RemoveRange(order.Lines);
            order.Lines.Clear();

            foreach (var line in normalizedLines)
            {
                order.Lines.Add(new PurchaseOrderLine
                {
                    PurchaseOrder = order,
                    Product = line.Product,
                    ProductId = line.Product.Id,
                    ProductNameSnapshot = line.Product.Name,
                    QuantityOrdered = line.QuantityOrdered,
                    QuantityReceived = 0m,
                    UnitCostEstimate = line.UnitCostEstimate,
                    CreatedAtUtc = now
                });
            }

            order.SubtotalEstimate = RoundMoney(normalizedLines.Sum(x => x.QuantityOrdered * x.UnitCostEstimate));
        }

        order.UpdatedAtUtc = now;
        await dbContext.SaveChangesAsync(cancellationToken);

        return await GetPurchaseOrderAsync(order.Id, cancellationToken);
    }

    public async Task<PurchaseOrderResponse> SendPurchaseOrderAsync(
        Guid purchaseOrderId,
        CancellationToken cancellationToken)
    {
        return await TransitionPurchaseOrderAsync(
            purchaseOrderId,
            order =>
            {
                if (order.Status != PurchaseOrderStatus.Draft)
                {
                    throw new InvalidOperationException("Only draft purchase orders can be sent.");
                }

                order.Status = PurchaseOrderStatus.Sent;
            },
            cancellationToken);
    }

    public async Task<PurchaseOrderResponse> CancelPurchaseOrderAsync(
        Guid purchaseOrderId,
        CancellationToken cancellationToken)
    {
        return await TransitionPurchaseOrderAsync(
            purchaseOrderId,
            order =>
            {
                if (order.Status is not PurchaseOrderStatus.Draft and not PurchaseOrderStatus.Sent)
                {
                    throw new InvalidOperationException("Only draft or sent purchase orders can be cancelled.");
                }

                order.Status = PurchaseOrderStatus.Cancelled;
            },
            cancellationToken);
    }

    public async Task<PurchaseOrderReceiveResponse> ReceivePurchaseOrderAsync(
        Guid purchaseOrderId,
        ReceivePurchaseOrderRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var currentUserId = GetCurrentUserId();
        var order = await dbContext.PurchaseOrders
            .Include(x => x.Supplier)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Product)
            .Include(x => x.Bills)
            .FirstOrDefaultAsync(x => x.Id == purchaseOrderId, cancellationToken)
            ?? throw new KeyNotFoundException("Purchase order not found.");

        if (currentStoreId.HasValue && order.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Purchase order not found.");
        }

        if (order.Status is PurchaseOrderStatus.Received or PurchaseOrderStatus.Cancelled)
        {
            throw new InvalidOperationException("This purchase order cannot be received.");
        }

        if (request.Lines.Count == 0)
        {
            throw new InvalidOperationException("At least one received line is required.");
        }

        if (request.InvoiceDate == default)
        {
            throw new InvalidOperationException("invoice_date is required.");
        }

        if (request.Lines.Select(x => x.ProductId).Distinct().Count() != request.Lines.Count)
        {
            throw new InvalidOperationException("Duplicate product_id values are not allowed in received lines.");
        }

        var orderLinesByProductId = order.Lines.ToDictionary(x => x.ProductId);
        var requestedProductIds = request.Lines.Select(x => x.ProductId).Distinct().ToArray();
        if (requestedProductIds.Any(x => x == Guid.Empty))
        {
            throw new InvalidOperationException("All received lines must include a valid product_id.");
        }

        foreach (var productId in requestedProductIds)
        {
            if (!orderLinesByProductId.ContainsKey(productId))
            {
                throw new InvalidOperationException("One or more received items do not exist on this purchase order.");
            }
        }

        var normalizedLines = request.Lines
            .Select(x =>
            {
                if (x.QuantityReceived <= 0m)
                {
                    throw new InvalidOperationException("Received quantity must be greater than zero.");
                }

                if (x.UnitCost < 0m)
                {
                    throw new InvalidOperationException("Received unit_cost cannot be negative.");
                }

                return new PurchaseBillInventoryLine(
                    ProductId: x.ProductId,
                    Quantity: RoundQuantity(x.QuantityReceived),
                    UnitCost: RoundMoney(x.UnitCost),
                    LineTotal: RoundMoney(x.QuantityReceived * x.UnitCost),
                    SupplierItemName: null,
                    BatchNumber: x.BatchNumber,
                    ExpiryDate: x.ExpiryDate,
                    ManufactureDate: x.ManufactureDate);
            })
            .ToList();

        foreach (var line in normalizedLines)
        {
            var orderLine = orderLinesByProductId[line.ProductId];
            var pending = RoundQuantity(orderLine.QuantityOrdered - orderLine.QuantityReceived);
            if (line.Quantity > pending)
            {
                throw new InvalidOperationException("Received quantity cannot exceed the ordered quantity.");
            }
        }

        var invoiceNumber = NormalizeRequired(request.InvoiceNumber, "invoice_number is required.");
        var now = DateTimeOffset.UtcNow;
        var subtotal = RoundMoney(normalizedLines.Sum(x => x.LineTotal));

        var purchaseBill = new PurchaseBill
        {
            StoreId = currentStoreId,
            Supplier = order.Supplier,
            SupplierId = order.SupplierId,
            PurchaseOrder = order,
            PurchaseOrderId = order.Id,
            InvoiceNumber = invoiceNumber,
            InvoiceDateUtc = request.InvoiceDate,
            Currency = order.Currency,
            Subtotal = subtotal,
            DiscountTotal = 0m,
            TaxTotal = 0m,
            GrandTotal = subtotal,
            SourceType = "po_receipt",
            CreatedByUserId = currentUserId,
            Notes = NormalizeOptional(request.Notes),
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        var purchaseBillItems = new List<PurchaseBillItem>();
        foreach (var line in normalizedLines)
        {
            var product = orderLinesByProductId[line.ProductId].Product;
            purchaseBillItems.Add(new PurchaseBillItem
            {
                PurchaseBill = purchaseBill,
                Product = product,
                ProductId = product.Id,
                ProductNameSnapshot = product.Name,
                SupplierItemName = null,
                Quantity = line.Quantity,
                UnitCost = line.UnitCost,
                TaxAmount = 0m,
                LineTotal = line.LineTotal,
                CreatedAtUtc = now
            });
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            dbContext.PurchaseBills.Add(purchaseBill);
            dbContext.PurchaseBillItems.AddRange(purchaseBillItems);
            var inventoryUpdates = await purchaseService.ApplyPurchaseBillInventoryAsync(
                purchaseBill,
                normalizedLines,
                request.UpdateCostPrice,
                cancellationToken);

            foreach (var line in normalizedLines)
            {
                var orderLine = orderLinesByProductId[line.ProductId];
                orderLine.QuantityReceived = RoundQuantity(orderLine.QuantityReceived + line.Quantity);
            }

            order.Status = order.Lines.All(x => RoundQuantity(x.QuantityReceived) >= RoundQuantity(x.QuantityOrdered))
                ? PurchaseOrderStatus.Received
                : PurchaseOrderStatus.PartiallyReceived;
            order.UpdatedAtUtc = now;

            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            logger.LogInformation(
                "Purchase order received. PurchaseOrderId={PurchaseOrderId}, PurchaseBillId={PurchaseBillId}, ItemCount={ItemCount}.",
                order.Id,
                purchaseBill.Id,
                purchaseBillItems.Count);

            return new PurchaseOrderReceiveResponse
            {
                PurchaseOrder = await GetPurchaseOrderAsync(order.Id, cancellationToken),
                InventoryUpdates = inventoryUpdates.ToList()
            };
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private async Task<PurchaseOrderResponse> TransitionPurchaseOrderAsync(
        Guid purchaseOrderId,
        Action<PurchaseOrder> transition,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var order = await dbContext.PurchaseOrders
            .Include(x => x.Supplier)
            .Include(x => x.Lines)
                .ThenInclude(x => x.Product)
            .Include(x => x.Bills)
            .FirstOrDefaultAsync(x => x.Id == purchaseOrderId, cancellationToken)
            ?? throw new KeyNotFoundException("Purchase order not found.");

        if (currentStoreId.HasValue && order.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Purchase order not found.");
        }

        transition(order);
        order.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return await GetPurchaseOrderAsync(order.Id, cancellationToken);
    }

    private async Task<List<(Product Product, decimal QuantityOrdered, decimal UnitCostEstimate)>> NormalizePurchaseOrderLinesAsync(
        IReadOnlyCollection<CreatePurchaseOrderLineRequest> lines,
        Guid? currentStoreId,
        CancellationToken cancellationToken)
    {
        var productIds = lines.Select(x => x.ProductId).Distinct().ToArray();
        if (productIds.Any(x => x == Guid.Empty))
        {
            throw new InvalidOperationException("All purchase order lines must include a valid product_id.");
        }

        if (lines.Select(x => x.ProductId).Distinct().Count() != lines.Count)
        {
            throw new InvalidOperationException("Duplicate product_id values are not allowed in purchase order lines.");
        }

        var products = await dbContext.Products
            .AsNoTracking()
            .Where(x => productIds.Contains(x.Id))
            .Where(x => !currentStoreId.HasValue || x.StoreId == currentStoreId.Value)
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        if (products.Count != productIds.Length)
        {
            throw new InvalidOperationException("One or more purchase order products were not found.");
        }

        return lines.Select(line =>
        {
            if (line.QuantityOrdered <= 0m)
            {
                throw new InvalidOperationException("Quantity ordered must be greater than zero.");
            }

            if (line.UnitCostEstimate < 0m)
            {
                throw new InvalidOperationException("Unit cost estimate cannot be negative.");
            }

            var product = products[line.ProductId];
            return (product, RoundQuantity(line.QuantityOrdered), RoundMoney(line.UnitCostEstimate));
        }).ToList();
    }

    private async Task<Guid?> GetCurrentStoreIdAsync(CancellationToken cancellationToken)
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user is null)
        {
            return null;
        }

        return await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
    }

    private Guid? GetCurrentUserId()
    {
        return ParseGuid(httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier));
    }

    private static PurchaseOrderResponse ToResponse(PurchaseOrder order)
    {
        return new PurchaseOrderResponse
        {
            Id = order.Id,
            StoreId = order.StoreId,
            SupplierId = order.SupplierId,
            SupplierName = order.Supplier?.Name ?? string.Empty,
            PoNumber = order.PoNumber,
            PoDate = order.PoDate,
            ExpectedDeliveryDate = order.ExpectedDeliveryDate,
            Status = order.Status.ToString(),
            Currency = order.Currency,
            SubtotalEstimate = RoundMoney(order.SubtotalEstimate),
            Notes = order.Notes,
            CreatedByUserId = order.CreatedByUserId,
            CreatedAtUtc = order.CreatedAtUtc,
            UpdatedAtUtc = order.UpdatedAtUtc,
            Lines = order.Lines
                .OrderBy(x => x.CreatedAtUtc)
                .Select(x => new PurchaseOrderLineResponse
                {
                    Id = x.Id,
                    ProductId = x.ProductId,
                    ProductName = x.ProductNameSnapshot,
                    QuantityOrdered = RoundQuantity(x.QuantityOrdered),
                    QuantityReceived = RoundQuantity(x.QuantityReceived),
                    QuantityPending = RoundQuantity(Math.Max(0m, x.QuantityOrdered - x.QuantityReceived)),
                    UnitCostEstimate = RoundMoney(x.UnitCostEstimate)
                })
                .ToList(),
            Bills = order.Bills
                .OrderByDescending(x => x.InvoiceDateUtc)
                .ThenByDescending(x => x.CreatedAtUtc)
                .Select(x => new PurchaseBillSummaryResponse
                {
                    Id = x.Id,
                    PurchaseOrderId = x.PurchaseOrderId,
                    InvoiceNumber = x.InvoiceNumber,
                    InvoiceDate = x.InvoiceDateUtc,
                    SourceType = x.SourceType,
                    GrandTotal = RoundMoney(x.GrandTotal),
                    CreatedAtUtc = x.CreatedAtUtc
                })
                .ToList()
        };
    }

    private static decimal RoundMoney(decimal value) =>
        decimal.Round(value, 2, MidpointRounding.AwayFromZero);

    private static decimal RoundQuantity(decimal value) =>
        decimal.Round(value, 3, MidpointRounding.AwayFromZero);

    private static string? NormalizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static string NormalizeRequired(string? value, string errorMessage)
    {
        var normalized = NormalizeOptional(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException(errorMessage);
        }

        return normalized;
    }

    private static Guid? ParseGuid(string? value) =>
        Guid.TryParse(value, out var parsed) ? parsed : null;
}
