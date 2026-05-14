using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.CashSessions;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Features.Batches;
using SmartPos.Backend.Features.Promotions;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Checkout;

public sealed class CheckoutService(
    SmartPosDbContext dbContext,
    IHttpContextAccessor httpContextAccessor,
    AuditLogService auditLogService,
    CashSessionService cashSessionService,
    StockMovementHelper stockMovementHelper,
    BatchDepletionHelper batchDepletionHelper,
    PromotionService promotionService)
{
    public async Task<SaleResponse> HoldAsync(
        HoldSaleRequest request,
        Guid? createdByUserId,
        CancellationToken cancellationToken)
    {
        var customer = request.CustomerId.HasValue
            ? await LoadCustomerAsync(request.CustomerId.Value, cancellationToken)
            : null;
        var customerDiscountPercent = customer is null
            ? 0m
            : ResolveCustomerDiscountPercent(customer, 0m);
        var cart = await BuildCartAsync(
            request.Items,
            customerDiscountPercent,
            request.DiscountPercent,
            request.DiscountFixed,
            request.Role,
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
            TransactionDiscountAmount = cart.TransactionDiscountAmount,
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
                ProductId = x.Product?.Id,
                BundleId = x.Bundle?.Id,
                ServiceId = x.Service?.Id,
                ProductNameSnapshot = x.Product?.Name ?? x.Bundle?.Name ?? x.Service?.Name ?? x.ProductName,
                BundleNameSnapshot = x.Bundle?.Name,
                ServiceNameSnapshot = x.Service?.Name,
                IsPack = x.IsPackSale,
                SalePackSize = x.SalePackSize,
                IsService = x.Service is not null,
                CustomPrice = x.CustomPrice,
                UnitPrice = x.UnitPrice,
                Quantity = x.Quantity,
                RawCashierLineDiscountPercent = x.RawCashierLineDiscountPercent,
                RawCashierLineDiscountFixed = x.RawCashierLineDiscountFixed,
                CatalogDiscountAmount = x.CatalogDiscountAmount,
                CashierLineDiscountAmount = x.CashierLineDiscountAmount,
                DiscountAmount = x.DiscountAmount,
                TaxAmount = 0m,
                LineTotal = x.LineTotal,
                Sale = null!,
                Product = null!,
                Bundle = null,
                Service = null
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
            if (request.CustomerId.HasValue)
            {
                var saleCustomer = await LoadCustomerAsync(request.CustomerId.Value, cancellationToken);
                sale.CustomerId = saleCustomer.Id;
                sale.Customer = saleCustomer;
            }

            var effectiveCustomer = sale.CustomerId.HasValue
                ? await LoadCustomerAsync(sale.CustomerId.Value, cancellationToken)
                : null;
            var customerDiscountPercent = effectiveCustomer is null
                ? 0m
                : ResolveCustomerDiscountPercent(effectiveCustomer, 0m);

            if (request.Items.Count > 0)
            {
                var cart = await BuildEditableHeldCartAsync(
                    sale,
                    request.Items,
                    customerDiscountPercent,
                    request.DiscountPercent,
                    request.DiscountFixed,
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
            var customerDiscountPercent = saleCustomer is null
                ? 0m
                : ResolveCustomerDiscountPercent(saleCustomer, 0m);
            var cart = await BuildCartAsync(
                request.Items,
                customerDiscountPercent,
                request.DiscountPercent,
                request.DiscountFixed,
                request.Role,
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
                    ProductId = line.Product?.Id,
                    BundleId = line.Bundle?.Id,
                    ServiceId = line.Service?.Id,
                    ProductNameSnapshot = line.Product?.Name ?? line.Bundle?.Name ?? line.Service?.Name ?? line.ProductName,
                    BundleNameSnapshot = line.Bundle?.Name,
                    ServiceNameSnapshot = line.Service?.Name,
                    IsPack = line.IsPackSale,
                    SalePackSize = line.SalePackSize,
                    IsService = line.Service is not null,
                    CustomPrice = line.CustomPrice,
                    UnitPrice = line.UnitPrice,
                    Quantity = line.Quantity,
                    RawCashierLineDiscountPercent = line.RawCashierLineDiscountPercent,
                    RawCashierLineDiscountFixed = line.RawCashierLineDiscountFixed,
                    CatalogDiscountAmount = line.CatalogDiscountAmount,
                    CashierLineDiscountAmount = line.CashierLineDiscountAmount,
                    DiscountAmount = line.DiscountAmount,
                    TaxAmount = 0m,
                    LineTotal = line.LineTotal,
                    Sale = null!,
                    Product = null!,
                    Bundle = null,
                    Service = null
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
                TransactionDiscountAmount = cart.TransactionDiscountAmount,
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
            sale.Items.Where(x => x.ProductId.HasValue).Select(x => x.ProductId!.Value),
            cancellationToken);
        var bundleStoreIds = await LoadBundleStoreIdsAsync(
            sale.Items.Where(x => x.BundleId.HasValue).Select(x => x.BundleId!.Value),
            cancellationToken);
        var serviceStoreIds = await LoadServiceStoreIdsAsync(
            sale.Items.Where(x => x.ServiceId.HasValue).Select(x => x.ServiceId!.Value),
            cancellationToken);
        sale.StoreId = ResolveStoreId(
            productStoreIds.Values
                .Concat(bundleStoreIds.Values)
                .Concat(serviceStoreIds.Values),
            "Sale");

        var paymentRecords = BuildPayments(request.Payments, sale.Id);
        var paidTotal = paymentRecords.Sum(x => x.Amount);
        if (paidTotal < sale.GrandTotal)
        {
            throw new InvalidOperationException("Payment total is lower than bill total.");
        }

        var change = decimal.Round(paidTotal - sale.GrandTotal, 2, MidpointRounding.AwayFromZero);
        var now = DateTimeOffset.UtcNow;
        var productIds = sale.Items
            .Where(x => x.ProductId.HasValue)
            .Select(x => x.ProductId!.Value)
            .Distinct()
            .ToArray();
        var bundleIds = sale.Items
            .Where(x => x.BundleId.HasValue)
            .Select(x => x.BundleId!.Value)
            .Distinct()
            .ToArray();
        var serviceIds = sale.Items
            .Where(x => x.ServiceId.HasValue)
            .Select(x => x.ServiceId!.Value)
            .Distinct()
            .ToArray();
        var loadedProducts = await dbContext.Products
            .Include(x => x.SerialNumbers)
            .Include(x => x.Inventory)
            .Where(x => productIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        var loadedBundles = await dbContext.Bundles
            .Include(x => x.Inventory)
            .Where(x => bundleIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        var loadedServices = await dbContext.Services
            .Where(x => serviceIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        var reservedSerialIds = requestedSerialBySaleItemId.Values.ToHashSet();

        foreach (var saleItem in sale.Items)
        {
            if (saleItem.ProductId.HasValue)
            {
                if (!loadedProducts.TryGetValue(saleItem.ProductId.Value, out var product))
                {
                    throw new InvalidOperationException("Product not found for sale item.");
                }

                if (product.IsBatchTracked)
                {
                    await batchDepletionHelper.DepleteAsync(
                        productStoreIds[saleItem.ProductId.Value],
                        saleItem.ProductId.Value,
                        saleItem.Quantity,
                        sale.Id,
                        createdByUserId,
                        cancellationToken);
                }

                if (!product.IsBatchTracked)
                {
                    await stockMovementHelper.RecordMovementAsync(
                        storeId: productStoreIds[saleItem.ProductId.Value],
                        productId: saleItem.ProductId.Value,
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
                continue;
            }

            if (!saleItem.BundleId.HasValue)
            {
                if (saleItem.ServiceId.HasValue)
                {
                    if (!loadedServices.ContainsKey(saleItem.ServiceId.Value))
                    {
                        throw new InvalidOperationException("Service not found for sale item.");
                    }

                    continue;
                }

                throw new InvalidOperationException("Sale item must reference a product, bundle, or service.");
            }

            if (!loadedBundles.TryGetValue(saleItem.BundleId.Value, out var bundle))
            {
                throw new InvalidOperationException("Bundle not found for sale item.");
            }

            await stockMovementHelper.RecordBundleMovementAsync(
                storeId: bundleStoreIds[saleItem.BundleId.Value],
                bundleId: saleItem.BundleId.Value,
                type: StockMovementType.Sale,
                quantityChange: -saleItem.Quantity,
                refType: StockMovementRef.Sale,
                refId: sale.Id,
                reason: "sale",
                userId: createdByUserId,
                cancellationToken: cancellationToken);
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
        if (creditPaidTotal > 0m && !customerId.HasValue)
        {
            throw new InvalidOperationException("Credit sales require a customer.");
        }

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
        decimal customerDiscountPercent,
        decimal cashierTransactionDiscountPercent,
        decimal? cashierTransactionDiscountFixed,
        string role,
        CancellationToken cancellationToken)
    {
        if (requestItems.Count == 0)
        {
            throw new InvalidOperationException("Cart cannot be empty.");
        }

        var normalizedRole = role.Trim().ToLowerInvariant();
        var maxDiscount = GetDiscountLimitForRole(normalizedRole);
        if (customerDiscountPercent < 0m || customerDiscountPercent > 100m)
        {
            throw new InvalidOperationException("Discount percent must be between 0 and 100.");
        }

        var normalizedCashierTxnPercent = RoundMoney(cashierTransactionDiscountPercent);
        var normalizedCashierTxnFixed = cashierTransactionDiscountFixed.HasValue
            ? RoundMoney(cashierTransactionDiscountFixed.Value)
            : (decimal?)null;

        ValidateOperatorTransactionDiscountInputs(
            normalizedCashierTxnPercent,
            normalizedCashierTxnFixed,
            maxDiscount);

        if (requestItems.Any(x =>
                x.CashierLineDiscountPercent.HasValue &&
                x.CashierLineDiscountFixed.HasValue))
        {
            throw new InvalidOperationException("Each line can have only one cashier discount type.");
        }

        if (requestItems.Any(x =>
                x.CashierLineDiscountPercent.HasValue &&
                (x.CashierLineDiscountPercent.Value < 0m || x.CashierLineDiscountPercent.Value > maxDiscount)))
        {
            throw new InvalidOperationException($"Line discount exceeds role limit ({maxDiscount}%).");
        }

        if (requestItems.Any(x => x.CashierLineDiscountFixed.HasValue && x.CashierLineDiscountFixed.Value < 0m))
        {
            throw new InvalidOperationException("Line fixed discount cannot be negative.");
        }

        if (requestItems.Any(x => x.Quantity <= 0m))
        {
            throw new InvalidOperationException("All quantities must be greater than zero.");
        }

        if (requestItems.Any(x =>
            (x.ProductId.HasValue ? 1 : 0) +
            (x.BundleId.HasValue ? 1 : 0) +
            (x.ServiceId.HasValue ? 1 : 0) != 1))
        {
            throw new InvalidOperationException("Each cart item must include exactly one of product_id, bundle_id, or service_id.");
        }

        if (requestItems.Any(x => x.IsPackSale && !x.ProductId.HasValue))
        {
            throw new InvalidOperationException("Pack selling is supported only for product lines.");
        }

        if (requestItems.Any(x => x.CustomPrice.HasValue && !x.ServiceId.HasValue))
        {
            throw new InvalidOperationException("custom_price is allowed only for service lines.");
        }

        var serialSpecificItems = requestItems.Where(x => x.SerialNumberId.HasValue).ToList();
        if (serialSpecificItems.Any(x => !x.ProductId.HasValue || x.BundleId.HasValue || x.ServiceId.HasValue || x.IsPackSale || x.Quantity != 1m))
        {
            throw new InvalidOperationException("Serial-selected items must be product unit lines with quantity 1.");
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

        var groupedProductItems = requestItems
            .Where(x => x.ProductId.HasValue && !x.SerialNumberId.HasValue)
            .GroupBy(x => new
            {
                ProductId = x.ProductId!.Value,
                x.IsPackSale,
                x.CashierLineDiscountPercent,
                x.CashierLineDiscountFixed
            })
            .Select(x => new
            {
                x.Key.ProductId,
                x.Key.IsPackSale,
                x.Key.CashierLineDiscountPercent,
                x.Key.CashierLineDiscountFixed,
                Quantity = x.Sum(y => y.Quantity)
            })
            .ToList();

        var groupedBundleItems = requestItems
            .Where(x => x.BundleId.HasValue)
            .GroupBy(x => new
            {
                BundleId = x.BundleId!.Value,
                x.CashierLineDiscountPercent,
                x.CashierLineDiscountFixed
            })
            .Select(x => new
            {
                x.Key.BundleId,
                x.Key.CashierLineDiscountPercent,
                x.Key.CashierLineDiscountFixed,
                Quantity = x.Sum(y => y.Quantity)
            })
            .ToList();
        var groupedServiceItems = requestItems
            .Where(x => x.ServiceId.HasValue)
            .GroupBy(x => new
            {
                ServiceId = x.ServiceId!.Value,
                CustomPrice = x.CustomPrice,
                x.CashierLineDiscountPercent,
                x.CashierLineDiscountFixed
            })
            .Select(x => new
            {
                x.Key.ServiceId,
                x.Key.CustomPrice,
                x.Key.CashierLineDiscountPercent,
                x.Key.CashierLineDiscountFixed,
                Quantity = x.Sum(y => y.Quantity)
            })
            .ToList();

        var productIds = requestItems
            .Where(x => x.ProductId.HasValue)
            .Select(x => x.ProductId!.Value)
            .Distinct()
            .ToArray();
        var bundleIds = groupedBundleItems.Select(x => x.BundleId).Distinct().ToArray();
        var serviceIds = groupedServiceItems.Select(x => x.ServiceId).Distinct().ToArray();

        var products = await dbContext.Products
            .AsNoTracking()
            .Where(x => productIds.Contains(x.Id) && x.IsActive)
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        if (products.Count != productIds.Length)
        {
            throw new InvalidOperationException("Some products are missing or inactive.");
        }

        var bundles = await dbContext.Bundles
            .AsNoTracking()
            .Include(x => x.Inventory)
            .Where(x => bundleIds.Contains(x.Id) && x.IsActive)
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        if (bundles.Count != bundleIds.Length)
        {
            throw new InvalidOperationException("Some bundles are missing or inactive.");
        }
        var services = await dbContext.Services
            .AsNoTracking()
            .Where(x => serviceIds.Contains(x.Id) && x.IsActive)
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        if (services.Count != serviceIds.Length)
        {
            throw new InvalidOperationException("Some services are missing or inactive.");
        }

        var activePromotionDiscounts = await promotionService.GetActivePromotionDiscountsAsync(
            products.Values
                .Select(x => (x.Id, x.CategoryId))
                .ToList(),
            DateTimeOffset.UtcNow,
            cancellationToken);

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

        foreach (var item in groupedProductItems)
        {
            var product = products[item.ProductId];
            if (product.IsSerialTracked)
            {
                throw new InvalidOperationException(
                    $"'{product.Name}' requires a validated serial number before it can be added to the cart.");
            }

            if (item.IsPackSale)
            {
                if (product.IsSerialTracked)
                {
                    throw new InvalidOperationException($"'{product.Name}' cannot be sold as a pack because it is serial-tracked.");
                }

                if (!product.HasPackOption || product.PackSize < 2 || !product.PackPrice.HasValue || product.PackPrice.Value <= 0m)
                {
                    throw new InvalidOperationException($"'{product.Name}' is not configured for pack selling.");
                }

                var stockQty = decimal.Round(item.Quantity * product.PackSize, 3, MidpointRounding.AwayFromZero);
                var lineGross = decimal.Round(product.PackPrice.Value * item.Quantity, 2, MidpointRounding.AwayFromZero);
                subtotal += lineGross;

                cartLines.Add(new CartLine
                {
                    Product = product,
                    ProductName = product.Name,
                    IsPackSale = true,
                    SalePackSize = product.PackSize,
                    PackLabel = product.PackLabel,
                    Quantity = stockQty,
                    UnitPrice = product.PackPrice.Value,
                    LineGross = lineGross,
                    RawCashierLineDiscountPercent = item.CashierLineDiscountPercent,
                    RawCashierLineDiscountFixed = item.CashierLineDiscountFixed
                });
                continue;
            }

            var productLineGross = decimal.Round(product.UnitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero);
            subtotal += productLineGross;

            cartLines.Add(new CartLine
            {
                Product = product,
                ProductName = product.Name,
                IsPackSale = false,
                SalePackSize = 0,
                Quantity = item.Quantity,
                UnitPrice = product.UnitPrice,
                LineGross = productLineGross,
                RawCashierLineDiscountPercent = item.CashierLineDiscountPercent,
                RawCashierLineDiscountFixed = item.CashierLineDiscountFixed
            });
        }

        foreach (var item in serialSpecificItems)
        {
            var product = products[item.ProductId!.Value];
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
                ProductName = product.Name,
                Quantity = item.Quantity,
                UnitPrice = product.UnitPrice,
                LineGross = lineGross,
                SerialNumberId = serial.Id,
                SerialValue = serial.SerialValue,
                RawCashierLineDiscountPercent = item.CashierLineDiscountPercent,
                RawCashierLineDiscountFixed = item.CashierLineDiscountFixed
            });
        }

        foreach (var item in groupedBundleItems)
        {
            var bundle = bundles[item.BundleId];
            var lineGross = decimal.Round(bundle.Price * item.Quantity, 2, MidpointRounding.AwayFromZero);
            subtotal += lineGross;

            cartLines.Add(new CartLine
            {
                Bundle = bundle,
                ProductName = bundle.Name,
                Quantity = item.Quantity,
                UnitPrice = bundle.Price,
                LineGross = lineGross,
                RawCashierLineDiscountPercent = item.CashierLineDiscountPercent,
                RawCashierLineDiscountFixed = item.CashierLineDiscountFixed
            });
        }
        foreach (var item in groupedServiceItems)
        {
            var service = services[item.ServiceId];
            var unitPrice = item.CustomPrice ?? service.Price;
            if (unitPrice <= 0m)
            {
                throw new InvalidOperationException($"'{service.Name}' has an invalid selling price.");
            }

            var lineGross = decimal.Round(unitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero);
            subtotal += lineGross;

            cartLines.Add(new CartLine
            {
                Service = service,
                ProductName = service.Name,
                Quantity = item.Quantity,
                UnitPrice = unitPrice,
                CustomPrice = item.CustomPrice,
                LineGross = lineGross,
                RawCashierLineDiscountPercent = item.CashierLineDiscountPercent,
                RawCashierLineDiscountFixed = item.CashierLineDiscountFixed
            });
        }

        foreach (var line in cartLines)
        {
            var catalogDiscountAmount = ResolveCatalogDiscountAmount(
                line,
                activePromotionDiscounts);
            var lineBaseAfterCatalog = RoundMoney(Math.Max(0m, line.LineGross - catalogDiscountAmount));
            var cashierLineDiscountAmount = ResolveCashierLineDiscountAmount(
                lineBaseAfterCatalog,
                line.RawCashierLineDiscountPercent,
                line.RawCashierLineDiscountFixed,
                maxDiscount);

            line.CatalogDiscountAmount = catalogDiscountAmount;
            line.CashierLineDiscountAmount = cashierLineDiscountAmount;
            line.DiscountAmount = RoundMoney(catalogDiscountAmount + cashierLineDiscountAmount);
            line.LineTotal = RoundMoney(Math.Max(0m, line.LineGross - line.DiscountAmount));
        }

        var subtotalAfterLines = RoundMoney(cartLines.Sum(x => x.LineTotal));
        var customerTransactionDiscountAmount = RoundMoney(subtotalAfterLines * (customerDiscountPercent / 100m));
        var subtotalAfterCustomerDiscount = RoundMoney(Math.Max(0m, subtotalAfterLines - customerTransactionDiscountAmount));
        var cashierTransactionDiscountAmount = ResolveCashierTransactionDiscountAmount(
            subtotalAfterCustomerDiscount,
            normalizedCashierTxnPercent,
            normalizedCashierTxnFixed,
            maxDiscount);
        var transactionDiscountAmount = RoundMoney(customerTransactionDiscountAmount + cashierTransactionDiscountAmount);
        var discountTotal = RoundMoney(cartLines.Sum(x => x.DiscountAmount) + transactionDiscountAmount);
        var grandTotal = RoundMoney(Math.Max(0m, subtotalAfterCustomerDiscount - cashierTransactionDiscountAmount));

        return new CartComputation
        {
            Items = cartLines,
            StoreId = ResolveStoreId(
                cartLines
                    .Select(x => x.Product?.StoreId)
                    .Concat(cartLines.Select(x => x.Bundle?.StoreId))
                    .Concat(cartLines.Select(x => x.Service?.StoreId)),
                "Cart"),
            Subtotal = subtotal,
            TransactionDiscountAmount = transactionDiscountAmount,
            DiscountTotal = discountTotal,
            GrandTotal = grandTotal
        };
    }

    private async Task<CartComputation> BuildEditableHeldCartAsync(
        Sale sale,
        IReadOnlyCollection<CartItemRequest> requestItems,
        decimal customerDiscountPercent,
        decimal cashierTransactionDiscountPercent,
        decimal? cashierTransactionDiscountFixed,
        string role,
        CancellationToken cancellationToken)
    {
        if (requestItems.Count == 0)
        {
            throw new InvalidOperationException("Cart cannot be empty.");
        }

        var normalizedRole = role.Trim().ToLowerInvariant();
        var maxDiscount = GetDiscountLimitForRole(normalizedRole);
        if (customerDiscountPercent < 0m || customerDiscountPercent > 100m)
        {
            throw new InvalidOperationException("Discount percent must be between 0 and 100.");
        }

        var normalizedCashierTxnPercent = RoundMoney(cashierTransactionDiscountPercent);
        var normalizedCashierTxnFixed = cashierTransactionDiscountFixed.HasValue
            ? RoundMoney(cashierTransactionDiscountFixed.Value)
            : (decimal?)null;
        ValidateOperatorTransactionDiscountInputs(
            normalizedCashierTxnPercent,
            normalizedCashierTxnFixed,
            maxDiscount);

        if (requestItems.Any(x =>
                x.CashierLineDiscountPercent.HasValue &&
                x.CashierLineDiscountFixed.HasValue))
        {
            throw new InvalidOperationException("Each line can have only one cashier discount type.");
        }

        if (requestItems.Any(x =>
                x.CashierLineDiscountPercent.HasValue &&
                (x.CashierLineDiscountPercent.Value < 0m || x.CashierLineDiscountPercent.Value > maxDiscount)))
        {
            throw new InvalidOperationException($"Line discount exceeds role limit ({maxDiscount}%).");
        }

        if (requestItems.Any(x => x.CashierLineDiscountFixed.HasValue && x.CashierLineDiscountFixed.Value < 0m))
        {
            throw new InvalidOperationException("Line fixed discount cannot be negative.");
        }

        if (requestItems.Any(x => x.Quantity <= 0m))
        {
            throw new InvalidOperationException("All quantities must be greater than zero.");
        }

        if (requestItems.Any(x =>
            (x.ProductId.HasValue ? 1 : 0) +
            (x.BundleId.HasValue ? 1 : 0) +
            (x.ServiceId.HasValue ? 1 : 0) != 1))
        {
            throw new InvalidOperationException("Each cart item must include exactly one of product_id, bundle_id, or service_id.");
        }

        if (requestItems.Any(x => x.IsPackSale && !x.ProductId.HasValue))
        {
            throw new InvalidOperationException("Pack selling is supported only for product lines.");
        }

        if (requestItems.Any(x => x.CustomPrice.HasValue && !x.ServiceId.HasValue))
        {
            throw new InvalidOperationException("custom_price is allowed only for service lines.");
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

            if (existingSaleItem.ProductId != requestItem.ProductId ||
                existingSaleItem.BundleId != requestItem.BundleId ||
                existingSaleItem.ServiceId != requestItem.ServiceId)
            {
                throw new InvalidOperationException("Held sale items cannot be reassigned to a different item.");
            }
        }

        var serialSpecificItems = requestItems
            .Where(x => x.SerialNumberId.HasValue)
            .ToList();
        if (serialSpecificItems.Any(x => x.Quantity != 1m || !x.ProductId.HasValue || x.BundleId.HasValue || x.ServiceId.HasValue || x.IsPackSale))
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
            .Where(x => x.ProductId.HasValue)
            .Select(x => x.ProductId!.Value)
            .Distinct()
            .ToArray();
        var bundleIds = requestItems
            .Where(x => x.BundleId.HasValue)
            .Select(x => x.BundleId!.Value)
            .Distinct()
            .ToArray();
        var serviceIds = requestItems
            .Where(x => x.ServiceId.HasValue)
            .Select(x => x.ServiceId!.Value)
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
        var bundles = await dbContext.Bundles
            .AsNoTracking()
            .Where(x => bundleIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        if (bundles.Count != bundleIds.Length)
        {
            throw new InvalidOperationException("Some bundles are missing.");
        }
        var services = await dbContext.Services
            .AsNoTracking()
            .Where(x => serviceIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        if (services.Count != serviceIds.Length)
        {
            throw new InvalidOperationException("Some services are missing.");
        }

        if (requestItems.Any(x => !x.SaleItemId.HasValue && x.ProductId.HasValue && !products[x.ProductId!.Value].IsActive))
        {
            throw new InvalidOperationException("Some products are missing or inactive.");
        }
        if (requestItems.Any(x => !x.SaleItemId.HasValue && x.BundleId.HasValue && !bundles[x.BundleId!.Value].IsActive))
        {
            throw new InvalidOperationException("Some bundles are missing or inactive.");
        }
        if (requestItems.Any(x => !x.SaleItemId.HasValue && x.ServiceId.HasValue && !services[x.ServiceId!.Value].IsActive))
        {
            throw new InvalidOperationException("Some services are missing or inactive.");
        }

        var activePromotionDiscounts = await promotionService.GetActivePromotionDiscountsAsync(
            products.Values
                .Select(x => (x.Id, x.CategoryId))
                .ToList(),
            DateTimeOffset.UtcNow,
            cancellationToken);

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
            var existingSaleItem = item.SaleItemId.HasValue
                ? existingSaleItemsById[item.SaleItemId.Value]
                : null;
            if (item.ProductId.HasValue)
            {
                var product = products[item.ProductId.Value];

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
                        SerialValue = serial.SerialValue,
                        RawCashierLineDiscountPercent = item.CashierLineDiscountPercent,
                        RawCashierLineDiscountFixed = item.CashierLineDiscountFixed
                    });

                    continue;
                }

                if (item.IsPackSale)
                {
                    if (product.IsSerialTracked)
                    {
                        throw new InvalidOperationException($"'{product.Name}' cannot be sold as a pack because it is serial-tracked.");
                    }

                    if (!product.HasPackOption || product.PackSize < 2 || !product.PackPrice.HasValue || product.PackPrice.Value <= 0m)
                    {
                        throw new InvalidOperationException($"'{product.Name}' is not configured for pack selling.");
                    }

                    var stockQty = decimal.Round(item.Quantity * product.PackSize, 3, MidpointRounding.AwayFromZero);
                    var unitPrice = existingSaleItem?.UnitPrice ?? product.PackPrice.Value;
                    var lineGross = decimal.Round(unitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero);
                    subtotal += lineGross;

                    cartLines.Add(new CartLine
                    {
                        ExistingSaleItemId = existingSaleItem?.Id,
                        Product = product,
                        ProductName = existingSaleItem?.ProductNameSnapshot ?? product.Name,
                        IsPackSale = true,
                        SalePackSize = product.PackSize,
                        PackLabel = product.PackLabel,
                        Quantity = stockQty,
                        UnitPrice = unitPrice,
                        LineGross = lineGross,
                        RawCashierLineDiscountPercent = item.CashierLineDiscountPercent,
                        RawCashierLineDiscountFixed = item.CashierLineDiscountFixed
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
                    LineGross = genericLineGross,
                    RawCashierLineDiscountPercent = item.CashierLineDiscountPercent,
                    RawCashierLineDiscountFixed = item.CashierLineDiscountFixed
                });

                continue;
            }

            if (item.BundleId.HasValue)
            {
                var bundle = bundles[item.BundleId.Value];
                var unitPrice = existingSaleItem?.UnitPrice ?? bundle.Price;
                var lineGross = decimal.Round(unitPrice * item.Quantity, 2, MidpointRounding.AwayFromZero);
                subtotal += lineGross;

                cartLines.Add(new CartLine
                {
                    ExistingSaleItemId = existingSaleItem?.Id,
                    Bundle = bundle,
                    ProductName = existingSaleItem?.ProductNameSnapshot ?? bundle.Name,
                    Quantity = item.Quantity,
                    UnitPrice = unitPrice,
                    LineGross = lineGross,
                    RawCashierLineDiscountPercent = item.CashierLineDiscountPercent,
                    RawCashierLineDiscountFixed = item.CashierLineDiscountFixed
                });

                continue;
            }

            if (!item.ServiceId.HasValue)
            {
                throw new InvalidOperationException("Each cart item must include exactly one of product_id, bundle_id, or service_id.");
            }

            var service = services[item.ServiceId.Value];
            var unitPriceForService = item.CustomPrice
                ?? existingSaleItem?.CustomPrice
                ?? existingSaleItem?.UnitPrice
                ?? service.Price;
            if (unitPriceForService <= 0m)
            {
                throw new InvalidOperationException($"'{service.Name}' has an invalid selling price.");
            }

            var serviceLineGross = decimal.Round(unitPriceForService * item.Quantity, 2, MidpointRounding.AwayFromZero);
            subtotal += serviceLineGross;

            cartLines.Add(new CartLine
            {
                ExistingSaleItemId = existingSaleItem?.Id,
                Service = service,
                ProductName = existingSaleItem?.ProductNameSnapshot ?? service.Name,
                Quantity = item.Quantity,
                UnitPrice = unitPriceForService,
                CustomPrice = item.CustomPrice ?? existingSaleItem?.CustomPrice,
                LineGross = serviceLineGross,
                RawCashierLineDiscountPercent = item.CashierLineDiscountPercent,
                RawCashierLineDiscountFixed = item.CashierLineDiscountFixed
            });
        }

        foreach (var line in cartLines)
        {
            var catalogDiscountAmount = ResolveCatalogDiscountAmount(
                line,
                activePromotionDiscounts);
            var lineBaseAfterCatalog = RoundMoney(Math.Max(0m, line.LineGross - catalogDiscountAmount));
            var cashierLineDiscountAmount = ResolveCashierLineDiscountAmount(
                lineBaseAfterCatalog,
                line.RawCashierLineDiscountPercent,
                line.RawCashierLineDiscountFixed,
                maxDiscount);

            line.CatalogDiscountAmount = catalogDiscountAmount;
            line.CashierLineDiscountAmount = cashierLineDiscountAmount;
            line.DiscountAmount = RoundMoney(catalogDiscountAmount + cashierLineDiscountAmount);
            line.LineTotal = RoundMoney(Math.Max(0m, line.LineGross - line.DiscountAmount));
        }

        var subtotalAfterLines = RoundMoney(cartLines.Sum(x => x.LineTotal));
        var customerTransactionDiscountAmount = RoundMoney(subtotalAfterLines * (customerDiscountPercent / 100m));
        var subtotalAfterCustomerDiscount = RoundMoney(Math.Max(0m, subtotalAfterLines - customerTransactionDiscountAmount));
        var cashierTransactionDiscountAmount = ResolveCashierTransactionDiscountAmount(
            subtotalAfterCustomerDiscount,
            normalizedCashierTxnPercent,
            normalizedCashierTxnFixed,
            maxDiscount);
        var transactionDiscountAmount = RoundMoney(customerTransactionDiscountAmount + cashierTransactionDiscountAmount);
        var discountTotal = RoundMoney(cartLines.Sum(x => x.DiscountAmount) + transactionDiscountAmount);
        var grandTotal = RoundMoney(Math.Max(0m, subtotalAfterCustomerDiscount - cashierTransactionDiscountAmount));

        return new CartComputation
        {
            Items = cartLines,
            StoreId = ResolveStoreId(
                cartLines
                    .Select(x => x.Product?.StoreId)
                    .Concat(cartLines.Select(x => x.Bundle?.StoreId))
                    .Concat(cartLines.Select(x => x.Service?.StoreId)),
                "Cart"),
            Subtotal = subtotal,
            TransactionDiscountAmount = transactionDiscountAmount,
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
                saleItem.BundleNameSnapshot = line.Bundle?.Name;
                saleItem.ServiceNameSnapshot = line.Service?.Name;
                saleItem.BundleId = line.Bundle?.Id;
                saleItem.ProductId = line.Product?.Id;
                saleItem.ServiceId = line.Service?.Id;
                saleItem.IsPack = line.IsPackSale;
                saleItem.SalePackSize = line.SalePackSize;
                saleItem.IsService = line.Service is not null;
                saleItem.CustomPrice = line.CustomPrice;
                saleItem.RawCashierLineDiscountPercent = line.RawCashierLineDiscountPercent;
                saleItem.RawCashierLineDiscountFixed = line.RawCashierLineDiscountFixed;
                saleItem.CatalogDiscountAmount = line.CatalogDiscountAmount;
                saleItem.CashierLineDiscountAmount = line.CashierLineDiscountAmount;
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
                ProductId = line.Product?.Id,
                BundleId = line.Bundle?.Id,
                ServiceId = line.Service?.Id,
                ProductNameSnapshot = line.ProductName,
                BundleNameSnapshot = line.Bundle?.Name,
                ServiceNameSnapshot = line.Service?.Name,
                IsPack = line.IsPackSale,
                SalePackSize = line.SalePackSize,
                IsService = line.Service is not null,
                CustomPrice = line.CustomPrice,
                UnitPrice = line.UnitPrice,
                Quantity = line.Quantity,
                RawCashierLineDiscountPercent = line.RawCashierLineDiscountPercent,
                RawCashierLineDiscountFixed = line.RawCashierLineDiscountFixed,
                CatalogDiscountAmount = line.CatalogDiscountAmount,
                CashierLineDiscountAmount = line.CashierLineDiscountAmount,
                DiscountAmount = line.DiscountAmount,
                TaxAmount = 0m,
                LineTotal = line.LineTotal,
                Sale = sale,
                Product = null!,
                Bundle = null,
                Service = null
            };

            dbContext.SaleItems.Add(saleItemToAdd);

            if (line.SerialNumberId.HasValue)
            {
                requestedSerialBySaleItemId[saleItemToAdd.Id] = line.SerialNumberId.Value;
            }
        }

        sale.StoreId = cart.StoreId;
        sale.Subtotal = cart.Subtotal;
        sale.TransactionDiscountAmount = cart.TransactionDiscountAmount;
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

    private async Task<Dictionary<Guid, Guid?>> LoadBundleStoreIdsAsync(
        IEnumerable<Guid> bundleIds,
        CancellationToken cancellationToken)
    {
        var distinctBundleIds = bundleIds
            .Distinct()
            .ToArray();

        if (distinctBundleIds.Length == 0)
        {
            return [];
        }

        var storeIds = await dbContext.Bundles
            .AsNoTracking()
            .Where(x => distinctBundleIds.Contains(x.Id))
            .Select(x => new { x.Id, x.StoreId })
            .ToDictionaryAsync(x => x.Id, x => x.StoreId, cancellationToken);

        if (storeIds.Count != distinctBundleIds.Length)
        {
            throw new InvalidOperationException("Some bundles are missing.");
        }

        return storeIds;
    }

    private async Task<Dictionary<Guid, Guid?>> LoadServiceStoreIdsAsync(
        IEnumerable<Guid> serviceIds,
        CancellationToken cancellationToken)
    {
        var distinctServiceIds = serviceIds
            .Distinct()
            .ToArray();

        if (distinctServiceIds.Length == 0)
        {
            return [];
        }

        var storeIds = await dbContext.Services
            .AsNoTracking()
            .Where(x => distinctServiceIds.Contains(x.Id))
            .Select(x => new { x.Id, x.StoreId })
            .ToDictionaryAsync(x => x.Id, x => x.StoreId, cancellationToken);

        if (storeIds.Count != distinctServiceIds.Length)
        {
            throw new InvalidOperationException("Some services are missing.");
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
            TransactionDiscountAmount = sale.TransactionDiscountAmount,
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
                BundleId = x.BundleId,
                BundleName = x.BundleNameSnapshot,
                ServiceId = x.ServiceId,
                ServiceName = x.ServiceNameSnapshot,
                IsService = x.IsService,
                CustomPrice = x.CustomPrice,
                IsPack = x.IsPack,
                SalePackSize = x.SalePackSize,
                PackLabel = x.IsPack && x.SalePackSize > 1
                    ? $"Pack of {x.SalePackSize}"
                    : null,
                UnitPrice = x.UnitPrice,
                Quantity = x.Quantity,
                CashierLineDiscountPercent = x.RawCashierLineDiscountPercent,
                CashierLineDiscountFixed = x.RawCashierLineDiscountFixed,
                CatalogDiscountAmount = x.CatalogDiscountAmount,
                CashierLineDiscountAmount = x.CashierLineDiscountAmount,
                DiscountAmount = x.DiscountAmount,
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

    private static void ValidateOperatorTransactionDiscountInputs(
        decimal cashierTransactionDiscountPercent,
        decimal? cashierTransactionDiscountFixed,
        decimal maxDiscountPercent)
    {
        if (cashierTransactionDiscountPercent < 0m || cashierTransactionDiscountPercent > maxDiscountPercent)
        {
            throw new InvalidOperationException($"Transaction discount exceeds role limit ({maxDiscountPercent}%).");
        }

        if (cashierTransactionDiscountFixed.HasValue && cashierTransactionDiscountFixed.Value < 0m)
        {
            throw new InvalidOperationException("Transaction fixed discount cannot be negative.");
        }

        if (cashierTransactionDiscountPercent > 0m && cashierTransactionDiscountFixed.HasValue)
        {
            throw new InvalidOperationException("Use either transaction discount percent or fixed amount, not both.");
        }
    }

    private static decimal ResolveCatalogDiscountAmount(
        CartLine line,
        IReadOnlyDictionary<Guid, ActivePromotionDiscount> activePromotionDiscounts)
    {
        if (line.Product is null)
        {
            return 0m;
        }

        if (activePromotionDiscounts.TryGetValue(line.Product.Id, out var promotion))
        {
            return ResolveValueDiscountAmount(line.LineGross, promotion.ValueType, promotion.Value, strictLimit: false, "Promotion");
        }

        if (line.Product.PermanentDiscountPercent.HasValue)
        {
            return ResolveValueDiscountAmount(
                line.LineGross,
                PromotionValueType.Percent,
                line.Product.PermanentDiscountPercent.Value,
                strictLimit: false,
                "Product permanent");
        }

        if (line.Product.PermanentDiscountFixed.HasValue)
        {
            return ResolveValueDiscountAmount(
                line.LineGross,
                PromotionValueType.Fixed,
                line.Product.PermanentDiscountFixed.Value,
                strictLimit: false,
                "Product permanent");
        }

        return 0m;
    }

    private static decimal ResolveCashierLineDiscountAmount(
        decimal eligibleBase,
        decimal? discountPercent,
        decimal? discountFixed,
        decimal maxDiscountPercent)
    {
        if (eligibleBase <= 0m)
        {
            return 0m;
        }

        if (discountPercent.HasValue && discountFixed.HasValue)
        {
            throw new InvalidOperationException("Each line can have only one cashier discount type.");
        }

        if (discountPercent.HasValue)
        {
            if (discountPercent.Value < 0m || discountPercent.Value > maxDiscountPercent)
            {
                throw new InvalidOperationException($"Line discount exceeds role limit ({maxDiscountPercent}%).");
            }

            return ResolveValueDiscountAmount(
                eligibleBase,
                PromotionValueType.Percent,
                discountPercent.Value,
                strictLimit: true,
                "Line");
        }

        if (!discountFixed.HasValue)
        {
            return 0m;
        }

        if (discountFixed.Value < 0m)
        {
            throw new InvalidOperationException("Line fixed discount cannot be negative.");
        }

        var capAmount = RoundMoney(eligibleBase * (maxDiscountPercent / 100m));
        if (RoundMoney(discountFixed.Value) > capAmount)
        {
            throw new InvalidOperationException($"Line fixed discount exceeds role limit ({maxDiscountPercent}%).");
        }

        return ResolveValueDiscountAmount(
            eligibleBase,
            PromotionValueType.Fixed,
            discountFixed.Value,
            strictLimit: true,
            "Line");
    }

    private static decimal ResolveCashierTransactionDiscountAmount(
        decimal eligibleBase,
        decimal discountPercent,
        decimal? discountFixed,
        decimal maxDiscountPercent)
    {
        if (eligibleBase <= 0m)
        {
            return 0m;
        }

        if (discountPercent > 0m && discountFixed.HasValue)
        {
            throw new InvalidOperationException("Use either transaction discount percent or fixed amount, not both.");
        }

        if (discountPercent > 0m)
        {
            if (discountPercent > maxDiscountPercent)
            {
                throw new InvalidOperationException($"Transaction discount exceeds role limit ({maxDiscountPercent}%).");
            }

            return ResolveValueDiscountAmount(
                eligibleBase,
                PromotionValueType.Percent,
                discountPercent,
                strictLimit: true,
                "Transaction");
        }

        if (!discountFixed.HasValue)
        {
            return 0m;
        }

        var normalizedFixed = RoundMoney(discountFixed.Value);
        if (normalizedFixed < 0m)
        {
            throw new InvalidOperationException("Transaction fixed discount cannot be negative.");
        }

        var capAmount = RoundMoney(eligibleBase * (maxDiscountPercent / 100m));
        if (normalizedFixed > capAmount)
        {
            throw new InvalidOperationException($"Transaction fixed discount exceeds role limit ({maxDiscountPercent}%).");
        }

        return ResolveValueDiscountAmount(
            eligibleBase,
            PromotionValueType.Fixed,
            normalizedFixed,
            strictLimit: true,
            "Transaction");
    }

    private static decimal ResolveValueDiscountAmount(
        decimal baseAmount,
        PromotionValueType valueType,
        decimal value,
        bool strictLimit,
        string label)
    {
        if (baseAmount <= 0m)
        {
            return 0m;
        }

        var normalizedValue = RoundMoney(value);
        if (normalizedValue <= 0m)
        {
            return 0m;
        }

        decimal rawDiscount = valueType switch
        {
            PromotionValueType.Percent => RoundMoney(baseAmount * (normalizedValue / 100m)),
            PromotionValueType.Fixed => normalizedValue,
            _ => 0m
        };

        if (strictLimit && rawDiscount > baseAmount)
        {
            throw new InvalidOperationException($"{label} fixed discount cannot exceed eligible amount.");
        }

        return RoundMoney(Math.Min(baseAmount, Math.Max(0m, rawDiscount)));
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
        public decimal TransactionDiscountAmount { get; set; }
        public decimal DiscountTotal { get; set; }
        public decimal GrandTotal { get; set; }
    }

    private sealed class CartLine
    {
        public Guid? ExistingSaleItemId { get; set; }
        public Product? Product { get; set; }
        public Bundle? Bundle { get; set; }
        public Service? Service { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public bool IsPackSale { get; set; }
        public int SalePackSize { get; set; }
        public string? PackLabel { get; set; }
        public decimal? CustomPrice { get; set; }
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal LineGross { get; set; }
        public decimal? RawCashierLineDiscountPercent { get; set; }
        public decimal? RawCashierLineDiscountFixed { get; set; }
        public decimal CatalogDiscountAmount { get; set; }
        public decimal CashierLineDiscountAmount { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal LineTotal { get; set; }
        public Guid? SerialNumberId { get; set; }
        public string? SerialValue { get; set; }
    }
}
