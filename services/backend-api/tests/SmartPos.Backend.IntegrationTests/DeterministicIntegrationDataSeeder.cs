using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

internal static class DeterministicIntegrationDataSeeder
{
    public static async Task SeedAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var shop = await dbContext.Shops
            .FirstAsync(x => x.Code == "default", cancellationToken);

        var manager = await dbContext.Users
            .FirstAsync(x => x.Username == "manager", cancellationToken);
        var cashier = await dbContext.Users
            .FirstAsync(x => x.Username == "cashier", cancellationToken);

        var category = await EnsureCategoryAsync(dbContext, shop.Id, "Stationery", cancellationToken);
        var supplier = await EnsureSupplierAsync(dbContext, shop.Id, "Acme Traders", cancellationToken);

        var ruler = await EnsureProductAsync(
            dbContext,
            shop.Id,
            category.Id,
            name: "Acrylic Ruler 30cm",
            sku: "RULER-30CM",
            barcode: "RULER-30CM-001",
            unitPrice: 100m,
            costPrice: 60m,
            isSerialTracked: false,
            warrantyMonths: 0,
            isBatchTracked: false,
            expiryAlertDays: 30,
            cancellationToken);

        var pencils = await EnsureProductAsync(
            dbContext,
            shop.Id,
            category.Id,
            name: "Color Pencils",
            sku: "PENCIL-12",
            barcode: "PENCIL-12-001",
            unitPrice: 280m,
            costPrice: 180m,
            isSerialTracked: false,
            warrantyMonths: 0,
            isBatchTracked: false,
            expiryAlertDays: 30,
            cancellationToken);

        var pen = await EnsureProductAsync(
            dbContext,
            shop.Id,
            category.Id,
            name: "Ballpoint Pen",
            sku: "PEN-001",
            barcode: "PEN-0001",
            unitPrice: 150m,
            costPrice: 110m,
            isSerialTracked: false,
            warrantyMonths: 0,
            isBatchTracked: false,
            expiryAlertDays: 30,
            cancellationToken);

        var tea = await EnsureProductAsync(
            dbContext,
            shop.Id,
            category.Id,
            name: "Ceylon Tea 100g",
            sku: "TEA-100G",
            barcode: "TEA-100G-001",
            unitPrice: 900m,
            costPrice: 650m,
            isSerialTracked: false,
            warrantyMonths: 0,
            isBatchTracked: false,
            expiryAlertDays: 30,
            cancellationToken);

        await EnsureInventoryAsync(dbContext, shop.Id, ruler, initialQuantity: 120m, reorderLevel: 20m, cancellationToken);
        await EnsureInventoryAsync(dbContext, shop.Id, pencils, initialQuantity: 35m, reorderLevel: 12m, cancellationToken);
        await EnsureInventoryAsync(dbContext, shop.Id, pen, initialQuantity: 8m, reorderLevel: 20m, cancellationToken);
        await EnsureInventoryAsync(dbContext, shop.Id, tea, initialQuantity: 40m, reorderLevel: 10m, cancellationToken);

        await EnsureProductSupplierAsync(dbContext, shop.Id, ruler, supplier, "RULER-30CM", "Acrylic Ruler 30cm", isPreferred: true, lastPurchasePrice: 60m, cancellationToken);
        await EnsureProductSupplierAsync(dbContext, shop.Id, pencils, supplier, "PENCIL-12", "Color Pencils", isPreferred: true, lastPurchasePrice: 180m, cancellationToken);
        await EnsureProductSupplierAsync(dbContext, shop.Id, pen, supplier, "PEN-001", "Ballpoint Pen", isPreferred: true, lastPurchasePrice: 110m, cancellationToken);
        await EnsureProductSupplierAsync(dbContext, shop.Id, tea, supplier, "TEA-100G", "Ceylon Tea 100g", isPreferred: true, lastPurchasePrice: 650m, cancellationToken);

        await EnsurePurchaseBillAsync(
            dbContext,
            shop.Id,
            supplier,
            manager,
            invoiceNumber: "INV-ACME-2026-0401",
            invoiceDateUtc: now.AddDays(-10),
            items:
            [
                new PurchaseSeedLine(pencils, "Color Pencils", 180m, 14m),
                new PurchaseSeedLine(ruler, "Acrylic Ruler 30cm", 60m, 12m),
                new PurchaseSeedLine(pen, "Ballpoint Pen", 110m, 40m),
                new PurchaseSeedLine(tea, "Ceylon Tea 100g", 620m, 18m)
            ],
            cancellationToken);

        await EnsurePurchaseBillAsync(
            dbContext,
            shop.Id,
            supplier,
            manager,
            invoiceNumber: "INV-ACME-2026-0409",
            invoiceDateUtc: now.AddDays(-4),
            items:
            [
                new PurchaseSeedLine(pencils, "Color Pencils", 180m, 10m),
                new PurchaseSeedLine(ruler, "Acrylic Ruler 30cm", 62m, 8m),
                new PurchaseSeedLine(pen, "Ballpoint Pen", 112m, 20m),
                new PurchaseSeedLine(tea, "Ceylon Tea 100g", 640m, 12m)
            ],
            cancellationToken);

        await EnsureCompletedSaleAsync(
            dbContext,
            shop.Id,
            cashier,
            saleNumber: "IT-SALE-0001",
            occurredAtUtc: now.AddHours(-2),
            items:
            [
                new SaleSeedLine(pencils, 1m, 280m),
                new SaleSeedLine(ruler, 1m, 100m),
                new SaleSeedLine(pen, 1m, 150m)
            ],
            cancellationToken);

        await EnsureCompletedSaleAsync(
            dbContext,
            shop.Id,
            cashier,
            saleNumber: "IT-SALE-0002",
            occurredAtUtc: now.AddDays(-2),
            items:
            [
                new SaleSeedLine(ruler, 2m, 100m),
                new SaleSeedLine(tea, 1m, 900m)
            ],
            cancellationToken);

        await EnsureCompletedSaleAsync(
            dbContext,
            shop.Id,
            cashier,
            saleNumber: "IT-SALE-0003",
            occurredAtUtc: now.AddDays(-5),
            items:
            [
                new SaleSeedLine(tea, 2m, 900m),
                new SaleSeedLine(pen, 2m, 150m)
            ],
            cancellationToken);

        await EnsureCompletedSaleAsync(
            dbContext,
            shop.Id,
            cashier,
            saleNumber: "IT-SALE-0004",
            occurredAtUtc: now.AddDays(-10),
            items:
            [
                new SaleSeedLine(ruler, 3m, 100m)
            ],
            cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static async Task<Category> EnsureCategoryAsync(
        SmartPosDbContext dbContext,
        Guid shopId,
        string name,
        CancellationToken cancellationToken)
    {
        var category = await dbContext.Categories
            .FirstOrDefaultAsync(x => x.StoreId == shopId && x.Name == name, cancellationToken);
        if (category is not null)
        {
            return category;
        }

        category = new Category
        {
            StoreId = shopId,
            Name = name,
            Description = "Integration test category",
            IsActive = true,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };
        dbContext.Categories.Add(category);
        await dbContext.SaveChangesAsync(cancellationToken);
        return category;
    }

    private static async Task<Supplier> EnsureSupplierAsync(
        SmartPosDbContext dbContext,
        Guid shopId,
        string name,
        CancellationToken cancellationToken)
    {
        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(x => x.StoreId == shopId && x.Name == name, cancellationToken);
        if (supplier is not null)
        {
            return supplier;
        }

        supplier = new Supplier
        {
            StoreId = shopId,
            Name = name,
            CompanyName = "Integration Procurement",
            CompanyPhone = "+94 11 000 0000",
            Phone = "+94 11 000 0000",
            Address = "Integration Test Road, Colombo",
            IsActive = true,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };
        dbContext.Suppliers.Add(supplier);
        await dbContext.SaveChangesAsync(cancellationToken);
        return supplier;
    }

    private static async Task<Product> EnsureProductAsync(
        SmartPosDbContext dbContext,
        Guid shopId,
        Guid categoryId,
        string name,
        string sku,
        string barcode,
        decimal unitPrice,
        decimal costPrice,
        bool isSerialTracked,
        int warrantyMonths,
        bool isBatchTracked,
        int expiryAlertDays,
        CancellationToken cancellationToken)
    {
        var product = await dbContext.Products
            .Include(x => x.Inventory)
            .FirstOrDefaultAsync(x => x.StoreId == shopId && x.Name == name, cancellationToken);
        if (product is not null)
        {
            product.CategoryId = categoryId;
            product.Sku = sku;
            product.Barcode = barcode;
            product.UnitPrice = unitPrice;
            product.CostPrice = costPrice;
            product.IsActive = true;
            product.IsSerialTracked = isSerialTracked;
            product.WarrantyMonths = warrantyMonths;
            product.IsBatchTracked = isBatchTracked;
            product.ExpiryAlertDays = expiryAlertDays;
            return product;
        }

        product = new Product
        {
            StoreId = shopId,
            CategoryId = categoryId,
            Name = name,
            Sku = sku,
            Barcode = barcode,
            UnitPrice = unitPrice,
            CostPrice = costPrice,
            IsActive = true,
            IsSerialTracked = isSerialTracked,
            WarrantyMonths = warrantyMonths,
            IsBatchTracked = isBatchTracked,
            ExpiryAlertDays = expiryAlertDays,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };
        dbContext.Products.Add(product);
        await dbContext.SaveChangesAsync(cancellationToken);
        return product;
    }

    private static async Task EnsureInventoryAsync(
        SmartPosDbContext dbContext,
        Guid shopId,
        Product product,
        decimal initialQuantity,
        decimal reorderLevel,
        CancellationToken cancellationToken)
    {
        var inventory = await dbContext.Inventory
            .FirstOrDefaultAsync(x => x.ProductId == product.Id, cancellationToken);
        if (inventory is null)
        {
            inventory = new InventoryRecord
            {
                StoreId = shopId,
                ProductId = product.Id,
                Product = product,
                InitialStockQuantity = initialQuantity,
                QuantityOnHand = initialQuantity,
                ReorderLevel = reorderLevel,
                SafetyStock = reorderLevel / 2m,
                TargetStockLevel = reorderLevel * 2m,
                AllowNegativeStock = false,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            };
            dbContext.Inventory.Add(inventory);
            return;
        }

        inventory.StoreId = shopId;
        inventory.InitialStockQuantity = initialQuantity;
        inventory.QuantityOnHand = initialQuantity;
        inventory.ReorderLevel = reorderLevel;
        inventory.SafetyStock = reorderLevel / 2m;
        inventory.TargetStockLevel = reorderLevel * 2m;
        inventory.AllowNegativeStock = false;
        inventory.UpdatedAtUtc = DateTimeOffset.UtcNow;
    }

    private static async Task EnsureProductSupplierAsync(
        SmartPosDbContext dbContext,
        Guid shopId,
        Product product,
        Supplier supplier,
        string supplierSku,
        string supplierItemName,
        bool isPreferred,
        decimal lastPurchasePrice,
        CancellationToken cancellationToken)
    {
        var mapping = await dbContext.ProductSuppliers
            .FirstOrDefaultAsync(x => x.ProductId == product.Id && x.SupplierId == supplier.Id, cancellationToken);
        if (mapping is null)
        {
            mapping = new ProductSupplier
            {
                StoreId = shopId,
                ProductId = product.Id,
                SupplierId = supplier.Id,
                Product = product,
                Supplier = supplier,
                SupplierSku = supplierSku,
                SupplierItemName = supplierItemName,
                IsPreferred = isPreferred,
                LastPurchasePrice = lastPurchasePrice,
                IsActive = true,
                CreatedAtUtc = DateTimeOffset.UtcNow
            };
            dbContext.ProductSuppliers.Add(mapping);
            return;
        }

        mapping.StoreId = shopId;
        mapping.SupplierSku = supplierSku;
        mapping.SupplierItemName = supplierItemName;
        mapping.IsPreferred = isPreferred;
        mapping.LastPurchasePrice = lastPurchasePrice;
        mapping.IsActive = true;
        mapping.UpdatedAtUtc = DateTimeOffset.UtcNow;
    }

    private static async Task EnsurePurchaseBillAsync(
        SmartPosDbContext dbContext,
        Guid shopId,
        Supplier supplier,
        AppUser manager,
        string invoiceNumber,
        DateTimeOffset invoiceDateUtc,
        IReadOnlyCollection<PurchaseSeedLine> items,
        CancellationToken cancellationToken)
    {
        var bill = await dbContext.PurchaseBills
            .Include(x => x.Items)
            .FirstOrDefaultAsync(x => x.StoreId == shopId && x.InvoiceNumber == invoiceNumber, cancellationToken);
        if (bill is null)
        {
            bill = new PurchaseBill
            {
                StoreId = shopId,
                SupplierId = supplier.Id,
                Supplier = supplier,
                CreatedByUserId = manager.Id,
                CreatedByUser = manager,
                InvoiceNumber = invoiceNumber,
                InvoiceDateUtc = invoiceDateUtc,
                Currency = "LKR",
                Subtotal = items.Sum(x => x.LineTotal),
                DiscountTotal = 0m,
                TaxTotal = 0m,
                GrandTotal = items.Sum(x => x.LineTotal),
                SourceType = "manual",
                OcrConfidence = null,
                CreatedAtUtc = invoiceDateUtc
            };
            dbContext.PurchaseBills.Add(bill);
        }
        else
        {
            bill.SupplierId = supplier.Id;
            bill.CreatedByUserId = manager.Id;
            bill.InvoiceDateUtc = invoiceDateUtc;
            bill.Subtotal = items.Sum(x => x.LineTotal);
            bill.GrandTotal = items.Sum(x => x.LineTotal);
        }

        var existingItems = bill.Items.ToDictionary(x => x.ProductId, x => x);
        foreach (var item in items)
        {
            if (!existingItems.TryGetValue(item.Product.Id, out var billItem))
            {
                billItem = new PurchaseBillItem
                {
                    PurchaseBill = bill,
                    Product = item.Product,
                    ProductId = item.Product.Id,
                    ProductNameSnapshot = item.ProductNameSnapshot,
                    Quantity = item.Quantity,
                    UnitCost = item.UnitCost,
                    TaxAmount = 0m,
                    LineTotal = item.LineTotal,
                    CreatedAtUtc = invoiceDateUtc
                };
                dbContext.PurchaseBillItems.Add(billItem);
                continue;
            }

            billItem.ProductNameSnapshot = item.ProductNameSnapshot;
            billItem.Quantity = item.Quantity;
            billItem.UnitCost = item.UnitCost;
            billItem.LineTotal = item.LineTotal;
        }
    }

    private static async Task EnsureCompletedSaleAsync(
        SmartPosDbContext dbContext,
        Guid shopId,
        AppUser cashier,
        string saleNumber,
        DateTimeOffset occurredAtUtc,
        IReadOnlyCollection<SaleSeedLine> items,
        CancellationToken cancellationToken)
    {
        var sale = await dbContext.Sales
            .Include(x => x.Items)
            .Include(x => x.Payments)
            .FirstOrDefaultAsync(x => x.StoreId == shopId && x.SaleNumber == saleNumber, cancellationToken);
        var grandTotal = items.Sum(x => x.LineTotal);
        if (sale is null)
        {
            sale = new Sale
            {
                StoreId = shopId,
                SaleNumber = saleNumber,
                Status = SaleStatus.Completed,
                Subtotal = grandTotal,
                DiscountTotal = 0m,
                TaxTotal = 0m,
                GrandTotal = grandTotal,
                CreatedByUserId = cashier.Id,
                CreatedAtUtc = occurredAtUtc,
                CompletedAtUtc = occurredAtUtc
            };
            dbContext.Sales.Add(sale);
        }
        else
        {
            sale.Status = SaleStatus.Completed;
            sale.Subtotal = grandTotal;
            sale.GrandTotal = grandTotal;
            sale.CreatedByUserId = cashier.Id;
            sale.CreatedAtUtc = occurredAtUtc;
            sale.CompletedAtUtc = occurredAtUtc;
        }

        var existingItems = sale.Items.ToDictionary(x => x.ProductId, x => x);
        foreach (var item in items)
        {
            if (!existingItems.TryGetValue(item.Product.Id, out var saleItem))
            {
                saleItem = new SaleItem
                {
                    Sale = sale,
                    Product = item.Product,
                    ProductId = item.Product.Id,
                    ProductNameSnapshot = item.Product.Name,
                    UnitPrice = item.UnitPrice,
                    Quantity = item.Quantity,
                    DiscountAmount = 0m,
                    TaxAmount = 0m,
                    LineTotal = item.LineTotal
                };
                dbContext.SaleItems.Add(saleItem);
                continue;
            }

            saleItem.ProductNameSnapshot = item.Product.Name;
            saleItem.UnitPrice = item.UnitPrice;
            saleItem.Quantity = item.Quantity;
            saleItem.LineTotal = item.LineTotal;
        }

        var payment = sale.Payments.FirstOrDefault(x => !x.IsReversal);
        if (payment is null)
        {
            payment = new Payment
            {
                Sale = sale,
                SaleId = sale.Id,
                Method = PaymentMethod.Cash,
                Amount = grandTotal,
                Currency = "LKR",
                CreatedAtUtc = occurredAtUtc
            };
            dbContext.Payments.Add(payment);
        }
        else
        {
            payment.Method = PaymentMethod.Cash;
            payment.Amount = grandTotal;
            payment.CreatedAtUtc = occurredAtUtc;
        }
    }

    private sealed record PurchaseSeedLine(
        Product Product,
        string ProductNameSnapshot,
        decimal UnitCost,
        decimal Quantity)
    {
        public decimal LineTotal => UnitCost * Quantity;
    }

    private sealed record SaleSeedLine(
        Product Product,
        decimal Quantity,
        decimal UnitPrice)
    {
        public decimal LineTotal => Quantity * UnitPrice;
    }
}
