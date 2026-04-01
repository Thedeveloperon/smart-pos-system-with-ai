using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Infrastructure;

public static class DbSeeder
{
    public static async Task SeedAsync(SmartPosDbContext dbContext, CancellationToken cancellationToken = default)
    {
        if (!dbContext.Products.Any())
        {
            var groceries = new Category
            {
                Name = "Groceries",
                Description = "Daily essentials",
            };

            var personalCare = new Category
            {
                Name = "Personal Care",
                Description = "Hygiene and beauty",
            };

            var books = new Category
            {
                Name = "Books",
                Description = "Stationery and books",
            };

            var products = new List<Product>
            {
                new() { Name = "Ceylon Tea 100g", Barcode = "4790001000010", Sku = "TEA-100", ImageUrl = "https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&h=600&fit=crop", UnitPrice = 850m, CostPrice = 640m, Category = groceries },
                new() { Name = "Sugar 1kg", Barcode = "4790001000027", Sku = "SGR-1KG", ImageUrl = "https://images.unsplash.com/photo-1582657625660-d2c6b8a2fd7d?w=600&h=600&fit=crop", UnitPrice = 310m, CostPrice = 260m, Category = groceries },
                new() { Name = "Milk Powder 400g", Barcode = "4790001000034", Sku = "MLK-400", ImageUrl = "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&h=600&fit=crop", UnitPrice = 1490m, CostPrice = 1290m, Category = groceries },
                new() { Name = "Rice 5kg", Barcode = "4790001000041", Sku = "RCE-5KG", ImageUrl = "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&h=600&fit=crop", UnitPrice = 1280m, CostPrice = 1090m, Category = groceries },
                new() { Name = "Bath Soap", Barcode = "4790001000058", Sku = "SOAP-01", ImageUrl = "https://images.unsplash.com/photo-1607006344380-b6775a0824a7?w=600&h=600&fit=crop", UnitPrice = 220m, CostPrice = 170m, Category = personalCare },
                new() { Name = "Shampoo 180ml", Barcode = "4790001000065", Sku = "SHMP-180", ImageUrl = "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=600&h=600&fit=crop", UnitPrice = 690m, CostPrice = 520m, Category = personalCare },
                new() { Name = "Toothpaste 120g", Barcode = "4790001000072", Sku = "TP-120", ImageUrl = "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&h=600&fit=crop", UnitPrice = 480m, CostPrice = 360m, Category = personalCare },
                new() { Name = "Notebook A5", Barcode = "4790001000089", Sku = "NB-A5", ImageUrl = "https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=600&h=600&fit=crop", UnitPrice = 240m, CostPrice = 140m, Category = books },
                new() { Name = "Ball Pen Blue", Barcode = "4790001000096", Sku = "PEN-BLU", ImageUrl = "https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=600&h=600&fit=crop", UnitPrice = 90m, CostPrice = 45m, Category = books },
                new() { Name = "Story Book Grade 5", Barcode = "4790001000102", Sku = "BK-G5", ImageUrl = "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&h=600&fit=crop", UnitPrice = 1250m, CostPrice = 980m, Category = books },
            };

            foreach (var product in products)
            {
                dbContext.Products.Add(product);
                dbContext.Inventory.Add(new InventoryRecord
                {
                    Product = product,
                    QuantityOnHand = 50m,
                    ReorderLevel = 10m,
                    AllowNegativeStock = true,
                });
            }
        }

        if (!dbContext.ShopProfiles.Any())
        {
            dbContext.ShopProfiles.Add(new ShopProfile
            {
                ShopName = "SmartPOS Lanka",
                AddressLine1 = "Your shop address",
                AddressLine2 = "Add your branch or city",
                Phone = string.Empty,
                Email = string.Empty,
                Website = string.Empty,
                LogoUrl = string.Empty,
                ReceiptFooter = "Thank you for shopping with us."
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

        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "owner",
            fullName: "Store Owner",
            password: "owner123",
            roleCode: SmartPosRoles.Owner,
            mfaSecret: null,
            cancellationToken);
        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "manager",
            fullName: "Store Manager",
            password: "manager123",
            roleCode: SmartPosRoles.Manager,
            mfaSecret: null,
            cancellationToken);
        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "cashier",
            fullName: "Store Cashier",
            password: "cashier123",
            roleCode: SmartPosRoles.Cashier,
            mfaSecret: null,
            cancellationToken);
        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "support_admin",
            fullName: "Support Administrator",
            password: "support123",
            roleCode: SmartPosRoles.Support,
            mfaSecret: "support-admin-mfa-secret-2026",
            cancellationToken);
        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "billing_admin",
            fullName: "Billing Administrator",
            password: "billing123",
            roleCode: SmartPosRoles.BillingAdmin,
            mfaSecret: "billing-admin-mfa-secret-2026",
            cancellationToken);
        await EnsureSeedUserAsync(
            dbContext,
            roleByCode,
            username: "security_admin",
            fullName: "Security Administrator",
            password: "security123",
            roleCode: SmartPosRoles.SecurityAdmin,
            mfaSecret: "security-admin-mfa-secret-2026",
            cancellationToken);

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
}
