using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Reports;

public sealed class ReportService(
    SmartPosDbContext dbContext,
    ILicensingAlertMonitor alertMonitor)
{
    public async Task<DailySalesReportResponse> GetDailySalesReportAsync(
        DateOnly? fromDate,
        DateOnly? toDate,
        CancellationToken cancellationToken)
    {
        var range = NormalizeDateRange(fromDate, toDate, defaultDays: 7);

        var sales = await dbContext.Sales
            .AsNoTracking()
            .ToListAsync(cancellationToken);
        var refunds = await dbContext.Refunds
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var rows = new Dictionary<DateOnly, DailySalesReportRow>();
        for (var date = range.FromDate; date <= range.ToDate; date = date.AddDays(1))
        {
            rows[date] = new DailySalesReportRow
            {
                Date = date
            };
        }

        foreach (var sale in sales.Where(x => IsFinancialSaleStatus(x.Status) && IsInRange(GetSaleTimestamp(x), range)))
        {
            var date = DateOnly.FromDateTime(GetSaleTimestamp(sale).UtcDateTime);
            var row = rows[date];
            row.SalesCount += 1;
            row.GrossSales = RoundMoney(row.GrossSales + sale.GrandTotal);
        }

        foreach (var refund in refunds.Where(x => IsInRange(x.CreatedAtUtc, range)))
        {
            var date = DateOnly.FromDateTime(refund.CreatedAtUtc.UtcDateTime);
            var row = rows[date];
            row.RefundCount += 1;
            row.RefundedTotal = RoundMoney(row.RefundedTotal + refund.GrandTotal);
        }

        var items = rows.Values
            .OrderBy(x => x.Date)
            .ToList();
        foreach (var item in items)
        {
            item.NetSales = RoundMoney(item.GrossSales - item.RefundedTotal);
        }

        return new DailySalesReportResponse
        {
            FromDate = range.FromDate,
            ToDate = range.ToDate,
            SalesCount = items.Sum(x => x.SalesCount),
            RefundCount = items.Sum(x => x.RefundCount),
            GrossSalesTotal = RoundMoney(items.Sum(x => x.GrossSales)),
            RefundedTotal = RoundMoney(items.Sum(x => x.RefundedTotal)),
            NetSalesTotal = RoundMoney(items.Sum(x => x.NetSales)),
            Items = items
        };
    }

    public async Task<TransactionsReportResponse> GetTransactionsReportAsync(
        DateOnly? fromDate,
        DateOnly? toDate,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 200);
        var range = NormalizeDateRange(fromDate, toDate, defaultDays: 7);

        var sales = await dbContext.Sales
            .AsNoTracking()
            .Include(x => x.Items)
            .Include(x => x.Payments)
            .ToListAsync(cancellationToken);

        var cashierIds = sales
            .Select(x => x.CreatedByUserId)
            .Where(x => x.HasValue)
            .Select(x => x!.Value)
            .Distinct()
            .ToArray();

        var cashiersById = cashierIds.Length == 0
            ? new Dictionary<Guid, CashierLookupRow>()
            : await dbContext.Users
                .AsNoTracking()
                .Where(x => cashierIds.Contains(x.Id))
                .Select(x => new CashierLookupRow(x.Id, x.Username, x.FullName))
                .ToDictionaryAsync(x => x.UserId, cancellationToken);

        var allItems = sales
            .Where(x => IsFinancialSaleStatus(x.Status) && IsInRange(GetSaleTimestamp(x), range))
            .Select(x =>
            {
                cashiersById.TryGetValue(x.CreatedByUserId ?? Guid.Empty, out var cashier);
                var paidTotal = RoundMoney(x.Payments.Where(y => !y.IsReversal).Sum(y => y.Amount));
                var reversedTotal = RoundMoney(x.Payments.Where(y => y.IsReversal).Sum(y => y.Amount));
                return new TransactionReportRow
                {
                    SaleId = x.Id,
                    SaleNumber = x.SaleNumber,
                    Status = x.Status.ToString().ToLowerInvariant(),
                    Timestamp = GetSaleTimestamp(x),
                    CreatedByUserId = x.CreatedByUserId,
                    CashierUsername = cashier?.Username,
                    CashierFullName = cashier?.FullName,
                    ItemsCount = x.Items.Count,
                    GrandTotal = x.GrandTotal,
                    PaidTotal = paidTotal,
                    ReversedTotal = reversedTotal,
                    NetCollected = RoundMoney(paidTotal - reversedTotal),
                    CustomPayoutUsed = x.CustomPayoutUsed,
                    CashShortAmount = x.CashShortAmount,
                    PaymentBreakdown = BuildPaymentBreakdown(x.Payments
                        .Select(y => new PaymentSnapshot(y.Method, y.Amount, y.IsReversal)))
                };
            })
            .OrderByDescending(x => x.Timestamp)
            .ToList();

        return new TransactionsReportResponse
        {
            FromDate = range.FromDate,
            ToDate = range.ToDate,
            Take = normalizedTake,
            TransactionCount = allItems.Count,
            GrossTotal = RoundMoney(allItems.Sum(x => x.GrandTotal)),
            ReversedTotal = RoundMoney(allItems.Sum(x => x.ReversedTotal)),
            NetCollectedTotal = RoundMoney(allItems.Sum(x => x.NetCollected)),
            Items = allItems.Take(normalizedTake).ToList()
        };
    }

    public async Task<PaymentBreakdownReportResponse> GetPaymentBreakdownReportAsync(
        DateOnly? fromDate,
        DateOnly? toDate,
        CancellationToken cancellationToken)
    {
        var range = NormalizeDateRange(fromDate, toDate, defaultDays: 7);

        var payments = await dbContext.Payments
            .AsNoTracking()
            .Include(x => x.Sale)
            .ToListAsync(cancellationToken);

        var breakdown = BuildPaymentBreakdown(
            payments
                .Where(x => x.Sale.Status != SaleStatus.Held && IsInRange(x.CreatedAtUtc, range))
                .Select(x => new PaymentSnapshot(x.Method, x.Amount, x.IsReversal)));

        return new PaymentBreakdownReportResponse
        {
            FromDate = range.FromDate,
            ToDate = range.ToDate,
            PaidTotal = RoundMoney(breakdown.Sum(x => x.PaidAmount)),
            ReversedTotal = RoundMoney(breakdown.Sum(x => x.ReversedAmount)),
            NetTotal = RoundMoney(breakdown.Sum(x => x.NetAmount)),
            Items = breakdown
        };
    }

    public async Task<TopItemsReportResponse> GetTopItemsReportAsync(
        DateOnly? fromDate,
        DateOnly? toDate,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 50);
        var range = NormalizeDateRange(fromDate, toDate, defaultDays: 7);

        var sales = await dbContext.Sales
            .AsNoTracking()
            .Include(x => x.Items)
            .ToListAsync(cancellationToken);
        var refunds = await dbContext.Refunds
            .AsNoTracking()
            .Include(x => x.Items)
            .ToListAsync(cancellationToken);

        var soldByProduct = sales
            .Where(x => IsFinancialSaleStatus(x.Status) && IsInRange(GetSaleTimestamp(x), range))
            .SelectMany(x => x.Items)
            .GroupBy(x => x.ProductId)
            .ToDictionary(
                x => x.Key,
                x => new ItemAgg(
                    ProductName: x.Select(y => y.ProductNameSnapshot).FirstOrDefault() ?? string.Empty,
                    Quantity: x.Sum(y => y.Quantity),
                    Amount: x.Sum(y => y.LineTotal)));

        var refundedByProduct = refunds
            .Where(x => IsInRange(x.CreatedAtUtc, range))
            .SelectMany(x => x.Items)
            .GroupBy(x => x.ProductId)
            .ToDictionary(
                x => x.Key,
                x => new ItemAgg(
                    ProductName: x.Select(y => y.ProductNameSnapshot).FirstOrDefault() ?? string.Empty,
                    Quantity: x.Sum(y => y.Quantity),
                    Amount: x.Sum(y => y.TotalAmount)));

        var allProductIds = soldByProduct.Keys
            .Union(refundedByProduct.Keys)
            .ToList();

        var items = allProductIds
            .Select(productId =>
            {
                var sold = soldByProduct.GetValueOrDefault(productId, ItemAgg.Empty);
                var refunded = refundedByProduct.GetValueOrDefault(productId, ItemAgg.Empty);

                var soldQty = RoundQuantity(sold.Quantity);
                var refundedQty = RoundQuantity(refunded.Quantity);
                var netQty = RoundQuantity(soldQty - refundedQty);
                var netSales = RoundMoney(sold.Amount - refunded.Amount);
                var name = string.IsNullOrWhiteSpace(sold.ProductName)
                    ? refunded.ProductName
                    : sold.ProductName;

                return new TopItemReportRow
                {
                    ProductId = productId,
                    ProductName = name,
                    SoldQuantity = soldQty,
                    RefundedQuantity = refundedQty,
                    NetQuantity = netQty,
                    NetSales = netSales
                };
            })
            .Where(x => x.NetQuantity > 0m)
            .OrderByDescending(x => x.NetQuantity)
            .ThenByDescending(x => x.NetSales)
            .Take(normalizedTake)
            .ToList();

        return new TopItemsReportResponse
        {
            FromDate = range.FromDate,
            ToDate = range.ToDate,
            Take = normalizedTake,
            Items = items
        };
    }

    public async Task<WorstItemsReportResponse> GetWorstItemsReportAsync(
        DateOnly? fromDate,
        DateOnly? toDate,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 50);
        var range = NormalizeDateRange(fromDate, toDate, defaultDays: 7);

        var sales = await dbContext.Sales
            .AsNoTracking()
            .Include(x => x.Items)
            .ToListAsync(cancellationToken);
        var refunds = await dbContext.Refunds
            .AsNoTracking()
            .Include(x => x.Items)
            .ToListAsync(cancellationToken);

        var soldByProduct = sales
            .Where(x => IsFinancialSaleStatus(x.Status) && IsInRange(GetSaleTimestamp(x), range))
            .SelectMany(x => x.Items)
            .GroupBy(x => x.ProductId)
            .ToDictionary(
                x => x.Key,
                x => new ItemAgg(
                    ProductName: x.Select(y => y.ProductNameSnapshot).FirstOrDefault() ?? string.Empty,
                    Quantity: x.Sum(y => y.Quantity),
                    Amount: x.Sum(y => y.LineTotal)));

        var refundedByProduct = refunds
            .Where(x => IsInRange(x.CreatedAtUtc, range))
            .SelectMany(x => x.Items)
            .GroupBy(x => x.ProductId)
            .ToDictionary(
                x => x.Key,
                x => new ItemAgg(
                    ProductName: x.Select(y => y.ProductNameSnapshot).FirstOrDefault() ?? string.Empty,
                    Quantity: x.Sum(y => y.Quantity),
                    Amount: x.Sum(y => y.TotalAmount)));

        var items = soldByProduct.Keys
            .Select(productId =>
            {
                var sold = soldByProduct.GetValueOrDefault(productId, ItemAgg.Empty);
                var refunded = refundedByProduct.GetValueOrDefault(productId, ItemAgg.Empty);

                var soldQty = RoundQuantity(sold.Quantity);
                var refundedQty = RoundQuantity(refunded.Quantity);
                var netQty = RoundQuantity(soldQty - refundedQty);
                var netSales = RoundMoney(sold.Amount - refunded.Amount);
                var name = string.IsNullOrWhiteSpace(sold.ProductName)
                    ? refunded.ProductName
                    : sold.ProductName;

                return new WorstItemReportRow
                {
                    ProductId = productId,
                    ProductName = name,
                    SoldQuantity = soldQty,
                    RefundedQuantity = refundedQty,
                    NetQuantity = netQty,
                    NetSales = netSales
                };
            })
            .OrderBy(x => x.NetQuantity)
            .ThenBy(x => x.NetSales)
            .Take(normalizedTake)
            .ToList();

        return new WorstItemsReportResponse
        {
            FromDate = range.FromDate,
            ToDate = range.ToDate,
            Take = normalizedTake,
            Items = items
        };
    }

    public async Task<MonthlySalesForecastReportResponse> GetMonthlySalesForecastReportAsync(
        int months,
        CancellationToken cancellationToken)
    {
        var normalizedMonths = Math.Clamp(months, 3, 24);
        var currentMonthStart = new DateOnly(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
        var fromMonth = currentMonthStart.AddMonths(-(normalizedMonths - 1));
        var toMonth = currentMonthStart;
        var range = NormalizeDateRange(fromMonth, toMonth.AddMonths(1).AddDays(-1), defaultDays: 30);

        var sales = await dbContext.Sales
            .AsNoTracking()
            .ToListAsync(cancellationToken);
        var refunds = await dbContext.Refunds
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var monthRows = new Dictionary<string, MonthlySalesForecastRow>(StringComparer.Ordinal);
        for (var monthCursor = fromMonth; monthCursor <= toMonth; monthCursor = monthCursor.AddMonths(1))
        {
            var monthKey = $"{monthCursor:yyyy-MM}";
            monthRows[monthKey] = new MonthlySalesForecastRow
            {
                Month = monthKey
            };
        }

        foreach (var sale in sales.Where(x => IsFinancialSaleStatus(x.Status) && IsInRange(GetSaleTimestamp(x), range)))
        {
            var key = $"{DateOnly.FromDateTime(GetSaleTimestamp(sale).UtcDateTime):yyyy-MM}";
            if (!monthRows.TryGetValue(key, out var row))
            {
                continue;
            }

            row.SalesCount += 1;
            row.NetSales = RoundMoney(row.NetSales + sale.GrandTotal);
        }

        foreach (var refund in refunds.Where(x => IsInRange(x.CreatedAtUtc, range)))
        {
            var key = $"{DateOnly.FromDateTime(refund.CreatedAtUtc.UtcDateTime):yyyy-MM}";
            if (!monthRows.TryGetValue(key, out var row))
            {
                continue;
            }

            row.RefundCount += 1;
            row.NetSales = RoundMoney(row.NetSales - refund.GrandTotal);
        }

        var rows = monthRows.Values
            .OrderBy(x => x.Month, StringComparer.Ordinal)
            .ToList();

        var average = rows.Count == 0
            ? 0m
            : RoundMoney(rows.Average(x => x.NetSales));
        var firstNetSales = rows.FirstOrDefault()?.NetSales ?? 0m;
        var lastNetSales = rows.LastOrDefault()?.NetSales ?? 0m;
        var slope = rows.Count <= 1
            ? 0m
            : RoundMoney((lastNetSales - firstNetSales) / (rows.Count - 1));
        var forecast = RoundMoney(lastNetSales + slope);
        var trendPercent = firstNetSales == 0m
            ? (lastNetSales == 0m ? 0m : 100m)
            : RoundMoney(((lastNetSales - firstNetSales) / firstNetSales) * 100m);
        var confidence = ResolveForecastConfidence(rows, normalizedMonths);

        return new MonthlySalesForecastReportResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            Months = normalizedMonths,
            AverageMonthlyNetSales = average,
            TrendPercent = trendPercent,
            ForecastNextMonthNetSales = forecast,
            Confidence = confidence,
            Items = rows
        };
    }

    public async Task<LowStockReportResponse> GetLowStockReportAsync(
        int take,
        decimal threshold,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 200);
        var normalizedThreshold = Math.Max(0m, threshold);

        var products = await dbContext.Products
            .AsNoTracking()
            .Include(x => x.Inventory)
            .Where(x => x.IsActive)
            .ToListAsync(cancellationToken);

        var items = products
            .Select(x =>
            {
                var quantityOnHand = RoundQuantity(x.Inventory?.QuantityOnHand ?? 0m);
                var reorderLevel = RoundQuantity(x.Inventory?.ReorderLevel ?? 0m);
                var alertLevel = RoundQuantity(Math.Max(reorderLevel, normalizedThreshold));
                var deficit = RoundQuantity(Math.Max(0m, alertLevel - quantityOnHand));

                return new LowStockReportRow
                {
                    ProductId = x.Id,
                    ProductName = x.Name,
                    Sku = x.Sku,
                    Barcode = x.Barcode,
                    QuantityOnHand = quantityOnHand,
                    ReorderLevel = reorderLevel,
                    AlertLevel = alertLevel,
                    Deficit = deficit
                };
            })
            .Where(x => x.QuantityOnHand <= x.AlertLevel)
            .OrderBy(x => x.QuantityOnHand)
            .ThenByDescending(x => x.Deficit)
            .Take(normalizedTake)
            .ToList();

        return new LowStockReportResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            Threshold = normalizedThreshold,
            Take = normalizedTake,
            Items = items
        };
    }

    public async Task<SupportTriageReportResponse> GetSupportTriageReportAsync(
        int windowMinutes,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var normalizedWindowMinutes = Math.Clamp(windowMinutes, 5, 180);
        var windowStart = now.AddMinutes(-normalizedWindowMinutes);

        var provisionedDevices = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .ToListAsync(cancellationToken);
        var subscriptions = await dbContext.Subscriptions
            .AsNoTracking()
            .ToListAsync(cancellationToken);
        var licenses = await dbContext.Licenses
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var latestSubscriptionsByShop = subscriptions
            .GroupBy(x => x.ShopId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderByDescending(x => x.UpdatedAtUtc ?? x.CreatedAtUtc)
                    .First());

        var latestLicenseByDevice = licenses
            .GroupBy(x => x.ProvisionedDeviceId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderByDescending(x => x.IssuedAtUtc)
                    .First());

        var deviceSummary = new SupportDeviceStateSummary();
        var shopSeverities = new Dictionary<Guid, int>();
        var shopsWithMissingLicense = new HashSet<Guid>();

        foreach (var device in provisionedDevices)
        {
            latestSubscriptionsByShop.TryGetValue(device.ShopId, out var subscription);
            latestLicenseByDevice.TryGetValue(device.Id, out var license);

            var state = ResolveSupportState(device, license, subscription, now);
            switch (state)
            {
                case SupportLicenseState.Active:
                    deviceSummary.ActiveDevices += 1;
                    break;
                case SupportLicenseState.Grace:
                    deviceSummary.GraceDevices += 1;
                    break;
                case SupportLicenseState.Suspended:
                    deviceSummary.SuspendedDevices += 1;
                    break;
                case SupportLicenseState.Revoked:
                    deviceSummary.RevokedDevices += 1;
                    break;
                case SupportLicenseState.MissingLicense:
                    deviceSummary.DevicesWithoutLicense += 1;
                    shopsWithMissingLicense.Add(device.ShopId);
                    break;
            }

            var severity = state switch
            {
                SupportLicenseState.Active => 1,
                SupportLicenseState.Grace => 2,
                SupportLicenseState.Suspended => 3,
                SupportLicenseState.MissingLicense => 3,
                SupportLicenseState.Revoked => 4,
                _ => 1
            };

            if (!shopSeverities.TryGetValue(device.ShopId, out var current) || severity > current)
            {
                shopSeverities[device.ShopId] = severity;
            }
        }

        var shopSummary = new SupportShopStateSummary
        {
            ActiveShops = shopSeverities.Values.Count(x => x == 1),
            GraceShops = shopSeverities.Values.Count(x => x == 2),
            SuspendedShops = shopSeverities.Values.Count(x => x == 3),
            RevokedShops = shopSeverities.Values.Count(x => x == 4),
            ShopsWithMissingLicense = shopsWithMissingLicense.Count
        };

        var allAuditLogs = await dbContext.LicenseAuditLogs
            .AsNoTracking()
            .ToListAsync(cancellationToken);
        List<AuditLog> authSecurityLogsInWindow;
        if (dbContext.Database.IsSqlite())
        {
            authSecurityLogsInWindow = (await dbContext.AuditLogs
                    .AsNoTracking()
                    .Where(x => x.Action == "auth_anomaly_impossible_travel" ||
                                x.Action == "auth_anomaly_concurrent_devices")
                    .ToListAsync(cancellationToken))
                .Where(x => x.CreatedAtUtc >= windowStart)
                .ToList();
        }
        else
        {
            authSecurityLogsInWindow = await dbContext.AuditLogs
                .AsNoTracking()
                .Where(x => x.CreatedAtUtc >= windowStart &&
                            (x.Action == "auth_anomaly_impossible_travel" ||
                             x.Action == "auth_anomaly_concurrent_devices"))
                .ToListAsync(cancellationToken);
        }

        var activityLogs = allAuditLogs
            .Where(x => x.CreatedAtUtc >= windowStart)
            .ToList();

        var activitySummary = new SupportLicenseActivitySummary
        {
            ActivationsInWindow = activityLogs.Count(x => x.Action == "provision_activate"),
            DeactivationsInWindow = activityLogs.Count(x => x.Action == "provision_deactivate"),
            HeartbeatsInWindow = activityLogs.Count(x => x.Action == "license_heartbeat")
        };
        var sensitiveActionProofFailureLogs = activityLogs
            .Where(x => x.Action == "sensitive_action_proof_failed")
            .ToList();
        var devicesWithUnusualSourceChanges = CountDevicesWithUnusualSourceChanges(activityLogs);

        var recentAuditLogs = allAuditLogs
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(12)
            .ToList();

        var alertSnapshot = alertMonitor.GetSnapshot(normalizedWindowMinutes);
        var authImpossibleTravelSignals = authSecurityLogsInWindow
            .Count(x => x.Action == "auth_anomaly_impossible_travel");
        var authConcurrentDeviceSignals = authSecurityLogsInWindow
            .Count(x => x.Action == "auth_anomaly_concurrent_devices");

        return new SupportTriageReportResponse
        {
            GeneratedAt = now,
            WindowMinutes = normalizedWindowMinutes,
            Devices = deviceSummary,
            Shops = shopSummary,
            Activity = activitySummary,
            Alerts = new SupportLicenseAlertSummary
            {
                ValidationFailuresInWindow = alertSnapshot.ValidationFailureCount,
                WebhookFailuresInWindow = alertSnapshot.WebhookFailureCount,
                SecurityAnomaliesInWindow = alertSnapshot.SecurityAnomalyCount,
                AuthImpossibleTravelSignalsInWindow = authImpossibleTravelSignals,
                AuthConcurrentDeviceSignalsInWindow = authConcurrentDeviceSignals,
                SensitiveActionProofFailuresInWindow = sensitiveActionProofFailureLogs.Count,
                DevicesWithUnusualSourceChangesInWindow = devicesWithUnusualSourceChanges,
                TopValidationFailures = alertSnapshot.TopValidationFailures
                    .Select(x => new SupportAlertBreakdownRow
                    {
                        Reason = x.Reason,
                        Count = x.Count
                    })
                    .ToList(),
                TopWebhookFailures = alertSnapshot.TopWebhookFailures
                    .Select(x => new SupportAlertBreakdownRow
                    {
                        Reason = x.Reason,
                        Count = x.Count
                    })
                    .ToList(),
                TopSecurityAnomalies = alertSnapshot.TopSecurityAnomalies
                    .Select(x => new SupportAlertBreakdownRow
                    {
                        Reason = x.Reason,
                        Count = x.Count
                    })
                    .ToList(),
                TopSensitiveActionFailureSources = BuildTopSensitiveActionFailureSources(sensitiveActionProofFailureLogs),
                LastValidationAlertAt = alertSnapshot.LastValidationAlertAtUtc,
                LastWebhookAlertAt = alertSnapshot.LastWebhookAlertAtUtc,
                LastSecurityAlertAt = alertSnapshot.LastSecurityAlertAtUtc
            },
            RecentAuditEvents = recentAuditLogs
                .Select(x => new SupportLicenseAuditEventRow
                {
                    Timestamp = x.CreatedAtUtc,
                    Action = x.Action,
                    Actor = x.Actor,
                    DeviceCode = ExtractDeviceCode(x.MetadataJson),
                    Reason = x.Reason,
                    SourceIp = ExtractMetadataString(x.MetadataJson, "source_ip"),
                    SourceIpPrefix = ExtractMetadataString(x.MetadataJson, "source_ip_prefix"),
                    SourceUserAgentFamily = ExtractMetadataString(x.MetadataJson, "source_user_agent_family"),
                    SourceFingerprint = ExtractMetadataString(x.MetadataJson, "source_fingerprint")
                })
                .ToList()
        };
    }

    private static List<ReportPaymentBreakdownRow> BuildPaymentBreakdown(IEnumerable<PaymentSnapshot> payments)
    {
        return payments
            .GroupBy(x => x.Method)
            .Select(x =>
            {
                var paidAmount = RoundMoney(x.Where(y => !y.IsReversal).Sum(y => y.Amount));
                var reversedAmount = RoundMoney(x.Where(y => y.IsReversal).Sum(y => y.Amount));
                return new ReportPaymentBreakdownRow
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

    private static bool IsFinancialSaleStatus(SaleStatus status)
    {
        return status is SaleStatus.Completed or SaleStatus.RefundedPartially or SaleStatus.RefundedFully;
    }

    private static DateTimeOffset GetSaleTimestamp(Sale sale)
    {
        return sale.CompletedAtUtc ?? sale.CreatedAtUtc;
    }

    private static bool IsInRange(DateTimeOffset value, DateRange range)
    {
        return value >= range.StartUtc && value < range.EndUtcExclusive;
    }

    private static DateRange NormalizeDateRange(DateOnly? fromDate, DateOnly? toDate, int defaultDays)
    {
        var utcToday = DateOnly.FromDateTime(DateTime.UtcNow);
        var normalizedTo = toDate ?? utcToday;
        var normalizedFrom = fromDate ?? normalizedTo.AddDays(-(defaultDays - 1));

        if (normalizedFrom > normalizedTo)
        {
            throw new InvalidOperationException("from date must be less than or equal to to date.");
        }

        var startUtc = new DateTimeOffset(normalizedFrom.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var endUtcExclusive = new DateTimeOffset(
            normalizedTo.AddDays(1).ToDateTime(TimeOnly.MinValue),
            TimeSpan.Zero);

        return new DateRange(normalizedFrom, normalizedTo, startUtc, endUtcExclusive);
    }

    private static decimal RoundMoney(decimal value)
    {
        return decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static decimal RoundQuantity(decimal value)
    {
        return decimal.Round(value, 3, MidpointRounding.AwayFromZero);
    }

    private static string ResolveForecastConfidence(
        IReadOnlyCollection<MonthlySalesForecastRow> rows,
        int months)
    {
        if (rows.Count < 4 || months < 4)
        {
            return "low";
        }

        var monthsWithSales = rows.Count(x => x.SalesCount > 0);
        if (monthsWithSales < Math.Max(2, months / 2))
        {
            return "low";
        }

        if (monthsWithSales < months)
        {
            return "medium";
        }

        return "high";
    }

    private static SupportLicenseState ResolveSupportState(
        ProvisionedDevice device,
        LicenseRecord? license,
        Subscription? subscription,
        DateTimeOffset now)
    {
        if (device.Status == ProvisionedDeviceStatus.Revoked)
        {
            return SupportLicenseState.Revoked;
        }

        if (license is null)
        {
            return SupportLicenseState.MissingLicense;
        }

        if (license.Status == LicenseRecordStatus.Revoked ||
            (license.RevokedAtUtc.HasValue && now >= license.RevokedAtUtc.Value))
        {
            return SupportLicenseState.Revoked;
        }

        var subscriptionStatus = subscription?.Status;
        if (subscription is { } && subscriptionStatus is SubscriptionStatus.Trialing or SubscriptionStatus.Active &&
            subscription.PeriodEndUtc < now)
        {
            subscriptionStatus = SubscriptionStatus.PastDue;
        }

        if (subscriptionStatus == SubscriptionStatus.Canceled)
        {
            return SupportLicenseState.Revoked;
        }

        if (subscription is null || subscriptionStatus == SubscriptionStatus.PastDue)
        {
            return now <= license.GraceUntil ? SupportLicenseState.Grace : SupportLicenseState.Suspended;
        }

        if (now <= license.ValidUntil)
        {
            return SupportLicenseState.Active;
        }

        if (now <= license.GraceUntil)
        {
            return SupportLicenseState.Grace;
        }

        return SupportLicenseState.Suspended;
    }

    private static string? ExtractDeviceCode(string? metadataJson)
    {
        if (string.IsNullOrWhiteSpace(metadataJson))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(metadataJson);
            if (document.RootElement.TryGetProperty("device_code", out var deviceCode))
            {
                var value = deviceCode.GetString();
                return string.IsNullOrWhiteSpace(value) ? null : value;
            }
        }
        catch (JsonException)
        {
            return null;
        }

        return null;
    }

    private static string? ExtractMetadataString(string? metadataJson, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(metadataJson) || string.IsNullOrWhiteSpace(propertyName))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(metadataJson);
            if (!document.RootElement.TryGetProperty(propertyName, out var value))
            {
                return null;
            }

            var stringValue = value.GetString();
            return string.IsNullOrWhiteSpace(stringValue) ? null : stringValue;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static int CountDevicesWithUnusualSourceChanges(IEnumerable<LicenseAuditLog> logs)
    {
        return logs
            .Select(log => new
            {
                DeviceKey = ResolveDeviceSourceKey(log),
                SourceKey = ResolveSourceKey(log)
            })
            .Where(x => !string.IsNullOrWhiteSpace(x.DeviceKey) && !string.IsNullOrWhiteSpace(x.SourceKey))
            .GroupBy(x => x.DeviceKey!)
            .Count(group => group
                .Select(x => x.SourceKey!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(2)
                .Count() > 1);
    }

    private static List<SupportAlertBreakdownRow> BuildTopSensitiveActionFailureSources(
        IEnumerable<LicenseAuditLog> failureLogs)
    {
        return failureLogs
            .Select(log => ResolveSourceDisplayLabel(log))
            .GroupBy(label => label, StringComparer.OrdinalIgnoreCase)
            .Select(group => new SupportAlertBreakdownRow
            {
                Reason = group.Key,
                Count = group.Count()
            })
            .OrderByDescending(x => x.Count)
            .ThenBy(x => x.Reason)
            .Take(5)
            .ToList();
    }

    private static string? ResolveDeviceSourceKey(LicenseAuditLog log)
    {
        if (log.ProvisionedDeviceId.HasValue)
        {
            return $"id:{log.ProvisionedDeviceId.Value:N}";
        }

        var metadataDeviceCode = ExtractDeviceCode(log.MetadataJson);
        return string.IsNullOrWhiteSpace(metadataDeviceCode)
            ? null
            : $"code:{metadataDeviceCode.ToLowerInvariant()}";
    }

    private static string? ResolveSourceKey(LicenseAuditLog log)
    {
        var fingerprint = ExtractMetadataString(log.MetadataJson, "source_fingerprint");
        if (!string.IsNullOrWhiteSpace(fingerprint))
        {
            return $"fingerprint:{fingerprint.ToLowerInvariant()}";
        }

        var ipPrefix = ExtractMetadataString(log.MetadataJson, "source_ip_prefix");
        var userAgentFamily = ExtractMetadataString(log.MetadataJson, "source_user_agent_family");
        if (!string.IsNullOrWhiteSpace(ipPrefix) || !string.IsNullOrWhiteSpace(userAgentFamily))
        {
            return $"fallback:{(ipPrefix ?? "unknown").ToLowerInvariant()}|{(userAgentFamily ?? "unknown").ToLowerInvariant()}";
        }

        return null;
    }

    private static string ResolveSourceDisplayLabel(LicenseAuditLog log)
    {
        var sourceFingerprint = ExtractMetadataString(log.MetadataJson, "source_fingerprint");
        if (!string.IsNullOrWhiteSpace(sourceFingerprint))
        {
            return $"fingerprint:{sourceFingerprint}";
        }

        var ipPrefix = ExtractMetadataString(log.MetadataJson, "source_ip_prefix");
        var userAgentFamily = ExtractMetadataString(log.MetadataJson, "source_user_agent_family");
        if (!string.IsNullOrWhiteSpace(ipPrefix) || !string.IsNullOrWhiteSpace(userAgentFamily))
        {
            return $"{userAgentFamily ?? "unknown"}@{ipPrefix ?? "unknown"}";
        }

        return "unknown_source";
    }

    private sealed record DateRange(
        DateOnly FromDate,
        DateOnly ToDate,
        DateTimeOffset StartUtc,
        DateTimeOffset EndUtcExclusive);

    private sealed record PaymentSnapshot(
        PaymentMethod Method,
        decimal Amount,
        bool IsReversal);

    private sealed record ItemAgg(
        string ProductName,
        decimal Quantity,
        decimal Amount)
    {
        public static ItemAgg Empty { get; } = new(string.Empty, 0m, 0m);
    }

    private sealed record CashierLookupRow(
        Guid UserId,
        string Username,
        string FullName);

    private enum SupportLicenseState
    {
        Active = 1,
        Grace = 2,
        Suspended = 3,
        Revoked = 4,
        MissingLicense = 5
    }
}
