using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.CashSessions;

public sealed class CashSessionService(
    SmartPosDbContext dbContext,
    AuditLogService auditLogService,
    IHttpContextAccessor httpContextAccessor)
{
    public async Task<CashSessionResponse?> GetCurrentAsync(CancellationToken cancellationToken)
    {
        var session = await GetLatestSessionAsync(cancellationToken, includeClosed: true);
        return session is null ? null : await BuildResponseAsync(session, cancellationToken);
    }

    public async Task<CashSessionHistoryResponse> GetHistoryAsync(
        DateOnly? fromDate,
        DateOnly? toDate,
        CancellationToken cancellationToken)
    {
        var actor = RequireActor();
        var range = NormalizeDateRange(fromDate, toDate);

        var query = dbContext.CashSessions.AsNoTracking();

        if (actor.DeviceId.HasValue)
        {
            query = query.Where(x => x.DeviceId == actor.DeviceId);
        }
        else if (actor.UserId.HasValue)
        {
            query = query.Where(x => x.AppUserId == actor.UserId);
        }

        var sessions = await query.ToListAsync(cancellationToken);
        var filteredSessions = sessions
            .Where(x => x.OpenedAtUtc >= range.Start && x.OpenedAtUtc < range.End)
            .OrderByDescending(x => x.OpenedAtUtc)
            .ThenByDescending(x => x.UpdatedAtUtc)
            .ToList();

        return new CashSessionHistoryResponse
        {
            Items = filteredSessions.Select(session => BuildHistoryItem(session, filteredSessions)).ToList()
        };
    }

    public async Task<CashSessionResponse> OpenAsync(
        OpenCashSessionRequest request,
        CancellationToken cancellationToken)
    {
        var actor = RequireActor();
        ValidateCounts(request.Counts, request.Total);
        var cashierName = request.CashierName?.Trim();
        if (string.IsNullOrWhiteSpace(cashierName))
        {
            throw new InvalidOperationException("Cashier name is required.");
        }

        var existingActive = await GetLatestSessionAsync(cancellationToken, includeClosed: false);
        if (existingActive is not null)
        {
            throw new InvalidOperationException("A cash session is already active for this device.");
        }

        var now = DateTimeOffset.UtcNow;
        var session = new CashSession
        {
            AppUserId = actor.UserId,
            DeviceId = actor.DeviceId,
            CashierName = cashierName,
            Status = CashSessionStatus.Active,
            OpeningCountsJson = JsonSerializer.Serialize(request.Counts),
            OpeningTotal = request.Total,
            OpeningSubmittedAtUtc = now,
            OpeningApprovedBy = actor.CashierName,
            OpeningApprovedAtUtc = now,
            DrawerCountsJson = JsonSerializer.Serialize(request.Counts),
            DrawerTotal = request.Total,
            DrawerUpdatedAtUtc = now,
            CashSalesTotal = 0m,
            OpenedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.CashSessions.Add(session);
        auditLogService.Queue(
            action: "cash_session_opened",
            entityName: "cash_session",
            entityId: session.Id.ToString(),
            after: new
            {
                details = $"Opening cash: Rs. {request.Total:N0}",
                amount = request.Total,
                opening_total = request.Total,
                cashier_name = session.CashierName
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        return await BuildResponseAsync(session, cancellationToken);
    }

    public async Task<CashSessionResponse> UpdateDrawerAsync(
        UpdateCashDrawerRequest request,
        CancellationToken cancellationToken)
    {
        var actor = RequireActor();
        ValidateCounts(request.Counts, request.Total);

        var session = await GetLatestActiveSessionAsync(cancellationToken)
            ?? throw new InvalidOperationException("No active cash session found.");

        if (session.DeviceId.HasValue && actor.DeviceId.HasValue && session.DeviceId != actor.DeviceId)
        {
            throw new InvalidOperationException("This cash session belongs to a different device.");
        }

        var now = DateTimeOffset.UtcNow;
        session.DrawerCountsJson = JsonSerializer.Serialize(request.Counts);
        session.DrawerTotal = request.Total;
        session.DrawerUpdatedAtUtc = now;
        session.UpdatedAtUtc = now;

        auditLogService.Queue(
            action: "cash_drawer_updated",
            entityName: "cash_session",
            entityId: session.Id.ToString(),
            after: new
            {
                details = $"Drawer updated: Rs. {request.Total:N0}",
                amount = request.Total,
                drawer_total = request.Total,
                cashier_name = actor.CashierName
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        return await BuildResponseAsync(session, cancellationToken);
    }

    public async Task<CashSessionResponse> CloseAsync(
        Guid sessionId,
        CloseCashSessionRequest request,
        CancellationToken cancellationToken)
    {
        var actor = RequireActor();
        ValidateCounts(request.Counts, request.Total);

        var session = await dbContext.CashSessions
            .FirstOrDefaultAsync(x => x.Id == sessionId, cancellationToken)
            ?? throw new InvalidOperationException("Cash session not found.");

        if (session.DeviceId.HasValue && actor.DeviceId.HasValue && session.DeviceId != actor.DeviceId)
        {
            throw new InvalidOperationException("This cash session belongs to a different device.");
        }

        if (session.Status is CashSessionStatus.Closed or CashSessionStatus.Locked)
        {
            return await BuildResponseAsync(session, cancellationToken);
        }

        var expected = RoundMoney(session.OpeningTotal + session.CashSalesTotal);
        var difference = RoundMoney(request.Total - expected);
        var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();

        if (difference != 0m && string.IsNullOrWhiteSpace(reason))
        {
            throw new InvalidOperationException("A reason is required when the closing cash differs from the expected amount.");
        }

        var now = DateTimeOffset.UtcNow;
        session.Status = CashSessionStatus.Closed;
        session.ClosingCountsJson = JsonSerializer.Serialize(request.Counts);
        session.ClosingTotal = request.Total;
        session.ClosingSubmittedAtUtc = now;
        session.ClosingApprovedBy = actor.CashierName;
        session.ClosingApprovedAtUtc = now;
        session.ExpectedCash = expected;
        session.Difference = difference;
        session.DifferenceReason = reason;
        session.ClosedAtUtc = now;
        session.UpdatedAtUtc = now;

        auditLogService.Queue(
            action: "cash_session_closed",
            entityName: "cash_session",
            entityId: session.Id.ToString(),
            before: new
            {
                status = "active",
                expected_cash = expected,
                cash_sales_total = session.CashSalesTotal
            },
            after: new
            {
                details = $"Closing cash: Rs. {request.Total:N0}. Expected: Rs. {expected:N0}. Difference: Rs. {difference:N0}{(reason is null ? string.Empty : $". Reason: {reason}")}",
                amount = request.Total,
                closing_total = request.Total,
                expected_cash = expected,
                difference,
                reason,
                cashier_name = actor.CashierName
            });

        await dbContext.SaveChangesAsync(cancellationToken);
        return await BuildResponseAsync(session, cancellationToken);
    }

    public async Task RecordCashSaleAsync(
        decimal amount,
        Guid saleId,
        string saleNumber,
        CancellationToken cancellationToken)
    {
        if (amount <= 0m)
        {
            return;
        }

        var session = await GetLatestActiveSessionAsync(cancellationToken);
        if (session is null)
        {
            return;
        }

        session.CashSalesTotal = RoundMoney(session.CashSalesTotal + amount);
        session.UpdatedAtUtc = DateTimeOffset.UtcNow;

        auditLogService.Queue(
            action: "cash_session_sale_recorded",
            entityName: "cash_session",
            entityId: session.Id.ToString(),
            after: new
            {
                details = $"Sale Rs. {amount:N0} via cash",
                amount,
                sale_id = saleId,
                sale_number = saleNumber,
                cash_sales_total = session.CashSalesTotal
            });

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task RecordCashSaleAsync(
        decimal amount,
        IReadOnlyCollection<CashCountItem> receivedCounts,
        IReadOnlyCollection<CashCountItem> changeCounts,
        Guid saleId,
        string saleNumber,
        CancellationToken cancellationToken)
    {
        if (amount <= 0m)
        {
            return;
        }

        var session = await GetLatestActiveSessionAsync(cancellationToken);
        if (session is null)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        session.CashSalesTotal = RoundMoney(session.CashSalesTotal + amount);
        session.UpdatedAtUtc = now;

        var currentCounts = DeserializeCounts(session.DrawerCountsJson);
        if (currentCounts.Count == 0)
        {
            currentCounts = DeserializeCounts(session.OpeningCountsJson);
        }

        var updatedCounts = ApplyDrawerCounts(
            ApplyDrawerCounts(currentCounts, receivedCounts, multiplier: 1m),
            changeCounts,
            multiplier: -1m);

        session.DrawerCountsJson = JsonSerializer.Serialize(updatedCounts);
        session.DrawerTotal = CalculateTotal(updatedCounts);
        session.DrawerUpdatedAtUtc = now;

        auditLogService.Queue(
            action: "cash_session_sale_recorded",
            entityName: "cash_session",
            entityId: session.Id.ToString(),
            after: new
            {
                details = $"Sale Rs. {amount:N0} via cash",
                amount,
                sale_id = saleId,
                sale_number = saleNumber,
                cash_sales_total = session.CashSalesTotal,
                drawer_total = session.DrawerTotal
            });

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task RecordCashRefundAsync(
        decimal amount,
        Guid refundId,
        string refundNumber,
        CancellationToken cancellationToken)
    {
        if (amount <= 0m)
        {
            return;
        }

        var session = await GetLatestActiveSessionAsync(cancellationToken);
        if (session is null)
        {
            return;
        }

        session.CashSalesTotal = RoundMoney(session.CashSalesTotal - amount);
        session.UpdatedAtUtc = DateTimeOffset.UtcNow;

        auditLogService.Queue(
            action: "cash_session_refund_recorded",
            entityName: "cash_session",
            entityId: session.Id.ToString(),
            after: new
            {
                details = $"Refund Rs. {amount:N0} via cash reversal",
                amount,
                refund_id = refundId,
                refund_number = refundNumber,
                cash_sales_total = session.CashSalesTotal
            });

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<CashSession?> GetLatestSessionAsync(CancellationToken cancellationToken, bool includeClosed)
    {
        var actor = RequireActor();
        var query = dbContext.CashSessions.AsNoTracking();

        if (actor.DeviceId.HasValue)
        {
            query = query.Where(x => x.DeviceId == actor.DeviceId);
        }
        else if (actor.UserId.HasValue)
        {
            query = query.Where(x => x.AppUserId == actor.UserId);
        }

        if (!includeClosed)
        {
            query = query.Where(x => x.Status == CashSessionStatus.Active || x.Status == CashSessionStatus.Closing);
        }

        var sessions = await query.ToListAsync(cancellationToken);
        return sessions
            .OrderByDescending(x => x.OpenedAtUtc)
            .ThenByDescending(x => x.UpdatedAtUtc)
            .FirstOrDefault();
    }

    private async Task<CashSession?> GetLatestActiveSessionAsync(CancellationToken cancellationToken)
    {
        var actor = RequireActor();
        var query = dbContext.CashSessions
            .Where(x => x.Status == CashSessionStatus.Active || x.Status == CashSessionStatus.Closing);

        if (actor.DeviceId.HasValue)
        {
            query = query.Where(x => x.DeviceId == actor.DeviceId);
        }
        else if (actor.UserId.HasValue)
        {
            query = query.Where(x => x.AppUserId == actor.UserId);
        }

        var sessions = await query.ToListAsync(cancellationToken);
        return sessions
            .OrderByDescending(x => x.OpenedAtUtc)
            .ThenByDescending(x => x.UpdatedAtUtc)
            .FirstOrDefault();
    }

    private async Task<CashSessionResponse> BuildResponseAsync(
        CashSession session,
        CancellationToken cancellationToken)
    {
        var actor = RequireActor();
        var auditLogs = await dbContext.AuditLogs
            .AsNoTracking()
            .Where(x => x.EntityName == "cash_session" && x.EntityId == session.Id.ToString())
            .ToListAsync(cancellationToken);

        return new CashSessionResponse
        {
            CashSessionId = session.Id,
            DeviceId = session.DeviceId,
            DeviceCode = actor.DeviceCode,
            CashierName = session.CashierName,
            ShiftNumber = await GetShiftNumberAsync(session, cancellationToken),
            Status = session.Status.ToString().ToLowerInvariant(),
            OpenedAt = session.OpenedAtUtc,
            ClosedAt = session.ClosedAtUtc,
            Opening = new CashSessionEntryResponse
            {
                Counts = DeserializeCounts(session.OpeningCountsJson),
                Total = session.OpeningTotal,
                SubmittedBy = session.CashierName,
                SubmittedAt = session.OpeningSubmittedAtUtc,
                ApprovedBy = session.OpeningApprovedBy,
                ApprovedAt = session.OpeningApprovedAtUtc
            },
            Drawer = new CashDrawerResponse
            {
                Counts = DeserializeCounts(session.DrawerCountsJson) is { Count: > 0 } drawerCounts
                    ? drawerCounts
                    : DeserializeCounts(session.OpeningCountsJson),
                Total = session.DrawerTotal ?? session.OpeningTotal,
                UpdatedAt = session.DrawerUpdatedAtUtc ?? session.OpeningApprovedAtUtc ?? session.OpenedAtUtc
            },
            Closing = session.ClosingCountsJson is null
                ? null
                : new CashSessionEntryResponse
                {
                    Counts = DeserializeCounts(session.ClosingCountsJson),
                    Total = session.ClosingTotal ?? 0m,
                    SubmittedBy = session.CashierName,
                    SubmittedAt = session.ClosingSubmittedAtUtc ?? session.UpdatedAtUtc,
                    ApprovedBy = session.ClosingApprovedBy,
                    ApprovedAt = session.ClosingApprovedAtUtc
                },
            ExpectedCash = session.ExpectedCash,
            Difference = session.Difference,
            DifferenceReason = session.DifferenceReason,
            CashSalesTotal = session.CashSalesTotal,
            AuditLog = auditLogs
                .OrderBy(x => x.CreatedAtUtc)
                .Select(MapAuditLog)
                .ToList()
        };
    }

    private static CashSessionHistoryItemResponse BuildHistoryItem(CashSession session, IReadOnlyCollection<CashSession> sessions)
    {
        return new CashSessionHistoryItemResponse
        {
            CashSessionId = session.Id,
            ShiftNumber = CalculateShiftNumber(session, sessions),
            CashierName = session.CashierName,
            Status = session.Status.ToString().ToLowerInvariant(),
            OpenedAt = session.OpenedAtUtc,
            ClosedAt = session.ClosedAtUtc,
            OpeningTotal = session.OpeningTotal,
            ClosingTotal = session.ClosingTotal,
            ExpectedCash = session.ExpectedCash,
            Difference = session.Difference,
            CashSalesTotal = session.CashSalesTotal
        };
    }

    private async Task<int> GetShiftNumberAsync(CashSession session, CancellationToken cancellationToken)
    {
        var query = dbContext.CashSessions.AsNoTracking();

        if (session.DeviceId.HasValue)
        {
            query = query.Where(x => x.DeviceId == session.DeviceId);
        }
        else if (session.AppUserId.HasValue)
        {
            query = query.Where(x => x.AppUserId == session.AppUserId);
        }

        var openedDate = session.OpenedAtUtc.UtcDateTime.Date;
        var dayStart = new DateTimeOffset(openedDate, TimeSpan.Zero);
        var dayEnd = dayStart.AddDays(1);
        var sessions = await query.ToListAsync(cancellationToken);
        return sessions.Count(x =>
            x.OpenedAtUtc >= dayStart &&
            x.OpenedAtUtc < dayEnd &&
            x.OpenedAtUtc <= session.OpenedAtUtc);
    }

    private static CashSessionAuditEntryResponse MapAuditLog(AuditLog auditLog)
    {
        var after = TryParseJson(auditLog.AfterJson);
        var details = GetStringProperty(after, "details") ?? BuildFallbackDetails(auditLog);
        var amount = GetDecimalProperty(after, "amount");

        return new CashSessionAuditEntryResponse
        {
            Id = auditLog.Id,
            Action = auditLog.Action,
            PerformedBy = auditLog.UserId?.ToString() ?? "System",
            PerformedAt = auditLog.CreatedAtUtc,
            Details = details,
            Amount = amount
        };
    }

    private static string BuildFallbackDetails(AuditLog auditLog)
    {
        return auditLog.Action switch
        {
            "cash_session_opened" => "Opening cash session",
            "cash_session_sale_recorded" => "Cash sale recorded",
            "cash_session_refund_recorded" => "Cash refund recorded",
            "cash_session_closed" => "Cash session closed",
            _ => auditLog.Action
        };
    }

    private static List<CashCountItem> DeserializeCounts(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<CashCountItem>>(json) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static List<CashCountItem> ApplyDrawerCounts(
        IReadOnlyCollection<CashCountItem> baseCounts,
        IReadOnlyCollection<CashCountItem> deltaCounts,
        decimal multiplier)
    {
        var countsByDenomination = baseCounts
            .GroupBy(x => x.Denomination)
            .ToDictionary(
                group => group.Key,
                group => group.Sum(x => x.Quantity));

        foreach (var delta in deltaCounts)
        {
            var updatedQuantity = (countsByDenomination.TryGetValue(delta.Denomination, out var existing)
                ? existing
                : 0m) + (delta.Quantity * multiplier);

            if (updatedQuantity < 0m)
            {
                throw new InvalidOperationException("Cash drawer does not have enough denominations for this transaction.");
            }

            countsByDenomination[delta.Denomination] = updatedQuantity;
        }

        return countsByDenomination
            .OrderByDescending(x => x.Key)
            .Select(x => new CashCountItem
            {
                Denomination = x.Key,
                Quantity = x.Value
            })
            .ToList();
    }

    private static decimal CalculateTotal(IReadOnlyCollection<CashCountItem> counts)
    {
        return RoundMoney(counts.Sum(x => x.Denomination * x.Quantity));
    }

    private ActorContext RequireActor()
    {
        var principal = httpContextAccessor.HttpContext?.User
            ?? throw new InvalidOperationException("Authentication context is missing.");

        var userId = ParseGuid(
            principal.FindFirstValue(ClaimTypes.NameIdentifier) ??
            principal.FindFirstValue(JwtRegisteredClaimNames.Sub));
        var deviceId = ParseGuid(principal.FindFirstValue("device_id"));
        var deviceCode = principal.FindFirstValue("device_code") ?? string.Empty;
        var cashierName = principal.FindFirstValue("full_name")
            ?? principal.FindFirstValue(ClaimTypes.Name)
            ?? "Cashier";

        return new ActorContext(userId, deviceId, deviceCode, cashierName);
    }

    private static void ValidateCounts(IReadOnlyCollection<CashCountItem> counts, decimal total)
    {
        if (counts.Count == 0)
        {
            throw new InvalidOperationException("At least one denomination count is required.");
        }

        var calculated = RoundMoney(counts.Sum(x => x.Denomination * x.Quantity));
        if (Math.Abs(calculated - total) > 0.01m)
        {
            throw new InvalidOperationException("Cash total does not match denomination counts.");
        }
    }

    private static Guid? ParseGuid(string? value)
    {
        return Guid.TryParse(value, out var parsed) ? parsed : null;
    }

    private static decimal RoundMoney(decimal value)
    {
        return decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static int CalculateShiftNumber(CashSession session, IReadOnlyCollection<CashSession> sessions)
    {
        var openedDate = session.OpenedAtUtc.UtcDateTime.Date;
        var dayStart = new DateTimeOffset(openedDate, TimeSpan.Zero);
        var dayEnd = dayStart.AddDays(1);

        return sessions.Count(x =>
            x.OpenedAtUtc >= dayStart &&
            x.OpenedAtUtc < dayEnd &&
            x.OpenedAtUtc <= session.OpenedAtUtc &&
            AreSameScope(session, x));
    }

    private static bool AreSameScope(CashSession left, CashSession right)
    {
        if (left.DeviceId.HasValue || right.DeviceId.HasValue)
        {
            return left.DeviceId == right.DeviceId;
        }

        if (left.AppUserId.HasValue || right.AppUserId.HasValue)
        {
            return left.AppUserId == right.AppUserId;
        }

        return true;
    }

    private static (DateTimeOffset Start, DateTimeOffset End) NormalizeDateRange(DateOnly? fromDate, DateOnly? toDate)
    {
        var from = fromDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var to = toDate ?? from;
        if (to < from)
        {
            (from, to) = (to, from);
        }

        var start = from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var end = to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        return (new DateTimeOffset(start, TimeSpan.Zero), new DateTimeOffset(end, TimeSpan.Zero));
    }

    private static JsonElement? TryParseJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<JsonElement>(json);
        }
        catch
        {
            return null;
        }
    }

    private static string? GetStringProperty(JsonElement? element, string propertyName)
    {
        if (element is not { ValueKind: JsonValueKind.Object } objectElement)
        {
            return null;
        }

        return objectElement.TryGetProperty(propertyName, out var property) &&
               property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;
    }

    private static decimal? GetDecimalProperty(JsonElement? element, string propertyName)
    {
        if (element is not { ValueKind: JsonValueKind.Object } objectElement)
        {
            return null;
        }

        if (!objectElement.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind switch
        {
            JsonValueKind.Number when property.TryGetDecimal(out var value) => value,
            JsonValueKind.String when decimal.TryParse(property.GetString(), out var parsed) => parsed,
            _ => null
        };
    }

    private sealed record ActorContext(
        Guid? UserId,
        Guid? DeviceId,
        string DeviceCode,
        string CashierName);
}
