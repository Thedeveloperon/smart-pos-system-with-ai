using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public sealed partial class AiChatEntityResolver(
    SmartPosDbContext dbContext)
{
    public async Task<AiChatResolvedEntities> ResolveAsync(
        string message,
        CancellationToken cancellationToken)
    {
        var normalizedMessage = NormalizeMessage(message);

        var mentionsProduct = ContainsAny(normalizedMessage, "product", "item", "sku", "barcode", "stock count", "units");
        var mentionsBrand = ContainsAny(normalizedMessage, "brand");
        var mentionsSupplier = ContainsAny(normalizedMessage, "supplier", "vendor");
        var mentionsCategory = ContainsAny(normalizedMessage, "category");
        var mentionsCashier = ContainsAny(normalizedMessage, "cashier", "session", "drawer");
        var mentionsCustomer = ContainsAny(normalizedMessage, "customer", "client", "buyer");

        var productMatches = await dbContext.Products
            .AsNoTracking()
            .Where(x => x.IsActive)
            .Select(x => new AiChatEntityMatch(x.Id, x.Name))
            .ToListAsync(cancellationToken);
        var brandMatches = await dbContext.Brands
            .AsNoTracking()
            .Where(x => x.IsActive)
            .Select(x => new AiChatEntityMatch(x.Id, x.Name))
            .ToListAsync(cancellationToken);
        var supplierMatches = await dbContext.Suppliers
            .AsNoTracking()
            .Where(x => x.IsActive)
            .Select(x => new AiChatEntityMatch(x.Id, x.Name))
            .ToListAsync(cancellationToken);
        var categoryMatches = await dbContext.Categories
            .AsNoTracking()
            .Where(x => x.IsActive)
            .Select(x => new AiChatEntityMatch(x.Id, x.Name))
            .ToListAsync(cancellationToken);
        var cashierAliases = await dbContext.Users
            .AsNoTracking()
            .Where(x => x.IsActive)
            .Select(x => new
            {
                x.Id,
                x.Username,
                x.FullName
            })
            .ToListAsync(cancellationToken);

        var cashierMatches = cashierAliases
            .SelectMany(x => new[]
            {
                new EntityAlias(x.Id, x.Username, x.Username),
                new EntityAlias(x.Id, x.FullName, x.FullName)
            })
            .Where(x => !string.IsNullOrWhiteSpace(x.MatchValue))
            .ToList();

        var product = ResolveBestMatch(normalizedMessage, productMatches);
        var brand = ResolveBestMatch(normalizedMessage, brandMatches);
        var supplier = ResolveBestMatch(normalizedMessage, supplierMatches);
        var category = ResolveBestMatch(normalizedMessage, categoryMatches);
        var cashier = ResolveBestMatch(normalizedMessage, cashierMatches);
        var dateRange = ResolveDateRange(normalizedMessage);

        return new AiChatResolvedEntities(
            NormalizedMessage: normalizedMessage,
            Product: product,
            Brand: brand,
            Supplier: supplier,
            Category: category,
            Cashier: cashier,
            DateRange: dateRange,
            MentionsProduct: mentionsProduct,
            MentionsBrand: mentionsBrand,
            MentionsSupplier: mentionsSupplier,
            MentionsCategory: mentionsCategory,
            MentionsCashier: mentionsCashier,
            MentionsCustomer: mentionsCustomer);
    }

    private static AiChatDateRange? ResolveDateRange(string normalizedMessage)
    {
        var explicitRange = ExplicitDateRangeRegex().Match(normalizedMessage);
        if (explicitRange.Success &&
            DateOnly.TryParseExact(
                explicitRange.Groups["from"].Value,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var explicitFrom) &&
            DateOnly.TryParseExact(
                explicitRange.Groups["to"].Value,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var explicitTo))
        {
            var from = explicitFrom <= explicitTo ? explicitFrom : explicitTo;
            var to = explicitFrom <= explicitTo ? explicitTo : explicitFrom;
            return new AiChatDateRange(from, to, $"custom range {from:yyyy-MM-dd} to {to:yyyy-MM-dd}");
        }

        var rollingRange = RollingDaysRegex().Match(normalizedMessage);
        if (rollingRange.Success &&
            int.TryParse(rollingRange.Groups["days"].Value, out var days))
        {
            var boundedDays = Math.Clamp(days, 1, 365);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var from = today.AddDays(-(boundedDays - 1));
            return new AiChatDateRange(from, today, $"last {boundedDays} days");
        }

        var utcToday = DateOnly.FromDateTime(DateTime.UtcNow);

        if (normalizedMessage.Contains("today", StringComparison.Ordinal))
        {
            return new AiChatDateRange(utcToday, utcToday, "today");
        }

        if (normalizedMessage.Contains("yesterday", StringComparison.Ordinal))
        {
            var yesterday = utcToday.AddDays(-1);
            return new AiChatDateRange(yesterday, yesterday, "yesterday");
        }

        var thisWeekStart = utcToday.AddDays(-((7 + (int)utcToday.DayOfWeek - (int)DayOfWeek.Monday) % 7));
        if (normalizedMessage.Contains("this week", StringComparison.Ordinal))
        {
            return new AiChatDateRange(thisWeekStart, utcToday, "this week");
        }

        if (normalizedMessage.Contains("last week", StringComparison.Ordinal))
        {
            var from = thisWeekStart.AddDays(-7);
            var to = thisWeekStart.AddDays(-1);
            return new AiChatDateRange(from, to, "last week");
        }

        var thisMonthStart = new DateOnly(utcToday.Year, utcToday.Month, 1);
        if (normalizedMessage.Contains("this month", StringComparison.Ordinal))
        {
            return new AiChatDateRange(thisMonthStart, utcToday, "this month");
        }

        if (normalizedMessage.Contains("last month", StringComparison.Ordinal))
        {
            var lastMonthReference = thisMonthStart.AddDays(-1);
            var from = new DateOnly(lastMonthReference.Year, lastMonthReference.Month, 1);
            var to = new DateOnly(
                lastMonthReference.Year,
                lastMonthReference.Month,
                DateTime.DaysInMonth(lastMonthReference.Year, lastMonthReference.Month));
            return new AiChatDateRange(from, to, "last month");
        }

        if (normalizedMessage.Contains("this year", StringComparison.Ordinal))
        {
            var from = new DateOnly(utcToday.Year, 1, 1);
            return new AiChatDateRange(from, utcToday, "this year");
        }

        if (normalizedMessage.Contains("compare", StringComparison.Ordinal))
        {
            var from = utcToday.AddDays(-6);
            return new AiChatDateRange(from, utcToday, "last 7 days");
        }

        return null;
    }

    private static AiChatEntityMatch? ResolveBestMatch(
        string normalizedMessage,
        IEnumerable<AiChatEntityMatch> candidates)
    {
        return candidates
            .Select(candidate => new
            {
                Candidate = candidate,
                Index = normalizedMessage.IndexOf(
                    candidate.Name.ToLowerInvariant(),
                    StringComparison.Ordinal)
            })
            .Where(x => x.Index >= 0)
            .OrderByDescending(x => x.Candidate.Name.Length)
            .ThenBy(x => x.Index)
            .Select(x => x.Candidate)
            .FirstOrDefault();
    }

    private static AiChatEntityMatch? ResolveBestMatch(
        string normalizedMessage,
        IEnumerable<EntityAlias> aliases)
    {
        return aliases
            .Select(alias => new
            {
                Alias = alias,
                Index = normalizedMessage.IndexOf(
                    alias.MatchValue.ToLowerInvariant(),
                    StringComparison.Ordinal)
            })
            .Where(x => x.Index >= 0)
            .OrderByDescending(x => x.Alias.MatchValue.Length)
            .ThenBy(x => x.Index)
            .Select(x => new AiChatEntityMatch(x.Alias.Id, x.Alias.DisplayName))
            .FirstOrDefault();
    }

    private static bool ContainsAny(string value, params string[] tokens)
    {
        return tokens.Any(token => value.Contains(token, StringComparison.Ordinal));
    }

    private static string NormalizeMessage(string message)
    {
        var trimmed = (message ?? string.Empty).Trim().ToLowerInvariant();
        return MultiSpaceRegex().Replace(trimmed, " ");
    }

    private sealed record EntityAlias(
        Guid Id,
        string DisplayName,
        string MatchValue);

    [GeneratedRegex(@"\bfrom\s+(?<from>\d{4}-\d{2}-\d{2})\s+(to|-)\s+(?<to>\d{4}-\d{2}-\d{2})\b")]
    private static partial Regex ExplicitDateRangeRegex();

    [GeneratedRegex(@"\blast\s+(?<days>\d{1,3})\s+days\b")]
    private static partial Regex RollingDaysRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex MultiSpaceRegex();
}
