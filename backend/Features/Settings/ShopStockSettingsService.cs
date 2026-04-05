using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Settings;

public sealed class ShopStockSettingsService(SmartPosDbContext dbContext)
{
    public async Task<ShopStockSettingsResponse> GetAsync(CancellationToken cancellationToken)
    {
        var settings = await GetOrCreateAsync(cancellationToken);
        return ToResponse(settings);
    }

    public async Task<ShopStockSettingsResponse> UpdateAsync(
        UpdateShopStockSettingsRequest request,
        CancellationToken cancellationToken)
    {
        ValidatePositive(request.DefaultLowStockThreshold, "Default low stock threshold cannot be negative.");
        if (request.ThresholdMultiplier <= 0m)
        {
            throw new InvalidOperationException("Threshold multiplier must be greater than zero.");
        }
        ValidatePositive(request.DefaultSafetyStock, "Default safety stock cannot be negative.");
        ValidatePositive(request.DefaultTargetDaysOfCover, "Default target days of cover cannot be negative.");
        if (request.DefaultLeadTimeDays <= 0)
        {
            throw new InvalidOperationException("Default lead time days must be positive.");
        }

        var settings = await GetOrCreateAsync(cancellationToken);
        settings.DefaultLowStockThreshold = RoundQuantity(request.DefaultLowStockThreshold);
        settings.ThresholdMultiplier = RoundQuantity(request.ThresholdMultiplier);
        settings.DefaultSafetyStock = RoundQuantity(request.DefaultSafetyStock);
        settings.DefaultLeadTimeDays = request.DefaultLeadTimeDays;
        settings.DefaultTargetDaysOfCover = RoundQuantity(request.DefaultTargetDaysOfCover);
        settings.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"""
             UPDATE "shop_stock_settings"
             SET "DefaultLowStockThreshold" = {settings.DefaultLowStockThreshold},
                 "ThresholdMultiplier" = {settings.ThresholdMultiplier},
                 "DefaultSafetyStock" = {settings.DefaultSafetyStock},
                 "DefaultLeadTimeDays" = {settings.DefaultLeadTimeDays},
                 "DefaultTargetDaysOfCover" = {settings.DefaultTargetDaysOfCover},
                 "UpdatedAtUtc" = {settings.UpdatedAtUtc}
             WHERE "Id" = {settings.Id};
             """,
            cancellationToken);

        return ToResponse(settings);
    }

    private async Task<ShopStockSettings> GetOrCreateAsync(CancellationToken cancellationToken)
    {
        var settings = await dbContext.ShopStockSettings.FirstOrDefaultAsync(cancellationToken);
        if (settings is not null)
        {
            return settings;
        }

        settings = new ShopStockSettings();
        dbContext.ShopStockSettings.Add(settings);
        await dbContext.SaveChangesAsync(cancellationToken);
        return settings;
    }

    private static ShopStockSettingsResponse ToResponse(ShopStockSettings settings)
    {
        return new ShopStockSettingsResponse
        {
            Id = settings.Id,
            StoreId = settings.StoreId,
            DefaultLowStockThreshold = settings.DefaultLowStockThreshold,
            ThresholdMultiplier = settings.ThresholdMultiplier,
            DefaultSafetyStock = settings.DefaultSafetyStock,
            DefaultLeadTimeDays = settings.DefaultLeadTimeDays,
            DefaultTargetDaysOfCover = settings.DefaultTargetDaysOfCover,
            CreatedAt = settings.CreatedAtUtc,
            UpdatedAt = settings.UpdatedAtUtc
        };
    }

    private static void ValidatePositive(decimal value, string errorMessage)
    {
        if (value < 0m)
        {
            throw new InvalidOperationException(errorMessage);
        }
    }

    private static decimal RoundQuantity(decimal value)
    {
        return decimal.Round(value, 3, MidpointRounding.AwayFromZero);
    }
}
