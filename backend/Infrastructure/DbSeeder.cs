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
            var categories = new Dictionary<string, Category>(StringComparer.OrdinalIgnoreCase)
            {
                ["geometry-drawing-items"] = new Category
                {
                    Name = "Geometry & Drawing Items",
                    Description = "Geometry sets, erasers, and art supplies",
                },
                ["paper-products"] = new Category
                {
                    Name = "Paper Products",
                    Description = "Books, pages, and stationery paper items",
                },
                ["school-supplies"] = new Category
                {
                    Name = "School Supplies",
                    Description = "Back-to-school essentials",
                },
                ["tools-accessories"] = new Category
                {
                    Name = "Tools & Accessories",
                    Description = "Desk tools and stationery accessories",
                },
                ["writing-instruments"] = new Category
                {
                    Name = "Writing Instruments",
                    Description = "Pens, pencils, markers, and highlighters",
                },
            };

            var products = new (string Name, string Sku, string ImagePath, decimal UnitPrice, decimal CostPrice, string CategoryKey)[]
            {
                ("Correction Pens", "GD-001", "geometry-drawing-items/correction-pens.webp", 180m, 115m, "geometry-drawing-items"),
                ("Erasers", "GD-002", "geometry-drawing-items/erasers.jpeg", 45m, 28m, "geometry-drawing-items"),
                ("Geometry Boxes", "GD-003", "geometry-drawing-items/geometry-boxes.jpg", 850m, 560m, "geometry-drawing-items"),
                ("Rulers", "GD-004", "geometry-drawing-items/rulers.jpg", 95m, 60m, "geometry-drawing-items"),
                ("Watercolors", "GD-005", "geometry-drawing-items/watercolors.jpeg", 420m, 270m, "geometry-drawing-items"),

                ("Drawing Books", "PP-001", "paper-products/drawing-books.jpg", 160m, 100m, "paper-products"),
                ("Exercise Books 40 Page", "PP-002", "paper-products/exercise-books-40-page.webp", 85m, 52m, "paper-products"),
                ("Exercise Books 160 Page", "PP-003", "paper-products/exercise-books-160-page.jpeg", 220m, 140m, "paper-products"),
                ("Exercise Books 160 Page Premium", "PP-004", "paper-products/exercise-books-160-page.jpg", 245m, 155m, "paper-products"),
                ("Exercise Books 400 Page", "PP-005", "paper-products/exercise-books-400-page.jpg", 480m, 305m, "paper-products"),
                ("Exercise Books 80 Pages", "PP-006", "paper-products/exercise-books-80-pages.jpg", 145m, 90m, "paper-products"),
                ("Graph Papers", "PP-007", "paper-products/graph-papers.jpeg", 95m, 60m, "paper-products"),
                ("Paper Sample Pack", "PP-008", "paper-products/images.jpeg", 140m, 88m, "paper-products"),
                ("Notebooks", "PP-009", "paper-products/notebooks.jpg", 260m, 168m, "paper-products"),
                ("Plain Papers", "PP-010", "paper-products/plain-papers.jpg", 120m, 76m, "paper-products"),
                ("Ruled Papers", "PP-011", "paper-products/ruled-papers.jpeg", 110m, 70m, "paper-products"),
                ("Sticky Notes", "PP-012", "paper-products/sticky-notes.jpg", 135m, 82m, "paper-products"),

                ("Labels & Stickers", "SS-001", "school-supplies/labels-stickers.jpg", 150m, 95m, "school-supplies"),
                ("Lunch Boxes", "SS-002", "school-supplies/lunch-boxes.jpg", 950m, 640m, "school-supplies"),
                ("Pencil Cases", "SS-003", "school-supplies/pencil-cases.webp", 280m, 180m, "school-supplies"),
                ("School Bags", "SS-004", "school-supplies/school-bags.jpeg", 2600m, 1800m, "school-supplies"),
                ("Water Bottles", "SS-005", "school-supplies/water-bottles.jpg", 650m, 420m, "school-supplies"),

                ("Liquid Glue", "TA-001", "tools-accessories/liquid-glue.jpg", 120m, 75m, "tools-accessories"),
                ("Paper Cutters", "TA-002", "tools-accessories/paper-cutters.jpg", 390m, 250m, "tools-accessories"),
                ("Punch Machines", "TA-003", "tools-accessories/punch-machines.jpeg", 520m, 330m, "tools-accessories"),
                ("Rubber Bands", "TA-004", "tools-accessories/rubber-bands.jpeg", 60m, 36m, "tools-accessories"),
                ("Scissors", "TA-005", "tools-accessories/scissors.png", 220m, 140m, "tools-accessories"),
                ("Staple Pins", "TA-006", "tools-accessories/staple-pins.jpeg", 95m, 58m, "tools-accessories"),
                ("Staplers", "TA-007", "tools-accessories/staplers.jpeg", 430m, 275m, "tools-accessories"),
                ("Tape Dispensers", "TA-008", "tools-accessories/tape-dispensers.jpg", 170m, 105m, "tools-accessories"),

                ("Ballpoint Pen", "WI-001", "writing-instruments/ballpoint-pen.jpg", 60m, 36m, "writing-instruments"),
                ("Chalk", "WI-002", "writing-instruments/chalk.jpg", 40m, 24m, "writing-instruments"),
                ("Color Pencils", "WI-003", "writing-instruments/color-pencils.jpg", 280m, 180m, "writing-instruments"),
                ("Colored Pens", "WI-004", "writing-instruments/colored-pens.jpg", 320m, 205m, "writing-instruments"),
                ("Gel Pen", "WI-005", "writing-instruments/gel-pen.jpg", 95m, 58m, "writing-instruments"),
                ("Highlighters", "WI-006", "writing-instruments/highlighters.jpg", 180m, 110m, "writing-instruments"),
                ("Highlighters Pack", "WI-007", "writing-instruments/highlighters.png", 240m, 150m, "writing-instruments"),
                ("Notebook Set", "WI-008", "writing-instruments/notebooks.jpg", 300m, 195m, "writing-instruments"),
                ("Pencil", "WI-009", "writing-instruments/pencil.jpg", 50m, 30m, "writing-instruments"),
                ("Permanent Markers", "WI-010", "writing-instruments/permanent-markers.jpg", 170m, 108m, "writing-instruments"),
                ("Whiteboard Markers", "WI-011", "writing-instruments/whiteboard-markers.jpg", 160m, 102m, "writing-instruments"),
            };

            foreach (var (name, sku, imagePath, unitPrice, costPrice, categoryKey) in products)
            {
                var category = categories[categoryKey];
                var product = new Product
                {
                    Name = name,
                    Sku = sku,
                    ImageUrl = $"/stationery/{imagePath}",
                    UnitPrice = unitPrice,
                    CostPrice = costPrice,
                    Category = category,
                };

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
                ReceiptFooter = "Thank you for shopping with us.",
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
