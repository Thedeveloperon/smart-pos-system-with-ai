using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Infrastructure;

public static class DbSeeder
{
    public static async Task SeedAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        if (!dbContext.ShopProfiles.Any())
        {
            dbContext.ShopProfiles.Add(new ShopProfile
            {
                ShopName = "SmartPOS Lanka",
                Language = "english",
                AddressLine1 = "Your shop address",
                AddressLine2 = "Add your branch or city",
                Phone = string.Empty,
                Email = string.Empty,
                Website = string.Empty,
                LogoUrl = string.Empty,
                ReceiptFooter = "Thank you for shopping with us.",
                ShowNewItemForCashier = true,
                ShowManageForCashier = true,
                ShowReportsForCashier = true,
                ShowAiInsightsForCashier = true,
                ShowHeldBillsForCashier = true,
                ShowRemindersForCashier = true,
                ShowAuditTrailForCashier = true,
                ShowEndShiftForCashier = true,
                ShowTodaySalesForCashier = true,
                ShowImportBillForCashier = true,
                ShowShopSettingsForCashier = true,
                ShowMyLicensesForCashier = true,
                ShowOfflineSyncForCashier = true
            });
        }

        var requiredRoles = new[]
        {
            new AppRole { Code = SmartPosRoles.Owner, Name = "Owner" },
            new AppRole { Code = SmartPosRoles.Manager, Name = "Manager" },
            new AppRole { Code = SmartPosRoles.Cashier, Name = "Cashier" },
            new AppRole { Code = SmartPosRoles.Support, Name = "Support" },
            new AppRole { Code = SmartPosRoles.BillingAdmin, Name = "Billing Admin" },
            new AppRole { Code = SmartPosRoles.SecurityAdmin, Name = "Security Admin" }
        };

        var existingRolesByCode = await dbContext.Roles
            .ToDictionaryAsync(x => x.Code.ToLowerInvariant(), cancellationToken);
        var rolesAdded = false;
        foreach (var requiredRole in requiredRoles)
        {
            var normalizedCode = requiredRole.Code.ToLowerInvariant();
            if (existingRolesByCode.ContainsKey(normalizedCode))
            {
                continue;
            }

            dbContext.Roles.Add(requiredRole);
            existingRolesByCode[normalizedCode] = requiredRole;
            rolesAdded = true;
        }

        if (rolesAdded)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var roleByCode = await dbContext.Roles
            .ToDictionaryAsync(x => x.Code.ToLowerInvariant(), cancellationToken);

        var seedShop = await dbContext.Shops
            .FirstOrDefaultAsync(
                x => x.Code.ToLower() == "default",
                cancellationToken);
        if (seedShop is null)
        {
            seedShop = new Shop
            {
                Code = "default",
                Name = "Default Shop",
                IsActive = true,
                CreatedAtUtc = DateTimeOffset.UtcNow
            };
            dbContext.Shops.Add(seedShop);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "owner",
            fullName: "Store Owner",
            password: "owner123",
            roleCode: SmartPosRoles.Owner,
            mfaSecret: null,
            storeId: seedShop.Id,
            cancellationToken);
        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "manager",
            fullName: "Store Manager",
            password: "manager123",
            roleCode: SmartPosRoles.Manager,
            mfaSecret: null,
            storeId: seedShop.Id,
            cancellationToken);
        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "cashier",
            fullName: "Store Cashier",
            password: "cashier123",
            roleCode: SmartPosRoles.Cashier,
            mfaSecret: null,
            storeId: seedShop.Id,
            cancellationToken);
        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "support_admin",
            fullName: "Support Administrator",
            password: "support123",
            roleCode: SmartPosRoles.Support,
            mfaSecret: "support-admin-mfa-secret-2026",
            storeId: seedShop.Id,
            cancellationToken);
        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "billing_admin",
            fullName: "Billing Administrator",
            password: "billing123",
            roleCode: SmartPosRoles.BillingAdmin,
            mfaSecret: "billing-admin-mfa-secret-2026",
            storeId: seedShop.Id,
            cancellationToken);
        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "security_admin",
            fullName: "Security Administrator",
            password: "security123",
            roleCode: SmartPosRoles.SecurityAdmin,
            mfaSecret: "security-admin-mfa-secret-2026",
            storeId: seedShop.Id,
            cancellationToken);

        await EnsureDefaultCustomerAsync(dbContext, seedShop.Id, cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static async Task EnsureSeedUserAsync(
        SmartPosDbContext dbContext,
        IReadOnlyDictionary<string, AppRole> roleByCode,
        string username,
        string fullName,
        string password,
        string roleCode,
        string? mfaSecret,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        var normalizedUsername = username.Trim().ToLowerInvariant();
        var user = await dbContext.Users
            .FirstOrDefaultAsync(x => x.Username.ToLower() == normalizedUsername, cancellationToken);

        if (user is null)
        {
            user = new AppUser
            {
                Username = username,
                FullName = fullName,
                PasswordHash = string.Empty,
                IsActive = true,
                StoreId = storeId,
                IsMfaEnabled = !string.IsNullOrWhiteSpace(mfaSecret),
                MfaSecret = mfaSecret,
                MfaConfiguredAtUtc = string.IsNullOrWhiteSpace(mfaSecret) ? null : DateTimeOffset.UtcNow
            };
            user.PasswordHash = PasswordHashing.HashPassword(user, password);
            dbContext.Users.Add(user);
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        else
        {
            if (storeId.HasValue && storeId.Value != Guid.Empty)
            {
                user.StoreId = storeId.Value;
            }

            user.IsMfaEnabled = !string.IsNullOrWhiteSpace(mfaSecret);
            user.MfaSecret = mfaSecret;
            user.MfaConfiguredAtUtc = user.IsMfaEnabled
                ? (user.MfaConfiguredAtUtc ?? DateTimeOffset.UtcNow)
                : null;
        }

        var normalizedRoleCode = roleCode.ToLowerInvariant();
        if (!roleByCode.TryGetValue(normalizedRoleCode, out var role))
        {
            throw new InvalidOperationException($"Seed role '{roleCode}' does not exist.");
        }

        var hasRole = await dbContext.UserRoles
            .AnyAsync(x => x.UserId == user.Id && x.RoleId == role.Id, cancellationToken);

        if (hasRole)
        {
            return;
        }

        dbContext.UserRoles.Add(new UserRole
        {
            UserId = user.Id,
            RoleId = role.Id,
            User = null!,
            Role = null!
        });
    }

    private static async Task EnsureDefaultCustomerAsync(
        SmartPosDbContext dbContext,
        Guid? storeId,
        CancellationToken cancellationToken)
    {
        var normalizedName = "default customer";
        var existing = await dbContext.Customers
            .FirstOrDefaultAsync(x => x.Name.ToLower() == normalizedName, cancellationToken);

        if (existing is not null)
        {
            if (storeId.HasValue && existing.StoreId != storeId.Value)
            {
                existing.StoreId = storeId.Value;
            }

            existing.IsActive = true;
            existing.Code ??= "C-0000";
            return;
        }

        dbContext.Customers.Add(new Customer
        {
            StoreId = storeId,
            Name = "Default Customer",
            Code = "C-0000",
            Phone = null,
            Email = null,
            Address = null,
            DateOfBirth = null,
            FixedDiscountPercent = null,
            CreditLimit = 0m,
            OutstandingBalance = 0m,
            LoyaltyPoints = 0m,
            Notes = "Automatically available default customer for sales.",
            IsActive = true,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
            Tags = []
        });
    }
}
