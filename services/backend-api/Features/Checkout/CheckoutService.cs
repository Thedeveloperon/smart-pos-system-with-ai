using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.CashSessions;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Checkout;

public sealed class CheckoutService(
    SmartPosDbContext dbContext,
    AuditLogService auditLogService,
    CashSessionService cashSessionService)
{
    public async Task<SaleResponse> HoldAsync(
        HoldSaleRequest request,
        Guid? createdByUserId,
        CancellationToken cancellationToken)
    {
        var cart = await BuildCartAsync(request.Items, request.DiscountPercent, request.Role, cancellationToken);
        var sale = new Sale
        {
            SaleNumber = CreateSaleNumber("HLD"),
            Status = SaleStatus.Held,
            Subtotal = cart.Subtotal,
            DiscountTotal = cart.DiscountTotal,
            TaxTotal = 0m,
            GrandTotal = cart.GrandTotal,
            CreatedByUserId = createdByUserId,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            Items = cart.Items.Select(x => new SaleItem
            {
                ProductId = x.Product.Id,
                ProductNameSnapshot = x.Product.Name,
                UnitPrice = x.UnitPrice,
                Quantity = x.Quantity,
                DiscountAmount = x.DiscountAmount,
                TaxAmount = 0m,
                LineTotal = x.LineTotal,
                Sale = null!,
                Product = null!
            }).ToList()
        };

        dbContext.Sales.Add(sale);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ToSaleResponse(sale, paidTotal: 0m, change: 0m);
    }

    public async Task<SaleResponse> CompleteAsync(
        CompleteSaleRequest request,
        Guid? createdByUserId,
        CancellationToken cancellationToken)
    {
        if (request.Payments.Count == 0)
        {
            throw new InvalidOperationException("At least one payment is required.");
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        Sale sale;

        if (request.SaleId.HasValue)
        {
            sale = await dbContext.Sales
                .Include(x => x.Items)
                .Include(x => x.Payments)
                .FirstOrDefaultAsync(x => x.Id == request.SaleId.Value, cancellationToken)
                ?? throw new InvalidOperationException("Held sale not found.");

            if (sale.Status != SaleStatus.Held)
            {
                throw new InvalidOperationException("Only held bills can be completed.");
            }

            sale.CreatedByUserId ??= createdByUserId;
            sale.CashShortAmount = request.CustomPayoutUsed ? request.CashShortAmount : 0m;
        }
        else
        {
            var cart = await BuildCartAsync(request.Items, request.DiscountPercent, request.Role, cancellationToken);
            sale = new Sale
            {
                SaleNumber = CreateSaleNumber("SAL"),
                Status = SaleStatus.Held,
                Subtotal = cart.Subtotal,
                DiscountTotal = cart.DiscountTotal,
                TaxTotal = 0m,
                GrandTotal = cart.GrandTotal,
                CustomPayoutUsed = request.CustomPayoutUsed,
                CashShortAmount = request.CashShortAmount,
                CreatedByUserId = createdByUserId,
                CreatedAtUtc = DateTimeOffset.UtcNow,
                Items = cart.Items.Select(x => new SaleItem
                {
                    ProductId = x.Product.Id,
                    ProductNameSnapshot = x.Product.Name,
                    UnitPrice = x.UnitPrice,
                    Quantity = x.Quantity,
                    DiscountAmount = x.DiscountAmount,
                    TaxAmount = 0m,
                    LineTotal = x.LineTotal,
                    Sale = null!,
                    Product = null!
                }).ToList()
            };

            dbContext.Sales.Add(sale);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var paymentRecords = BuildPayments(request.Payments, sale.Id);
        var paidTotal = paymentRecords.Sum(x => x.Amount);
        if (paidTotal < sale.GrandTotal)
        {
            throw new InvalidOperationException("Payment total is lower than bill total.");
        }

        var change = decimal.Round(paidTotal - sale.GrandTotal, 2, MidpointRounding.AwayFromZero);

        foreach (var saleItem in sale.Items)
        {
            var inventoryRecord = await dbContext.Inventory.FirstOrDefaultAsync(
                x => x.ProductId == saleItem.ProductId,
                cancellationToken);

            if (inventoryRecord is null)
            {
                inventoryRecord = new InventoryRecord
                {
                    ProductId = saleItem.ProductId,
                    StoreId = sale.StoreId,
                    QuantityOnHand = 0m,
                    ReorderLevel = 0m,
                    SafetyStock = 0m,
                    TargetStockLevel = 0m,
                    AllowNegativeStock = true,
                    Product = null!
                };
                dbContext.Inventory.Add(inventoryRecord);
            }
            inventoryRecord.StoreId = sale.StoreId;

            inventoryRecord.QuantityOnHand -= saleItem.Quantity;
            inventoryRecord.UpdatedAtUtc = DateTimeOffset.UtcNow;
        }

        dbContext.Payments.AddRange(paymentRecords);
        dbContext.Ledger.Add(new LedgerEntry
        {
            SaleId = sale.Id,
            EntryType = LedgerEntryType.Sale,
            Description = $"Sale {sale.SaleNumber}",
            Debit = 0m,
            Credit = sale.GrandTotal,
            OccurredAtUtc = DateTimeOffset.UtcNow
        });
        dbContext.Ledger.Add(new LedgerEntry
        {
            SaleId = sale.Id,
            EntryType = LedgerEntryType.Payment,
            Description = $"Payment for {sale.SaleNumber}",
            Debit = sale.GrandTotal,
            Credit = 0m,
            OccurredAtUtc = DateTimeOffset.UtcNow
        });

        sale.Status = SaleStatus.Completed;
        sale.CompletedAtUtc = DateTimeOffset.UtcNow;
        sale.CustomPayoutUsed = request.CustomPayoutUsed;
        sale.CashShortAmount = request.CustomPayoutUsed
            ? DetermineCashShortAmount(sale.GrandTotal, paidTotal, request.CashChangeCounts, request.CashShortAmount)
            : 0m;

        auditLogService.Queue(
            action: "sale_completed",
            entityName: "sale",
            entityId: sale.Id.ToString(),
            before: new
            {
                status = "held"
            },
            after: new
            {
                status = sale.Status.ToString().ToLowerInvariant(),
                sale_number = sale.SaleNumber,
                grand_total = sale.GrandTotal,
                paid_total = paidTotal,
                change
            });

        var cashPaidTotal = paymentRecords
            .Where(x => x.Method == PaymentMethod.Cash)
            .Sum(x => x.Amount);
        if (cashPaidTotal > 0m)
        {
            var cashNetTotal = decimal.Round(
                decimal.Max(0m, cashPaidTotal - change),
                2,
                MidpointRounding.AwayFromZero);

            await cashSessionService.RecordCashSaleAsync(
                cashNetTotal,
                request.CashReceivedCounts,
                request.CashChangeCounts,
                sale.Id,
                sale.SaleNumber,
                cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return ToSaleResponse(sale, paidTotal, change);
    }

    public async Task<IReadOnlyList<HeldSaleListItem>> GetHeldSalesAsync(CancellationToken cancellationToken)
    {
        var heldSales = await dbContext.Sales
            .AsNoTracking()
            .Where(x => x.Status == SaleStatus.Held)
            .Select(x => new HeldSaleListItem
            {
                SaleId = x.Id,
                SaleNumber = x.SaleNumber,
                GrandTotal = x.GrandTotal,
                CreatedAt = x.CreatedAtUtc,
                ItemCount = x.Items.Count
            })
            .ToListAsync(cancellationToken);

        return heldSales
            .OrderByDescending(x => x.CreatedAt)
            .ToList();
    }

    public async Task<IReadOnlyList<SaleHistoryListItem>> GetRecentSalesAsync(
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 100);

        var sales = await dbContext.Sales
            .AsNoTracking()
            .Where(x => x.Status != SaleStatus.Held)
            .Select(x => new SaleHistoryListItem
            {
                SaleId = x.Id,
                SaleNumber = x.SaleNumber,
                Status = x.Status.ToString().ToLowerInvariant(),
                GrandTotal = x.GrandTotal,
                CreatedAt = x.CreatedAtUtc,
                CompletedAt = x.CompletedAtUtc,
                CustomPayoutUsed = x.CustomPayoutUsed,
                CashShortAmount = x.CashShortAmount
            })
            .ToListAsync(cancellationToken);

        var recentSales = sales
            .OrderByDescending(x => x.CompletedAt ?? x.CreatedAt)
            .Take(normalizedTake)
            .ToList();

        if (recentSales.Count == 0)
        {
            return recentSales;
        }

        var saleIds = recentSales.Select(x => x.SaleId).ToArray();
        var paymentRows = await dbContext.Payments
            .AsNoTracking()
            .Where(x => saleIds.Contains(x.SaleId))
            .Select(x => new PaymentSnapshot(
                x.SaleId,
                x.Method,
                x.Amount,
                x.IsReversal))
            .ToListAsync(cancellationToken);

        var paymentBreakdownBySaleId = paymentRows
            .GroupBy(x => x.SaleId)
            .ToDictionary(
                x => x.Key,
                x => BuildPaymentBreakdown(x));

        foreach (var sale in recentSales)
        {
            sale.PaymentBreakdown = paymentBreakdownBySaleId.GetValueOrDefault(sale.SaleId, []);
        }

        return recentSales;
    }

    public async Task<SaleResponse?> GetSaleAsync(Guid saleId, CancellationToken cancellationToken)
    {
        var sale = await dbContext.Sales
            .AsNoTracking()
            .Include(x => x.Items)
            .Include(x => x.Payments)
            .FirstOrDefaultAsync(x => x.Id == saleId, cancellationToken);

        if (sale is null)
        {
            return null;
        }

        var grossPaidTotal = sale.Payments
            .Where(x => !x.IsReversal)
            .Sum(x => x.Amount);
        var reversedTotal = sale.Payments
            .Where(x => x.IsReversal)
            .Sum(x => x.Amount);
        var paidTotal = grossPaidTotal - reversedTotal;
        var change = sale.Status is SaleStatus.Completed or SaleStatus.RefundedPartially or SaleStatus.RefundedFully
            ? decimal.Max(0m, grossPaidTotal - sale.GrandTotal)
            : 0m;

        return ToSaleResponse(sale, paidTotal, change);
    }

    public async Task<SaleResponse> VoidAsync(Guid saleId, CancellationToken cancellationToken)
    {
        var sale = await dbContext.Sales
            .Include(x => x.Items)
            .Include(x => x.Payments)
            .FirstOrDefaultAsync(x => x.Id == saleId, cancellationToken)
            ?? throw new InvalidOperationException("Sale not found.");

        if (sale.Payments.Any(x => !x.IsReversal))
        {
            throw new InvalidOperationException("Cannot void a sale after payment. Use refund flow.");
        }

        if (sale.Status == SaleStatus.Voided)
        {
            return ToSaleResponse(sale, paidTotal: 0m, change: 0m);
        }

        sale.Status = SaleStatus.Voided;
        auditLogService.Queue(
            action: "sale_voided",
            entityName: "sale",
            entityId: sale.Id.ToString(),
            before: new
            {
                status = SaleStatus.Held.ToString().ToLowerInvariant()
            },
            after: new
            {
                status = sale.Status.ToString().ToLowerInvariant(),
                sale_number = sale.SaleNumber
            });
        await dbContext.SaveChangesAsync(cancellationToken);

        return ToSaleResponse(sale, paidTotal: 0m, change: 0m);
    }

    private async Task<CartComputation> BuildCartAsync(
        IReadOnlyCollection<CartItemRequest> requestItems,
        decimal discountPercent,
        string role,
        CancellationToken cancellationToken)
    {
        if (requestItems.Count == 0)
        {
            throw new InvalidOperationException("Cart cannot be empty.");
        }

        var normalizedRole = role.Trim().ToLowerInvariant();
        var maxDiscount = GetDiscountLimitForRole(normalizedRole);
        if (discountPercent < 0m || discountPercent > maxDiscount)
        {
            throw new InvalidOperationException($"Discount exceeds role limit ({maxDiscount}%).");
        }

        var grouped = requestItems
            .GroupBy(x => x.ProductId)
            .Select(x => new { ProductId = x.Key, Quantity = x.Sum(y => y.Quantity) })
            .ToList();

        if (grouped.Any(x => x.Quantity <= 0m))
        {
            throw new InvalidOperationException("All quantities must be greater than zero.");
        }

        var productIds = grouped.Select(x => x.ProductId).ToArray();
        var products = await dbContext.Products
            .AsNoTracking()
            .Where(x => productIds.Contains(x.Id) && x.IsActive)
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        if (products.Count != productIds.Length)
        {
            throw new InvalidOperationException("Some products are missing or inactive.");
        }

        var cartLines = new List<CartLine>();
        decimal subtotal = 0m;
        foreach (var item in grouped)
        {
            var product = products[item.ProductId];
            var lineGross = decimal.Round(product.UnitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero);
            subtotal += lineGross;

            cartLines.Add(new CartLine
            {
                Product = product,
                Quantity = item.Quantity,
                UnitPrice = product.UnitPrice,
                LineGross = lineGross
            });
        }

        var discountTotal = decimal.Round(subtotal * (discountPercent / 100m), 2, MidpointRounding.AwayFromZero);
        decimal allocatedDiscount = 0m;
        for (var i = 0; i < cartLines.Count; i++)
        {
            var line = cartLines[i];
            decimal lineDiscount;
            if (i == cartLines.Count - 1)
            {
                lineDiscount = discountTotal - allocatedDiscount;
            }
            else
            {
                lineDiscount = decimal.Round(line.LineGross * (discountPercent / 100m), 2, MidpointRounding.AwayFromZero);
                allocatedDiscount += lineDiscount;
            }

            line.DiscountAmount = lineDiscount;
            line.LineTotal = line.LineGross - lineDiscount;
        }

        var grandTotal = decimal.Round(subtotal - discountTotal, 2, MidpointRounding.AwayFromZero);

        return new CartComputation
        {
            Items = cartLines,
            Subtotal = subtotal,
            DiscountTotal = discountTotal,
            GrandTotal = grandTotal
        };
    }

    private static List<Payment> BuildPayments(IEnumerable<PaymentRequest> requestPayments, Guid saleId)
    {
        var payments = new List<Payment>();
        foreach (var requestPayment in requestPayments)
        {
            if (requestPayment.Amount <= 0m)
            {
                continue;
            }

            payments.Add(new Payment
            {
                SaleId = saleId,
                Method = ParsePaymentMethod(requestPayment.Method),
                Amount = decimal.Round(requestPayment.Amount, 2, MidpointRounding.AwayFromZero),
                Currency = "LKR",
                ReferenceNumber = requestPayment.ReferenceNumber,
                IsReversal = false,
                Sale = null!
            });
        }

        if (payments.Count == 0)
        {
            throw new InvalidOperationException("At least one valid payment amount is required.");
        }

        return payments;
    }

    private static PaymentMethod ParsePaymentMethod(string method)
    {
        return method.Trim().ToLowerInvariant() switch
        {
            "cash" => PaymentMethod.Cash,
            "card" => PaymentMethod.Card,
            "lankaqr" => PaymentMethod.LankaQr,
            "qr" => PaymentMethod.LankaQr,
            _ => throw new InvalidOperationException("Invalid payment method.")
        };
    }

    private static decimal GetDiscountLimitForRole(string role)
    {
        return role switch
        {
            "owner" => 100m,
            "manager" => 25m,
            "cashier" => 10m,
            _ => 0m
        };
    }

    private static string CreateSaleNumber(string prefix)
    {
        return $"{prefix}-{DateTime.UtcNow:yyyyMMddHHmmss}-{Random.Shared.Next(100, 999)}";
    }

    private static SaleResponse ToSaleResponse(Sale sale, decimal paidTotal, decimal change)
    {
        var discountPercent = sale.Subtotal == 0
            ? 0
            : decimal.Round((sale.DiscountTotal / sale.Subtotal) * 100m, 2, MidpointRounding.AwayFromZero);

        return new SaleResponse
        {
            SaleId = sale.Id,
            SaleNumber = sale.SaleNumber,
            Status = sale.Status.ToString().ToLowerInvariant(),
            Subtotal = sale.Subtotal,
            DiscountTotal = sale.DiscountTotal,
            DiscountPercent = discountPercent,
            TaxTotal = sale.TaxTotal,
            GrandTotal = sale.GrandTotal,
            PaidTotal = paidTotal,
            Change = change,
            CreatedAt = sale.CreatedAtUtc,
            CompletedAt = sale.CompletedAtUtc,
            CustomPayoutUsed = sale.CustomPayoutUsed,
            CashShortAmount = sale.CashShortAmount,
            Items = sale.Items.Select(x => new SaleItemResponse
            {
                SaleItemId = x.Id,
                ProductId = x.ProductId,
                ProductName = x.ProductNameSnapshot,
                UnitPrice = x.UnitPrice,
                Quantity = x.Quantity,
                LineTotal = x.LineTotal
            }).ToList(),
            Payments = sale.Payments
                .Where(x => !x.IsReversal)
                .Select(x => new SalePaymentResponse
                {
                    Method = x.Method.ToString().ToLowerInvariant(),
                    Amount = x.Amount,
                    ReferenceNumber = x.ReferenceNumber
                })
                .ToList(),
            PaymentBreakdown = BuildPaymentBreakdown(sale.Payments.Select(x => new PaymentSnapshot(
                sale.Id,
                x.Method,
                x.Amount,
                x.IsReversal)))
                .ToList()
        };
    }

    private static List<SalePaymentBreakdownResponse> BuildPaymentBreakdown(IEnumerable<PaymentSnapshot> payments)
    {
        return payments
            .GroupBy(x => x.Method)
            .Select(x =>
            {
                var paidAmount = RoundMoney(x.Where(y => !y.IsReversal).Sum(y => y.Amount));
                var reversedAmount = RoundMoney(x.Where(y => y.IsReversal).Sum(y => y.Amount));
                return new SalePaymentBreakdownResponse
                {
                    Method = x.Key.ToString().ToLowerInvariant(),
                    PaidAmount = paidAmount,
                    ReversedAmount = reversedAmount,
                    NetAmount = RoundMoney(paidAmount - reversedAmount)
                };
            })
            .OrderBy(x => x.Method)
            .ToList();
    }

    private static decimal DetermineCashShortAmount(
        decimal grandTotal,
        decimal paidTotal,
        IReadOnlyCollection<CashCountItem> cashChangeCounts,
        decimal requestedAmount)
    {
        var expectedChange = RoundMoney(Math.Max(0m, paidTotal - grandTotal));
        if (cashChangeCounts.Count == 0)
        {
            return RoundMoney(requestedAmount);
        }

        var actualChange = RoundMoney(cashChangeCounts.Sum(x => x.Denomination * x.Quantity));
        return RoundMoney(expectedChange - actualChange);
    }

    private static decimal RoundMoney(decimal value)
    {
        return decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private sealed record PaymentSnapshot(
        Guid SaleId,
        PaymentMethod Method,
        decimal Amount,
        bool IsReversal);

    private sealed class CartComputation
    {
        public List<CartLine> Items { get; set; } = [];
        public decimal Subtotal { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal GrandTotal { get; set; }
    }

    private sealed class CartLine
    {
        public required Product Product { get; set; }
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal LineGross { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal LineTotal { get; set; }
    }
}
