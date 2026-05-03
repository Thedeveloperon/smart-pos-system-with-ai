using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.CashSessions;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Features.Batches;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Checkout;

public sealed class CheckoutService(
    SmartPosDbContext dbContext,
    IHttpContextAccessor httpContextAccessor,
    AuditLogService auditLogService,
    CashSessionService cashSessionService,
    StockMovementHelper stockMovementHelper,
    BatchDepletionHelper batchDepletionHelper)
{
    public async Task<SaleResponse> HoldAsync(
        HoldSaleRequest request,
        Guid? createdByUserId,
        CancellationToken cancellationToken)
    {
        var customer = request.CustomerId.HasValue
            ? await LoadCustomerAsync(request.CustomerId.Value, cancellationToken)
            : null;
        var discountPercent = customer is null
            ? request.DiscountPercent
            : ResolveCustomerDiscountPercent(customer, request.DiscountPercent);
        var cart = await BuildCartAsync(
            request.Items,
            discountPercent,
            request.Role,
            bypassDiscountLimit: customer is not null,
            cancellationToken);
        if (cart.Items.Any(x => x.SerialNumberId.HasValue))
        {
            throw new InvalidOperationException(
                "Serial-selected items cannot be held. Complete the sale without holding it.");
        }

        var loyaltyPointsRedeemed = customer is null
            ? 0m
            : ResolveLoyaltyRedemption(customer, request.LoyaltyPointsToRedeem, cart.GrandTotal);
        var finalGrandTotal = RoundMoney(cart.GrandTotal - loyaltyPointsRedeemed);
        var loyaltyPointsEarned = RoundMoney(Math.Floor(finalGrandTotal));

        var sale = new Sale
        {
            StoreId = cart.StoreId,
            SaleNumber = CreateSaleNumber("HLD"),
            Status = SaleStatus.Held,
            Subtotal = cart.Subtotal,
            DiscountTotal = cart.DiscountTotal,
            TaxTotal = 0m,
            GrandTotal = finalGrandTotal,
            CustomerId = customer?.Id,
            Customer = customer,
            LoyaltyPointsRedeemed = loyaltyPointsRedeemed,
            LoyaltyPointsEarned = loyaltyPointsEarned,
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
        var requestedSerialBySaleItemId = new Dictionary<Guid, Guid>();

        if (request.SaleId.HasValue)
        {
            sale = await dbContext.Sales
                .Include(x => x.Items)
                .Include(x => x.Payments)
                .Include(x => x.Customer)
                .FirstOrDefaultAsync(x => x.Id == request.SaleId.Value, cancellationToken)
                ?? throw new InvalidOperationException("Held sale not found.");

            if (sale.Status != SaleStatus.Held)
            {
                throw new InvalidOperationException("Only held bills can be completed.");
            }

            sale.CreatedByUserId ??= createdByUserId;
            sale.CashShortAmount = request.CustomPayoutUsed ? request.CashShortAmount : 0m;

            if (request.Items.Count > 0)
            {
                var cart = await BuildEditableHeldCartAsync(
                    sale,
                    request.Items,
                    request.DiscountPercent,
                    request.Role,
                    cancellationToken);
                ApplyCartToHeldSale(sale, cart, requestedSerialBySaleItemId);
            }
        }
        else
        {
            var saleCustomer = request.CustomerId.HasValue
                ? await LoadCustomerAsync(request.CustomerId.Value, cancellationToken)
                : null;
            var discountPercent = saleCustomer is null
                ? request.DiscountPercent
                : ResolveCustomerDiscountPercent(saleCustomer, request.DiscountPercent);
            var cart = await BuildCartAsync(
                request.Items,
                discountPercent,
                request.Role,
                bypassDiscountLimit: saleCustomer is not null,
                cancellationToken);
            var loyaltyPointsRedeemed = saleCustomer is null
                ? 0m
                : ResolveLoyaltyRedemption(saleCustomer, request.LoyaltyPointsToRedeem, cart.GrandTotal);
            var finalGrandTotal = RoundMoney(cart.GrandTotal - loyaltyPointsRedeemed);
            var loyaltyPointsEarned = RoundMoney(Math.Floor(finalGrandTotal));
            var saleItems = new List<SaleItem>();
            foreach (var line in cart.Items)
            {
                var saleItem = new SaleItem
                {
                    ProductId = line.Product.Id,
                    ProductNameSnapshot = line.Product.Name,
                    UnitPrice = line.UnitPrice,
                    Quantity = line.Quantity,
                    DiscountAmount = line.DiscountAmount,
                    TaxAmount = 0m,
                    LineTotal = line.LineTotal,
                    Sale = null!,
                    Product = null!
                };

                saleItems.Add(saleItem);
                if (line.SerialNumberId.HasValue)
                {
                    requestedSerialBySaleItemId[saleItem.Id] = line.SerialNumberId.Value;
                }
            }

            sale = new Sale
            {
                StoreId = cart.StoreId,
                SaleNumber = CreateSaleNumber("SAL"),
                Status = SaleStatus.Held,
                Subtotal = cart.Subtotal,
                DiscountTotal = cart.DiscountTotal,
                TaxTotal = 0m,
                GrandTotal = finalGrandTotal,
                CustomPayoutUsed = request.CustomPayoutUsed,
                CashShortAmount = request.CashShortAmount,
                CustomerId = saleCustomer?.Id,
                Customer = saleCustomer,
                LoyaltyPointsRedeemed = loyaltyPointsRedeemed,
                LoyaltyPointsEarned = loyaltyPointsEarned,
                CreatedByUserId = createdByUserId,
                CreatedAtUtc = DateTimeOffset.UtcNow,
                Items = saleItems
            };

            dbContext.Sales.Add(sale);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var productStoreIds = await LoadProductStoreIdsAsync(
            sale.Items.Select(x => x.ProductId),
            cancellationToken);
        sale.StoreId = ResolveStoreId(productStoreIds.Values, "Sale");

        var paymentRecords = BuildPayments(request.Payments, sale.Id);
        var paidTotal = paymentRecords.Sum(x => x.Amount);
        if (paidTotal < sale.GrandTotal)
        {
            throw new InvalidOperationException("Payment total is lower than bill total.");
        }

        var change = decimal.Round(paidTotal - sale.GrandTotal, 2, MidpointRounding.AwayFromZero);
        var now = DateTimeOffset.UtcNow;
        var productIds = sale.Items.Select(x => x.ProductId).Distinct().ToArray();
        var loadedProducts = await dbContext.Products
            .Include(x => x.SerialNumbers)
            .Include(x => x.Inventory)
            .Where(x => productIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        var reservedSerialIds = requestedSerialBySaleItemId.Values.ToHashSet();

        foreach (var saleItem in sale.Items)
        {
            if (!loadedProducts.TryGetValue(saleItem.ProductId, out var product))
            {
                throw new InvalidOperationException("Product not found for sale item.");
            }

            if (product.IsBatchTracked)
            {
                await batchDepletionHelper.DepleteAsync(
                    productStoreIds[saleItem.ProductId],
                    saleItem.ProductId,
                    saleItem.Quantity,
                    sale.Id,
                    createdByUserId,
                    cancellationToken);
            }

            if (!product.IsBatchTracked)
            {
                await stockMovementHelper.RecordMovementAsync(
                    storeId: productStoreIds[saleItem.ProductId],
                    productId: saleItem.ProductId,
                    type: StockMovementType.Sale,
                    quantityChange: -saleItem.Quantity,
                    refType: StockMovementRef.Sale,
                    refId: sale.Id,
                    batchId: null,
                    serialNumber: null,
                    reason: "sale",
                    userId: createdByUserId,
                    cancellationToken);
            }

            if (product.IsSerialTracked)
            {
                if (saleItem.Quantity <= 0m || saleItem.Quantity != decimal.Truncate(saleItem.Quantity))
                {
                    throw new InvalidOperationException("Serial-tracked items must use whole-number quantities.");
                }

                var serialsToAssign = ResolveSerialAssignmentsForSaleItem(
                    saleItem,
                    product,
                    requestedSerialBySaleItemId,
                    reservedSerialIds);

                foreach (var serial in serialsToAssign)
                {
                    serial.Status = SerialNumberStatus.Sold;
                    serial.SaleId = sale.Id;
                    serial.SaleItemId = saleItem.Id;
                    serial.WarrantyExpiryDate = product.WarrantyMonths > 0
                        ? now.AddMonths(product.WarrantyMonths)
                        : null;
                    serial.UpdatedAtUtc = now;
                }
            }
        }

        var cashPaidTotal = paymentRecords
            .Where(x => x.Method == PaymentMethod.Cash)
            .Sum(x => x.Amount);
        var creditPaidTotal = paymentRecords
            .Where(x => x.Method == PaymentMethod.Credit)
            .Sum(x => x.Amount);
        if (creditPaidTotal > 0m && paidTotal != sale.GrandTotal)
        {
            throw new InvalidOperationException("Credit payments must exactly match the bill total.");
        }

        var customerId = sale.CustomerId;
        Customer? customer = null;
        if (customerId.HasValue)
        {
            customer = sale.Customer ?? await LoadCustomerAsync(customerId.Value, cancellationToken);
            sale.Customer = customer;

            if (sale.LoyaltyPointsRedeemed > 0m)
            {
                if (customer.LoyaltyPoints < sale.LoyaltyPointsRedeemed)
                {
                    throw new InvalidOperationException("Customer does not have enough loyalty points.");
                }

                customer.LoyaltyPoints = RoundMoney(customer.LoyaltyPoints - sale.LoyaltyPointsRedeemed);
            }

            sale.LoyaltyPointsEarned = RoundMoney(Math.Floor(sale.GrandTotal));
            customer.LoyaltyPoints = RoundMoney(customer.LoyaltyPoints + sale.LoyaltyPointsEarned);

            if (creditPaidTotal > 0m)
            {
                var nextOutstandingBalance = RoundMoney(customer.OutstandingBalance + creditPaidTotal);
                if (nextOutstandingBalance > customer.CreditLimit)
                {
                    throw new InvalidOperationException("Customer credit limit exceeded.");
                }

                customer.OutstandingBalance = nextOutstandingBalance;
                customer.UpdatedAtUtc = now;
                dbContext.CustomerCreditLedger.Add(new CustomerCreditLedgerEntry
                {
                    StoreId = customer.StoreId,
                    CustomerId = customer.Id,
                    SaleId = sale.Id,
                    EntryType = CustomerCreditEntryType.Charge,
                    Amount = creditPaidTotal,
                    BalanceAfter = nextOutstandingBalance,
                    Description = $"Credit sale {sale.SaleNumber}",
                    Reference = sale.SaleNumber,
                    RecordedByUserId = createdByUserId,
                    OccurredAtUtc = now,
                    CreatedAtUtc = now,
                    Customer = customer
                });
            }
        }

        dbContext.Payments.AddRange(paymentRecords);
        dbContext.Ledger.Add(new LedgerEntry
        {
            StoreId = sale.StoreId,
            SaleId = sale.Id,
            EntryType = LedgerEntryType.Sale,
            Description = $"Sale {sale.SaleNumber}",
            Debit = 0m,
            Credit = sale.GrandTotal,
            OccurredAtUtc = DateTimeOffset.UtcNow
        });
        dbContext.Ledger.Add(new LedgerEntry
        {
            StoreId = sale.StoreId,
            SaleId = sale.Id,
            EntryType = LedgerEntryType.Payment,
            Description = $"Payment for {sale.SaleNumber}",
            Debit = sale.GrandTotal,
            Credit = 0m,
            OccurredAtUtc = DateTimeOffset.UtcNow
        });

        sale.Status = SaleStatus.Completed;
        sale.CompletedAtUtc = now;
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
            .Include(x => x.Customer)
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
            .Include(x => x.Customer)
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
        bool bypassDiscountLimit,
        CancellationToken cancellationToken)
    {
        if (requestItems.Count == 0)
        {
            throw new InvalidOperationException("Cart cannot be empty.");
        }

        var normalizedRole = role.Trim().ToLowerInvariant();
        var maxDiscount = GetDiscountLimitForRole(normalizedRole);
        if (discountPercent < 0m || discountPercent > 100m)
        {
            throw new InvalidOperationException("Discount percent must be between 0 and 100.");
        }

        if (!bypassDiscountLimit && discountPercent > maxDiscount)
        {
            throw new InvalidOperationException($"Discount exceeds role limit ({maxDiscount}%).");
        }

        var groupedGenericItems = requestItems
            .Where(x => !x.SerialNumberId.HasValue)
            .GroupBy(x => x.ProductId)
            .Select(x => new { ProductId = x.Key, Quantity = x.Sum(y => y.Quantity) })
            .ToList();
        var serialSpecificItems = requestItems
            .Where(x => x.SerialNumberId.HasValue)
            .ToList();

        if (groupedGenericItems.Any(x => x.Quantity <= 0m) || serialSpecificItems.Any(x => x.Quantity <= 0m))
        {
            throw new InvalidOperationException("All quantities must be greater than zero.");
        }

        if (serialSpecificItems.Any(x => x.Quantity != 1m))
        {
            throw new InvalidOperationException("Serial-selected items must use a quantity of 1.");
        }

        var duplicateSerialIds = serialSpecificItems
            .Select(x => x.SerialNumberId!.Value)
            .GroupBy(x => x)
            .Where(x => x.Count() > 1)
            .Select(x => x.Key)
            .ToList();
        if (duplicateSerialIds.Count > 0)
        {
            throw new InvalidOperationException("The same serial number cannot be added to the cart more than once.");
        }

        var productIds = groupedGenericItems
            .Select(x => x.ProductId)
            .Concat(serialSpecificItems.Select(x => x.ProductId))
            .Distinct()
            .ToArray();
        var products = await dbContext.Products
            .AsNoTracking()
            .Where(x => productIds.Contains(x.Id) && x.IsActive)
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        if (products.Count != productIds.Length)
        {
            throw new InvalidOperationException("Some products are missing or inactive.");
        }

        Dictionary<Guid, SerialNumber> serialsById;
        if (serialSpecificItems.Count == 0)
        {
            serialsById = [];
        }
        else
        {
            var serialIds = serialSpecificItems
                .Select(x => x.SerialNumberId!.Value)
                .Distinct()
                .ToArray();

            serialsById = await dbContext.SerialNumbers
                .AsNoTracking()
                .Where(x => serialIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, cancellationToken);

            if (serialsById.Count != serialIds.Length)
            {
                throw new InvalidOperationException("Some selected serial numbers were not found.");
            }
        }

        var cartLines = new List<CartLine>();
        decimal subtotal = 0m;
        foreach (var item in groupedGenericItems)
        {
            var product = products[item.ProductId];
            if (product.IsSerialTracked)
            {
                throw new InvalidOperationException(
                    $"'{product.Name}' requires a validated serial number before it can be added to the cart.");
            }

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

        foreach (var item in serialSpecificItems)
        {
            var product = products[item.ProductId];
            if (!product.IsSerialTracked)
            {
                throw new InvalidOperationException($"'{product.Name}' is not configured for serial tracking.");
            }

            var serial = serialsById[item.SerialNumberId!.Value];
            if (serial.ProductId != product.Id)
            {
                throw new InvalidOperationException($"Serial number '{serial.SerialValue}' does not belong to '{product.Name}'.");
            }

            if (serial.Status != SerialNumberStatus.Available)
            {
                throw new InvalidOperationException($"Serial number '{serial.SerialValue}' is not available for sale.");
            }

            var lineGross = decimal.Round(product.UnitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero);
            subtotal += lineGross;

            cartLines.Add(new CartLine
            {
                Product = product,
                Quantity = item.Quantity,
                UnitPrice = product.UnitPrice,
                LineGross = lineGross,
                SerialNumberId = serial.Id,
                SerialValue = serial.SerialValue
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
            StoreId = ResolveStoreId(cartLines.Select(x => x.Product.StoreId), "Cart"),
            Subtotal = subtotal,
            DiscountTotal = discountTotal,
            GrandTotal = grandTotal
        };
    }

    private async Task<CartComputation> BuildEditableHeldCartAsync(
        Sale sale,
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

        if (requestItems.Any(x => x.Quantity <= 0m))
        {
            throw new InvalidOperationException("All quantities must be greater than zero.");
        }

        var duplicateSaleItemIds = requestItems
            .Where(x => x.SaleItemId.HasValue)
            .Select(x => x.SaleItemId!.Value)
            .GroupBy(x => x)
            .Where(x => x.Count() > 1)
            .Select(x => x.Key)
            .ToList();
        if (duplicateSaleItemIds.Count > 0)
        {
            throw new InvalidOperationException("The same held sale item cannot be added more than once.");
        }

        var existingSaleItemsById = sale.Items.ToDictionary(x => x.Id);
        foreach (var requestItem in requestItems.Where(x => x.SaleItemId.HasValue))
        {
            if (!existingSaleItemsById.TryGetValue(requestItem.SaleItemId!.Value, out var existingSaleItem))
            {
                throw new InvalidOperationException("Some held sale items were not found.");
            }

            if (existingSaleItem.ProductId != requestItem.ProductId)
            {
                throw new InvalidOperationException("Held sale items cannot be reassigned to a different product.");
            }
        }

        var serialSpecificItems = requestItems
            .Where(x => x.SerialNumberId.HasValue)
            .ToList();
        if (serialSpecificItems.Any(x => x.Quantity != 1m))
        {
            throw new InvalidOperationException("Serial-selected items must use a quantity of 1.");
        }

        var duplicateSerialIds = serialSpecificItems
            .Select(x => x.SerialNumberId!.Value)
            .GroupBy(x => x)
            .Where(x => x.Count() > 1)
            .Select(x => x.Key)
            .ToList();
        if (duplicateSerialIds.Count > 0)
        {
            throw new InvalidOperationException("The same serial number cannot be added to the cart more than once.");
        }

        var productIds = requestItems
            .Select(x => x.ProductId)
            .Distinct()
            .ToArray();
        var products = await dbContext.Products
            .AsNoTracking()
            .Where(x => productIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        if (products.Count != productIds.Length)
        {
            throw new InvalidOperationException("Some products are missing.");
        }

        if (requestItems.Any(x => !x.SaleItemId.HasValue && !products[x.ProductId].IsActive))
        {
            throw new InvalidOperationException("Some products are missing or inactive.");
        }

        Dictionary<Guid, SerialNumber> serialsById;
        if (serialSpecificItems.Count == 0)
        {
            serialsById = [];
        }
        else
        {
            var serialIds = serialSpecificItems
                .Select(x => x.SerialNumberId!.Value)
                .Distinct()
                .ToArray();

            serialsById = await dbContext.SerialNumbers
                .AsNoTracking()
                .Where(x => serialIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, cancellationToken);

            if (serialsById.Count != serialIds.Length)
            {
                throw new InvalidOperationException("Some selected serial numbers were not found.");
            }
        }

        var cartLines = new List<CartLine>();
        decimal subtotal = 0m;

        foreach (var item in requestItems)
        {
            var product = products[item.ProductId];
            var existingSaleItem = item.SaleItemId.HasValue
                ? existingSaleItemsById[item.SaleItemId.Value]
                : null;

            if (item.SerialNumberId.HasValue)
            {
                if (!product.IsSerialTracked)
                {
                    throw new InvalidOperationException($"'{product.Name}' is not configured for serial tracking.");
                }

                var serial = serialsById[item.SerialNumberId.Value];
                if (serial.ProductId != product.Id)
                {
                    throw new InvalidOperationException($"Serial number '{serial.SerialValue}' does not belong to '{product.Name}'.");
                }

                if (serial.Status != SerialNumberStatus.Available)
                {
                    throw new InvalidOperationException($"Serial number '{serial.SerialValue}' is not available for sale.");
                }

                var unitPrice = existingSaleItem?.UnitPrice ?? product.UnitPrice;
                var lineGross = decimal.Round(unitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero);
                subtotal += lineGross;

                cartLines.Add(new CartLine
                {
                    ExistingSaleItemId = existingSaleItem?.Id,
                    Product = product,
                    ProductName = existingSaleItem?.ProductNameSnapshot ?? product.Name,
                    Quantity = item.Quantity,
                    UnitPrice = unitPrice,
                    LineGross = lineGross,
                    SerialNumberId = serial.Id,
                    SerialValue = serial.SerialValue
                });

                continue;
            }

            if (product.IsSerialTracked)
            {
                throw new InvalidOperationException(
                    $"'{product.Name}' requires a validated serial number before it can be added to the cart.");
            }

            var genericUnitPrice = existingSaleItem?.UnitPrice ?? product.UnitPrice;
            var genericLineGross = decimal.Round(genericUnitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero);
            subtotal += genericLineGross;

            cartLines.Add(new CartLine
            {
                ExistingSaleItemId = existingSaleItem?.Id,
                Product = product,
                ProductName = existingSaleItem?.ProductNameSnapshot ?? product.Name,
                Quantity = item.Quantity,
                UnitPrice = genericUnitPrice,
                LineGross = genericLineGross
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
            StoreId = ResolveStoreId(cartLines.Select(x => x.Product.StoreId), "Cart"),
            Subtotal = subtotal,
            DiscountTotal = discountTotal,
            GrandTotal = grandTotal
        };
    }

    private void ApplyCartToHeldSale(
        Sale sale,
        CartComputation cart,
        IDictionary<Guid, Guid> requestedSerialBySaleItemId)
    {
        var keptSaleItemIds = cart.Items
            .Where(x => x.ExistingSaleItemId.HasValue)
            .Select(x => x.ExistingSaleItemId!.Value)
            .ToHashSet();
        var saleItemsToRemove = sale.Items
            .Where(x => !keptSaleItemIds.Contains(x.Id))
            .ToList();

        foreach (var saleItem in saleItemsToRemove)
        {
            sale.Items.Remove(saleItem);
        }

        var remainingSaleItemsById = sale.Items.ToDictionary(x => x.Id);

        foreach (var line in cart.Items)
        {
            if (line.ExistingSaleItemId.HasValue)
            {
                var saleItem = remainingSaleItemsById[line.ExistingSaleItemId.Value];
                saleItem.Quantity = line.Quantity;
                saleItem.UnitPrice = line.UnitPrice;
                saleItem.ProductNameSnapshot = line.ProductName;
                saleItem.DiscountAmount = line.DiscountAmount;
                saleItem.TaxAmount = 0m;
                saleItem.LineTotal = line.LineTotal;

                if (line.SerialNumberId.HasValue)
                {
                    requestedSerialBySaleItemId[saleItem.Id] = line.SerialNumberId.Value;
                }

                continue;
            }

            var saleItemToAdd = new SaleItem
            {
                SaleId = sale.Id,
                ProductId = line.Product.Id,
                ProductNameSnapshot = line.ProductName,
                UnitPrice = line.UnitPrice,
                Quantity = line.Quantity,
                DiscountAmount = line.DiscountAmount,
                TaxAmount = 0m,
                LineTotal = line.LineTotal,
                Sale = sale,
                Product = null!
            };

            dbContext.SaleItems.Add(saleItemToAdd);

            if (line.SerialNumberId.HasValue)
            {
                requestedSerialBySaleItemId[saleItemToAdd.Id] = line.SerialNumberId.Value;
            }
        }

        sale.StoreId = cart.StoreId;
        sale.Subtotal = cart.Subtotal;
        sale.DiscountTotal = cart.DiscountTotal;
        sale.TaxTotal = 0m;
        sale.GrandTotal = cart.GrandTotal;
    }

    private async Task<Dictionary<Guid, Guid?>> LoadProductStoreIdsAsync(
        IEnumerable<Guid> productIds,
        CancellationToken cancellationToken)
    {
        var distinctProductIds = productIds
            .Distinct()
            .ToArray();

        var storeIds = await dbContext.Products
            .AsNoTracking()
            .Where(x => distinctProductIds.Contains(x.Id))
            .Select(x => new { x.Id, x.StoreId })
            .ToDictionaryAsync(x => x.Id, x => x.StoreId, cancellationToken);

        if (storeIds.Count != distinctProductIds.Length)
        {
            throw new InvalidOperationException("Some products are missing.");
        }

        return storeIds;
    }

    private static Guid? ResolveStoreId(IEnumerable<Guid?> storeIds, string owner)
    {
        var distinctStoreIds = storeIds
            .Where(x => x.HasValue)
            .Select(x => x.GetValueOrDefault())
            .Distinct()
            .ToArray();

        if (distinctStoreIds.Length > 1)
        {
            throw new InvalidOperationException($"{owner} contains products from multiple stores.");
        }

        return distinctStoreIds.Length == 0
            ? null
            : distinctStoreIds[0];
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
            "credit" => PaymentMethod.Credit,
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
            CustomerId = sale.CustomerId,
            CustomerName = sale.Customer?.Name,
            LoyaltyPointsEarned = sale.LoyaltyPointsEarned,
            LoyaltyPointsRedeemed = sale.LoyaltyPointsRedeemed,
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

    private static decimal NormalizeDiscountPercent(decimal value)
    {
        if (value < 0m || value > 100m)
        {
            throw new InvalidOperationException("Discount percent must be between 0 and 100.");
        }

        return RoundMoney(value);
    }

    private async Task<Customer> LoadCustomerAsync(Guid customerId, CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var customer = await dbContext.Customers
            .Include(x => x.PriceTier)
            .Include(x => x.Tags)
            .FirstOrDefaultAsync(x => x.Id == customerId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken)
            ?? throw new KeyNotFoundException("Customer not found.");

        return customer;
    }

    private async Task<Guid?> GetCurrentStoreIdAsync(CancellationToken cancellationToken)
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user is null)
        {
            return null;
        }

        var userIdValue = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return await dbContext.Users
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => x.StoreId)
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static decimal ResolveCustomerDiscountPercent(
        Customer customer,
        decimal requestedDiscountPercent)
    {
        if (customer.FixedDiscountPercent.HasValue)
        {
            return NormalizeDiscountPercent(customer.FixedDiscountPercent.Value);
        }

        if (customer.PriceTier is not null)
        {
            return NormalizeDiscountPercent(customer.PriceTier.DiscountPercent);
        }

        return NormalizeDiscountPercent(requestedDiscountPercent);
    }

    private static decimal ResolveLoyaltyRedemption(
        Customer customer,
        decimal requestedPointsToRedeem,
        decimal billTotal)
    {
        var pointsToRedeem = RoundMoney(requestedPointsToRedeem);
        if (pointsToRedeem <= 0m)
        {
            return 0m;
        }

        if (pointsToRedeem > customer.LoyaltyPoints)
        {
            throw new InvalidOperationException("Customer does not have enough loyalty points.");
        }

        if (pointsToRedeem > billTotal)
        {
            throw new InvalidOperationException("Loyalty points to redeem cannot exceed the bill total.");
        }

        return pointsToRedeem;
    }

    private static List<SerialNumber> ResolveSerialAssignmentsForSaleItem(
        SaleItem saleItem,
        Product product,
        IReadOnlyDictionary<Guid, Guid> requestedSerialBySaleItemId,
        IReadOnlySet<Guid> reservedSerialIds)
    {
        if (requestedSerialBySaleItemId.TryGetValue(saleItem.Id, out var requestedSerialId))
        {
            if (saleItem.Quantity != 1m)
            {
                throw new InvalidOperationException("Serial-selected items must use a quantity of 1.");
            }

            var requestedSerial = product.SerialNumbers.FirstOrDefault(x => x.Id == requestedSerialId);
            if (requestedSerial is null)
            {
                throw new InvalidOperationException($"Selected serial number was not found for '{saleItem.ProductNameSnapshot}'.");
            }

            if (requestedSerial.Status != SerialNumberStatus.Available)
            {
                throw new InvalidOperationException($"Serial number '{requestedSerial.SerialValue}' is no longer available for sale.");
            }

            return [requestedSerial];
        }

        var serialsNeeded = (int)saleItem.Quantity;
        var availableSerials = product.SerialNumbers
            .Where(x => x.Status == SerialNumberStatus.Available && !reservedSerialIds.Contains(x.Id))
            .OrderBy(x => x.CreatedAtUtc)
            .Take(serialsNeeded)
            .ToList();

        if (availableSerials.Count != serialsNeeded)
        {
            throw new InvalidOperationException($"Not enough serial numbers available for '{saleItem.ProductNameSnapshot}'.");
        }

        return availableSerials;
    }

    private sealed record PaymentSnapshot(
        Guid SaleId,
        PaymentMethod Method,
        decimal Amount,
        bool IsReversal);

    private sealed class CartComputation
    {
        public List<CartLine> Items { get; set; } = [];
        public Guid? StoreId { get; set; }
        public decimal Subtotal { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal GrandTotal { get; set; }
    }

    private sealed class CartLine
    {
        public Guid? ExistingSaleItemId { get; set; }
        public required Product Product { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal LineGross { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal LineTotal { get; set; }
        public Guid? SerialNumberId { get; set; }
        public string? SerialValue { get; set; }
    }
}
