using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Settings;

public sealed class ShopProfileService(SmartPosDbContext dbContext)
{
    public async Task<ShopProfileResponse> GetAsync(CancellationToken cancellationToken)
    {
        var profile = await GetOrCreateAsync(cancellationToken);
        return ToResponse(profile);
    }

    public async Task<ShopProfileResponse> UpdateAsync(
        UpdateShopProfileRequest request,
        CancellationToken cancellationToken)
    {
        var profile = await GetOrCreateAsync(cancellationToken);
        profile.ShopName = NormalizeRequired(request.ShopName, "Shop name is required.");
        profile.AddressLine1 = NormalizeOptional(request.AddressLine1);
        profile.AddressLine2 = NormalizeOptional(request.AddressLine2);
        profile.Phone = NormalizeOptional(request.Phone);
        profile.Email = NormalizeOptional(request.Email);
        profile.Website = NormalizeOptional(request.Website);
        profile.LogoUrl = NormalizeOptional(request.LogoUrl);
        profile.ReceiptFooter = NormalizeOptional(request.ReceiptFooter);
        profile.ShowHeldBillsForCashier = request.ShowHeldBillsForCashier;
        profile.ShowRemindersForCashier = request.ShowRemindersForCashier;
        profile.ShowAuditTrailForCashier = request.ShowAuditTrailForCashier;
        profile.ShowEndShiftForCashier = request.ShowEndShiftForCashier;
        profile.ShowTodaySalesForCashier = request.ShowTodaySalesForCashier;
        profile.ShowImportBillForCashier = request.ShowImportBillForCashier;
        profile.ShowShopSettingsForCashier = request.ShowShopSettingsForCashier;
        profile.ShowMyLicensesForCashier = request.ShowMyLicensesForCashier;
        profile.ShowOfflineSyncForCashier = request.ShowOfflineSyncForCashier;
        profile.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);
        return ToResponse(profile);
    }

    public static ShopProfileResponse ToResponse(ShopProfile profile)
    {
        return new ShopProfileResponse
        {
            Id = profile.Id,
            ShopName = profile.ShopName,
            AddressLine1 = profile.AddressLine1,
            AddressLine2 = profile.AddressLine2,
            Phone = profile.Phone,
            Email = profile.Email,
            Website = profile.Website,
            LogoUrl = profile.LogoUrl,
            ReceiptFooter = profile.ReceiptFooter,
            ShowHeldBillsForCashier = profile.ShowHeldBillsForCashier,
            ShowRemindersForCashier = profile.ShowRemindersForCashier,
            ShowAuditTrailForCashier = profile.ShowAuditTrailForCashier,
            ShowEndShiftForCashier = profile.ShowEndShiftForCashier,
            ShowTodaySalesForCashier = profile.ShowTodaySalesForCashier,
            ShowImportBillForCashier = profile.ShowImportBillForCashier,
            ShowShopSettingsForCashier = profile.ShowShopSettingsForCashier,
            ShowMyLicensesForCashier = profile.ShowMyLicensesForCashier,
            ShowOfflineSyncForCashier = profile.ShowOfflineSyncForCashier,
            CreatedAt = profile.CreatedAtUtc,
            UpdatedAt = profile.UpdatedAtUtc
        };
    }

    private async Task<ShopProfile> GetOrCreateAsync(CancellationToken cancellationToken)
    {
        var profile = await dbContext.ShopProfiles.FirstOrDefaultAsync(cancellationToken);
        if (profile is not null)
        {
            return profile;
        }

        profile = new ShopProfile();
        dbContext.ShopProfiles.Add(profile);
        await dbContext.SaveChangesAsync(cancellationToken);
        return profile;
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

    private static string? NormalizeOptional(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
