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
                new() { Name = "Ceylon Tea 100g", Barcode = "4790001000010", Sku = "TEA-100", UnitPrice = 850m, CostPrice = 640m, Category = groceries },
                new() { Name = "Sugar 1kg", Barcode = "4790001000027", Sku = "SGR-1KG", UnitPrice = 310m, CostPrice = 260m, Category = groceries },
                new() { Name = "Milk Powder 400g", Barcode = "4790001000034", Sku = "MLK-400", UnitPrice = 1490m, CostPrice = 1290m, Category = groceries },
                new() { Name = "Rice 5kg", Barcode = "4790001000041", Sku = "RCE-5KG", UnitPrice = 1280m, CostPrice = 1090m, Category = groceries },
                new() { Name = "Bath Soap", Barcode = "4790001000058", Sku = "SOAP-01", UnitPrice = 220m, CostPrice = 170m, Category = personalCare },
                new() { Name = "Shampoo 180ml", Barcode = "4790001000065", Sku = "SHMP-180", UnitPrice = 690m, CostPrice = 520m, Category = personalCare },
                new() { Name = "Toothpaste 120g", Barcode = "4790001000072", Sku = "TP-120", UnitPrice = 480m, CostPrice = 360m, Category = personalCare },
                new() { Name = "Notebook A5", Barcode = "4790001000089", Sku = "NB-A5", UnitPrice = 240m, CostPrice = 140m, Category = books },
                new() { Name = "Ball Pen Blue", Barcode = "4790001000096", Sku = "PEN-BLU", UnitPrice = 90m, CostPrice = 45m, Category = books },
                new() { Name = "Story Book Grade 5", Barcode = "4790001000102", Sku = "BK-G5", UnitPrice = 1250m, CostPrice = 980m, Category = books },
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

        if (!dbContext.Roles.Any())
        {
            var roles = new[]
            {
                new AppRole { Code = SmartPosRoles.Owner, Name = "Owner" },
                new AppRole { Code = SmartPosRoles.Manager, Name = "Manager" },
                new AppRole { Code = SmartPosRoles.Cashier, Name = "Cashier" }
            };
            dbContext.Roles.AddRange(roles);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        if (!dbContext.Users.Any())
        {
            var roleByCode = await dbContext.Roles
                .ToDictionaryAsync(x => x.Code.ToLowerInvariant(), cancellationToken);

            var owner = new AppUser
            {
                Username = "owner",
                FullName = "Store Owner",
                PasswordHash = string.Empty,
                IsActive = true
            };
            owner.PasswordHash = PasswordHashing.HashPassword(owner, "owner123");

            var manager = new AppUser
            {
                Username = "manager",
                FullName = "Store Manager",
                PasswordHash = string.Empty,
                IsActive = true
            };
            manager.PasswordHash = PasswordHashing.HashPassword(manager, "manager123");

            var cashier = new AppUser
            {
                Username = "cashier",
                FullName = "Store Cashier",
                PasswordHash = string.Empty,
                IsActive = true
            };
            cashier.PasswordHash = PasswordHashing.HashPassword(cashier, "cashier123");

            dbContext.Users.AddRange(owner, manager, cashier);
            await dbContext.SaveChangesAsync(cancellationToken);

            var userRoles = new[]
            {
                new UserRole { UserId = owner.Id, RoleId = roleByCode[SmartPosRoles.Owner].Id, User = null!, Role = null! },
                new UserRole { UserId = manager.Id, RoleId = roleByCode[SmartPosRoles.Manager].Id, User = null!, Role = null! },
                new UserRole { UserId = cashier.Id, RoleId = roleByCode[SmartPosRoles.Cashier].Id, User = null!, Role = null! }
            };
            dbContext.UserRoles.AddRange(userRoles);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
