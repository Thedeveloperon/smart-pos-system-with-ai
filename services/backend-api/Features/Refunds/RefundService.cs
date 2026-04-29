using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.CashSessions;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Refunds;

public sealed class RefundService(
    SmartPosDbContext dbContext,
    AuditLogService auditLogService,
    CashSessionService cashSessionService,
    StockMovementHelper stockMovementHelper)
{
    public async Task<RefundResponse> CreateRefundAsync(
        CreateRefundRequest request,
        CancellationToken cancellationToken)
    {
        if (request.SaleId == Guid.Empty)
        {
            throw new InvalidOperationException("sale_id is required.");
        }

        if (request.Items.Count == 0)
        {
            throw new InvalidOperationException("At least one refund item is required.");
        }

        var reason = string.IsNullOrWhiteSpace(request.Reason)
            ? "customer_request"
            : request.Reason.Trim();

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        var sale = await dbContext.Sales
            .Include(x => x.Items)
            .Include(x => x.Payments)
            .FirstOrDefaultAsync(x => x.Id == request.SaleId, cancellationToken)
            ?? throw new InvalidOperationException("Sale not found.");

        if (sale.Status is not (SaleStatus.Completed or SaleStatus.RefundedPartially))
        {
            throw new InvalidOperationException("Refund is only allowed for paid sales.");
        }

        var alreadyRefundedRows = await dbContext.RefundItems
            .AsNoTracking()
            .Where(x => x.Refund.SaleId == sale.Id)
            .Select(x => new { x.SaleItemId, x.Quantity })
            .ToListAsync(cancellationToken);

        var alreadyRefundedItems = alreadyRefundedRows
            .GroupBy(x => x.SaleItemId)
            .ToDictionary(x => x.Key, x => x.Sum(y => y.Quantity));

        var groupedRequestItems = request.Items
            .GroupBy(x => x.SaleItemId)
            .Select(x => new
            {
                SaleItemId = x.Key,
                Quantity = x.Sum(y => y.Quantity)
            })
            .ToList();

        if (groupedRequestItems.Any(x => x.SaleItemId == Guid.Empty || x.Quantity <= 0m))
        {
            throw new InvalidOperationException("Refund item quantities must be greater than zero.");
        }

        var saleItemsById = sale.Items.ToDictionary(x => x.Id, x => x);
        var refundItems = new List<RefundItem>();
        var subtotalAmount = 0m;
        var discountAmount = 0m;
        var taxAmount = 0m;
        var grandTotal = 0m;

        foreach (var requestItem in groupedRequestItems)
        {
            if (!saleItemsById.TryGetValue(requestItem.SaleItemId, out var saleItem))
            {
                throw new InvalidOperationException("sale_item_id is invalid for this sale.");
            }

            var alreadyRefundedQty = alreadyRefundedItems.GetValueOrDefault(saleItem.Id, 0m);
            var refundableQty = saleItem.Quantity - alreadyRefundedQty;
            if (requestItem.Quantity > refundableQty)
            {
                throw new InvalidOperationException(
                    $"Requested refund quantity for '{saleItem.ProductNameSnapshot}' exceeds refundable quantity.");
            }

            var quantityRatio = requestItem.Quantity / saleItem.Quantity;
            var lineSubtotal = RoundMoney(saleItem.UnitPrice * requestItem.Quantity);
            var lineDiscount = RoundMoney(saleItem.DiscountAmount * quantityRatio);
            var lineTax = RoundMoney(saleItem.TaxAmount * quantityRatio);
            var lineTotal = RoundMoney(lineSubtotal - lineDiscount + lineTax);

            subtotalAmount += lineSubtotal;
            discountAmount += lineDiscount;
            taxAmount += lineTax;
            grandTotal += lineTotal;

            refundItems.Add(new RefundItem
            {
                SaleItemId = saleItem.Id,
                ProductId = saleItem.ProductId,
                ProductNameSnapshot = saleItem.ProductNameSnapshot,
                Quantity = requestItem.Quantity,
                SubtotalAmount = lineSubtotal,
                DiscountAmount = lineDiscount,
                TaxAmount = lineTax,
                TotalAmount = lineTotal,
                Refund = null!,
                SaleItem = null!
            });
        }

        subtotalAmount = RoundMoney(subtotalAmount);
        discountAmount = RoundMoney(discountAmount);
        taxAmount = RoundMoney(taxAmount);
        grandTotal = RoundMoney(grandTotal);

        if (grandTotal <= 0m)
        {
            throw new InvalidOperationException("Calculated refund amount must be greater than zero.");
        }

        var originalPaymentTotals = sale.Payments
            .Where(x => !x.IsReversal)
            .GroupBy(x => x.Method)
            .ToDictionary(x => x.Key, x => RoundMoney(x.Sum(y => y.Amount)));

        var reversedPaymentTotals = sale.Payments
            .Where(x => x.IsReversal)
            .GroupBy(x => x.Method)
            .ToDictionary(x => x.Key, x => RoundMoney(x.Sum(y => y.Amount)));

        var paymentBalances = originalPaymentTotals
            .Select(x =>
            {
                var reversed = reversedPaymentTotals.GetValueOrDefault(x.Key, 0m);
                return new PaymentBalance(x.Key, RoundMoney(x.Value - reversed));
            })
            .Where(x => x.Amount > 0m)
            .ToList();

        if (paymentBalances.Count == 0)
        {
            throw new InvalidOperationException("No refundable payment balance found.");
        }

        var totalRefundableBalance = RoundMoney(paymentBalances.Sum(x => x.Amount));
        if (grandTotal > totalRefundableBalance)
        {
            throw new InvalidOperationException("Refund amount exceeds remaining paid amount.");
        }

        var reversalAllocations = AllocateReversals(paymentBalances, grandTotal);
        var refundNumber = CreateRefundNumber();
        var now = DateTimeOffset.UtcNow;
        var productStoreIds = await LoadProductStoreIdsAsync(
            refundItems.Select(x => x.ProductId),
            cancellationToken);
        var resolvedSaleStoreId = ResolveStoreId(productStoreIds.Values, "Refund");
        sale.StoreId = resolvedSaleStoreId;

        var refund = new Refund
        {
            StoreId = resolvedSaleStoreId,
            SaleId = sale.Id,
            RefundNumber = refundNumber,
            Reason = reason,
            SubtotalAmount = subtotalAmount,
            DiscountAmount = discountAmount,
            TaxAmount = taxAmount,
            GrandTotal = grandTotal,
            CreatedAtUtc = now,
            Sale = null!,
            Items = refundItems
        };
        dbContext.Refunds.Add(refund);

        foreach (var (method, amount) in reversalAllocations)
        {
            dbContext.Payments.Add(new Payment
            {
                SaleId = sale.Id,
                Method = method,
                Amount = amount,
                Currency = "LKR",
                ReferenceNumber = refundNumber,
                IsReversal = true,
                CreatedAtUtc = now,
                Sale = null!
            });
        }

        var cashReversalTotal = reversalAllocations.TryGetValue(PaymentMethod.Cash, out var cashReversal)
            ? cashReversal
            : 0m;
        if (cashReversalTotal > 0m)
        {
            await cashSessionService.RecordCashRefundAsync(
                cashReversalTotal,
                refund.Id,
                refund.RefundNumber,
                cancellationToken);
        }

        foreach (var refundItem in refundItems)
        {
            var product = await dbContext.Products
                .Include(x => x.Inventory)
                .Include(x => x.SerialNumbers)
                .Include(x => x.ProductBatches)
                .FirstOrDefaultAsync(x => x.Id == refundItem.ProductId, cancellationToken)
                ?? throw new InvalidOperationException("Product not found for refund item.");

            var inventoryRecord = product.Inventory;

            if (inventoryRecord is null)
            {
                var productStoreId = productStoreIds[refundItem.ProductId];
                inventoryRecord = new InventoryRecord
                {
                    ProductId = refundItem.ProductId,
                    StoreId = productStoreId,
                    QuantityOnHand = 0m,
                    ReorderLevel = 0m,
                    SafetyStock = 0m,
                    TargetStockLevel = 0m,
                    AllowNegativeStock = true,
                    Product = null!
                };
                dbContext.Inventory.Add(inventoryRecord);
                product.Inventory = inventoryRecord;
            }
            inventoryRecord.StoreId = productStoreIds[refundItem.ProductId];
            inventoryRecord.UpdatedAtUtc = now;

            await stockMovementHelper.RecordMovementAsync(
                storeId: productStoreIds[refundItem.ProductId],
                productId: refundItem.ProductId,
                type: StockMovementType.Refund,
                quantityChange: refundItem.Quantity,
                refType: StockMovementRef.Refund,
                refId: refund.Id,
                batchId: null,
                serialNumber: null,
                reason: reason,
                userId: null,
                cancellationToken);

            if (product.IsBatchTracked)
            {
                await RestoreBatchQuantitiesAsync(
                    product,
                    sale.Id,
                    refundItem.Quantity,
                    productStoreIds[refundItem.ProductId],
                    now,
                    reason,
                    cancellationToken);
            }

            if (product.IsSerialTracked)
            {
                if (refundItem.Quantity <= 0m || refundItem.Quantity != decimal.Truncate(refundItem.Quantity))
                {
                    throw new InvalidOperationException("Serial-tracked refund quantities must be whole numbers.");
                }

                var serialsToReturn = product.SerialNumbers
                    .Where(x => x.SaleId == sale.Id &&
                                x.Status == SerialNumberStatus.Sold)
                    .OrderBy(x => x.CreatedAtUtc)
                    .Take((int)refundItem.Quantity)
                    .ToList();

                if (serialsToReturn.Count != (int)refundItem.Quantity)
                {
                    throw new InvalidOperationException(
                        $"Not enough sold serial numbers exist to refund '{refundItem.ProductNameSnapshot}'.");
                }

                foreach (var serial in serialsToReturn)
                {
                    serial.Status = SerialNumberStatus.Returned;
                    serial.RefundId = refund.Id;
                    serial.UpdatedAtUtc = now;
                }
            }
        }

        dbContext.Ledger.Add(new LedgerEntry
        {
            StoreId = resolvedSaleStoreId,
            SaleId = sale.Id,
            EntryType = LedgerEntryType.Refund,
            Description = $"Refund {refundNumber} for {sale.SaleNumber} (tax reversed {taxAmount:0.00})",
            Debit = grandTotal,
            Credit = 0m,
            OccurredAtUtc = now
        });
        dbContext.Ledger.Add(new LedgerEntry
        {
            StoreId = resolvedSaleStoreId,
            SaleId = sale.Id,
            EntryType = LedgerEntryType.Reversal,
            Description = $"Payment reversal {refundNumber} for {sale.SaleNumber}",
            Debit = 0m,
            Credit = grandTotal,
            OccurredAtUtc = now
        });

        var previousSaleStatus = sale.Status;
        var fullyRefunded = sale.Items.All(saleItem =>
        {
            var previousQty = alreadyRefundedItems.GetValueOrDefault(saleItem.Id, 0m);
            var currentQty = refundItems
                .Where(x => x.SaleItemId == saleItem.Id)
                .Sum(x => x.Quantity);
            return (previousQty + currentQty) >= saleItem.Quantity;
        });

        var nextSaleStatus = fullyRefunded ? SaleStatus.RefundedFully : SaleStatus.RefundedPartially;
        sale.Status = nextSaleStatus;

        auditLogService.Queue(
            action: "refund_created",
            entityName: "sale",
            entityId: sale.Id.ToString(),
            before: new
            {
                sale_status = previousSaleStatus.ToString().ToLowerInvariant(),
                refundable_balance = totalRefundableBalance
            },
            after: new
            {
                refund_id = refund.Id,
                refund_number = refund.RefundNumber,
                refund_total = grandTotal,
                tax_reversed = taxAmount,
                payment_reversals = reversalAllocations.Select(x => new
                {
                    method = x.Key.ToString().ToLowerInvariant(),
                    amount = x.Value
                }),
                items = refundItems.Select(x => new
                {
                    sale_item_id = x.SaleItemId,
                    product_name = x.ProductNameSnapshot,
                    quantity = x.Quantity,
                    total_amount = x.TotalAmount
                }),
                sale_status = nextSaleStatus.ToString().ToLowerInvariant()
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return ToRefundResponse(refund, sale, reversalAllocations);
    }

    public async Task<SaleRefundSummaryResponse> GetSaleRefundSummaryAsync(
        Guid saleId,
        CancellationToken cancellationToken)
    {
        var sale = await dbContext.Sales
            .AsNoTracking()
            .Include(x => x.Items)
            .FirstOrDefaultAsync(x => x.Id == saleId, cancellationToken)
            ?? throw new InvalidOperationException("Sale not found.");

        var refunds = (await dbContext.Refunds
                .AsNoTracking()
                .Include(x => x.Items)
                .Where(x => x.SaleId == saleId)
                .ToListAsync(cancellationToken))
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToList();

        var refundedBySaleItem = refunds
            .SelectMany(x => x.Items)
            .GroupBy(x => x.SaleItemId)
            .ToDictionary(x => x.Key, x => x.Sum(y => y.Quantity));

        var refundedTotal = RoundMoney(refunds.Sum(x => x.GrandTotal));
        var refundedTaxTotal = RoundMoney(refunds.Sum(x => x.TaxAmount));

        return new SaleRefundSummaryResponse
        {
            SaleId = sale.Id,
            SaleNumber = sale.SaleNumber,
            SaleStatus = sale.Status.ToString().ToLowerInvariant(),
            RefundedTotal = refundedTotal,
            RefundedTaxTotal = refundedTaxTotal,
            RemainingRefundableTotal = RoundMoney(Math.Max(0m, sale.GrandTotal - refundedTotal)),
            Items = sale.Items.Select(x =>
            {
                var refundedQty = refundedBySaleItem.GetValueOrDefault(x.Id, 0m);
                return new SaleRefundItemStatus
                {
                    SaleItemId = x.Id,
                    ProductName = x.ProductNameSnapshot,
                    SoldQuantity = x.Quantity,
                    RefundedQuantity = refundedQty,
                    RefundableQuantity = Math.Max(0m, x.Quantity - refundedQty)
                };
            }).ToList(),
            Refunds = refunds.Select(x => new SaleRefundListItem
            {
                RefundId = x.Id,
                RefundNumber = x.RefundNumber,
                GrandTotal = x.GrandTotal,
                TaxAmount = x.TaxAmount,
                CreatedAt = x.CreatedAtUtc
            }).ToList()
        };
    }

    private static RefundResponse ToRefundResponse(
        Refund refund,
        Sale sale,
        IReadOnlyDictionary<PaymentMethod, decimal> reversalAllocations)
    {
        return new RefundResponse
        {
            RefundId = refund.Id,
            RefundNumber = refund.RefundNumber,
            SaleId = refund.SaleId,
            SaleStatus = sale.Status.ToString().ToLowerInvariant(),
            SubtotalAmount = refund.SubtotalAmount,
            DiscountAmount = refund.DiscountAmount,
            TaxAmount = refund.TaxAmount,
            GrandTotal = refund.GrandTotal,
            CreatedAt = refund.CreatedAtUtc,
            Items = refund.Items.Select(x => new RefundItemResponse
            {
                SaleItemId = x.SaleItemId,
                ProductId = x.ProductId,
                ProductName = x.ProductNameSnapshot,
                Quantity = x.Quantity,
                SubtotalAmount = x.SubtotalAmount,
                DiscountAmount = x.DiscountAmount,
                TaxAmount = x.TaxAmount,
                TotalAmount = x.TotalAmount
            }).ToList(),
            PaymentReversals = reversalAllocations
                .Select(x => new RefundPaymentReversalResponse
                {
                    Method = x.Key.ToString().ToLowerInvariant(),
                    Amount = x.Value
                })
                .ToList()
        };
    }

    private static IReadOnlyDictionary<PaymentMethod, decimal> AllocateReversals(
        IReadOnlyCollection<PaymentBalance> balances,
        decimal requestedAmount)
    {
        var balanceList = balances
            .Where(x => x.Amount > 0m)
            .ToList();

        var requestedCents = ToCents(requestedAmount);
        var totalCents = balanceList.Sum(x => ToCents(x.Amount));
        if (requestedCents > totalCents)
        {
            throw new InvalidOperationException("Refund exceeds remaining payment balances.");
        }

        var allocations = new Dictionary<PaymentMethod, int>();
        var remainders = new List<(PaymentMethod Method, decimal Fraction)>();
        var allocatedTotal = 0;

        foreach (var balance in balanceList)
        {
            var balanceCents = ToCents(balance.Amount);
            var rawShare = (decimal)requestedCents * balanceCents / totalCents;
            var whole = (int)Math.Floor(rawShare);
            var capped = Math.Min(whole, balanceCents);
            allocations[balance.Method] = capped;
            allocatedTotal += capped;
            remainders.Add((balance.Method, rawShare - whole));
        }

        var leftover = requestedCents - allocatedTotal;
        foreach (var remainder in remainders
                     .OrderByDescending(x => x.Fraction)
                     .ThenBy(x => x.Method)
                     .ToList())
        {
            if (leftover <= 0)
            {
                break;
            }

            var balanceCents = ToCents(balanceList.First(x => x.Method == remainder.Method).Amount);
            var current = allocations[remainder.Method];
            if (current >= balanceCents)
            {
                continue;
            }

            allocations[remainder.Method] = current + 1;
            leftover -= 1;
        }

        if (leftover != 0)
        {
            throw new InvalidOperationException("Unable to allocate refund reversals.");
        }

        return allocations
            .Where(x => x.Value > 0)
            .ToDictionary(
                x => x.Key,
                x => x.Value / 100m);
    }

    private static string CreateRefundNumber()
    {
        return $"REF-{DateTime.UtcNow:yyyyMMddHHmmss}-{Random.Shared.Next(100, 999)}";
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

    private async Task RestoreBatchQuantitiesAsync(
        Product product,
        Guid saleId,
        decimal refundQuantity,
        Guid? storeId,
        DateTimeOffset now,
        string reason,
        CancellationToken cancellationToken)
    {
        var batchMovements = await dbContext.StockMovements
            .AsNoTracking()
            .Where(x => x.ReferenceType == StockMovementRef.Sale &&
                        x.ReferenceId == saleId &&
                        x.ProductId == product.Id &&
                        x.BatchId.HasValue &&
                        (!storeId.HasValue || x.StoreId == storeId.Value))
            .OrderBy(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var remainingToRestore = decimal.Round(refundQuantity, 3, MidpointRounding.AwayFromZero);
        if (remainingToRestore <= 0m)
        {
            return;
        }

        foreach (var movement in batchMovements)
        {
            if (remainingToRestore <= 0m)
            {
                break;
            }

            var batch = await dbContext.ProductBatches
                .FirstOrDefaultAsync(x => x.Id == movement.BatchId && (!storeId.HasValue || x.StoreId == storeId.Value), cancellationToken);
            if (batch is null)
            {
                throw new InvalidOperationException("Batch not found for refund restoration.");
            }

            var restored = Math.Min(decimal.Round(Math.Abs(movement.QuantityChange), 3, MidpointRounding.AwayFromZero), remainingToRestore);
            if (restored <= 0m)
            {
                continue;
            }

            batch.RemainingQuantity = decimal.Round(batch.RemainingQuantity + restored, 3, MidpointRounding.AwayFromZero);
            batch.UpdatedAtUtc = now;

            await stockMovementHelper.RecordMovementAsync(
                storeId: storeId,
                productId: product.Id,
                type: StockMovementType.Refund,
                quantityChange: restored,
                refType: StockMovementRef.Refund,
                refId: saleId,
                batchId: batch.Id,
                serialNumber: null,
                reason: reason,
                userId: null,
                cancellationToken: cancellationToken,
                updateInventory: false);

            remainingToRestore = decimal.Round(remainingToRestore - restored, 3, MidpointRounding.AwayFromZero);
        }

        if (remainingToRestore > 0m)
        {
            throw new InvalidOperationException("Insufficient batch quantity available to restore refund.");
        }
    }

    private static decimal RoundMoney(decimal amount)
    {
        return decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
    }

    private static int ToCents(decimal amount)
    {
        return (int)decimal.Round(amount * 100m, 0, MidpointRounding.AwayFromZero);
    }

    private sealed record PaymentBalance(PaymentMethod Method, decimal Amount);
}
