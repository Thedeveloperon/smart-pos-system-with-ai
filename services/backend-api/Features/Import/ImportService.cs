using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Import;

public sealed class ImportService(
    SmartPosDbContext dbContext,
    StockMovementHelper stockMovementHelper,
    IHttpContextAccessor httpContextAccessor)
{
    private const string DuplicateStrategySkip = "skip";
    private const string DuplicateStrategyUpdate = "update";
    private const string CustomerCodePrefix = "C-";

    public async Task<ImportSummary> BulkImportBrandsAsync(
        BulkImportBrandsRequest request,
        CancellationToken cancellationToken)
    {
        var duplicateStrategy = NormalizeDuplicateStrategy(request.DuplicateStrategy);
        var rows = request.Rows;
        var result = CreateSummary(rows.Count);
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;

        var existingBrands = await dbContext.Brands
            .Where(x => !storeId.HasValue || x.StoreId == storeId.Value)
            .ToListAsync(cancellationToken);

        var brandByName = existingBrands
            .Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .GroupBy(x => NormalizeLookupKey(x.Name))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);

        var brandByCode = existingBrands
            .Where(x => !string.IsNullOrWhiteSpace(x.Code))
            .GroupBy(x => NormalizeLookupKey(x.Code!))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);

        foreach (var row in rows)
        {
            var rowIndex = row.RowIndex;
            var name = NormalizeOptional(row.Name);
            if (string.IsNullOrWhiteSpace(name))
            {
                AddError(result, rowIndex, "Brand name is required.");
                continue;
            }

            var nameKey = NormalizeLookupKey(name);
            var code = NormalizeOptional(row.Code);
            var codeKey = string.IsNullOrWhiteSpace(code) ? null : NormalizeLookupKey(code);

            if (brandByName.TryGetValue(nameKey, out var existing))
            {
                if (duplicateStrategy == DuplicateStrategySkip)
                {
                    AddSkipped(result, rowIndex, existing.Id, existing.Name);
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(codeKey) &&
                    brandByCode.TryGetValue(codeKey, out var codeOwner) &&
                    codeOwner.Id != existing.Id)
                {
                    AddError(result, rowIndex, $"Brand code '{code}' already exists.");
                    continue;
                }

                var previousCodeKey = string.IsNullOrWhiteSpace(existing.Code)
                    ? null
                    : NormalizeLookupKey(existing.Code);

                existing.Code = code;
                existing.Description = NormalizeOptional(row.Description);
                existing.IsActive = row.IsActive;
                existing.UpdatedAtUtc = now;

                if (!string.IsNullOrWhiteSpace(previousCodeKey))
                {
                    brandByCode.Remove(previousCodeKey);
                }

                if (!string.IsNullOrWhiteSpace(codeKey))
                {
                    brandByCode[codeKey] = existing;
                }

                AddUpdated(result, rowIndex, existing.Id, existing.Name);
                continue;
            }

            if (!string.IsNullOrWhiteSpace(codeKey) && brandByCode.ContainsKey(codeKey))
            {
                AddError(result, rowIndex, $"Brand code '{code}' already exists.");
                continue;
            }

            var brand = new Brand
            {
                StoreId = storeId,
                Name = name,
                Code = code,
                Description = NormalizeOptional(row.Description),
                IsActive = row.IsActive,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            dbContext.Brands.Add(brand);
            brandByName[nameKey] = brand;
            if (!string.IsNullOrWhiteSpace(codeKey))
            {
                brandByCode[codeKey] = brand;
            }

            AddInserted(result, rowIndex, brand.Id, brand.Name);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<ImportSummary> BulkImportCategoriesAsync(
        BulkImportCategoriesRequest request,
        CancellationToken cancellationToken)
    {
        var duplicateStrategy = NormalizeDuplicateStrategy(request.DuplicateStrategy);
        var rows = request.Rows;
        var result = CreateSummary(rows.Count);
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;

        var existingCategories = await dbContext.Categories
            .Where(x => !storeId.HasValue || x.StoreId == storeId.Value)
            .ToListAsync(cancellationToken);

        var categoryByName = existingCategories
            .Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .GroupBy(x => NormalizeLookupKey(x.Name))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);

        foreach (var row in rows)
        {
            var rowIndex = row.RowIndex;
            var name = NormalizeOptional(row.Name);
            if (string.IsNullOrWhiteSpace(name))
            {
                AddError(result, rowIndex, "Category name is required.");
                continue;
            }

            var nameKey = NormalizeLookupKey(name);
            if (categoryByName.TryGetValue(nameKey, out var existing))
            {
                if (duplicateStrategy == DuplicateStrategySkip)
                {
                    AddSkipped(result, rowIndex, existing.Id, existing.Name);
                    continue;
                }

                existing.Description = NormalizeOptional(row.Description);
                existing.IsActive = row.IsActive;
                existing.UpdatedAtUtc = now;
                AddUpdated(result, rowIndex, existing.Id, existing.Name);
                continue;
            }

            var category = new Category
            {
                StoreId = storeId,
                Name = name,
                Description = NormalizeOptional(row.Description),
                IsActive = row.IsActive,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            dbContext.Categories.Add(category);
            categoryByName[nameKey] = category;
            AddInserted(result, rowIndex, category.Id, category.Name);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<ImportSummary> BulkImportProductsAsync(
        BulkImportProductsRequest request,
        CancellationToken cancellationToken)
    {
        var duplicateStrategy = NormalizeDuplicateStrategy(request.DuplicateStrategy);
        var rows = request.Rows;
        var result = CreateSummary(rows.Count);
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;

        var existingProducts = await dbContext.Products
            .Include(x => x.Inventory)
            .Where(x => !storeId.HasValue || x.StoreId == storeId.Value)
            .ToListAsync(cancellationToken);

        var productsBySku = existingProducts
            .Where(x => !string.IsNullOrWhiteSpace(x.Sku))
            .GroupBy(x => NormalizeLookupKey(x.Sku!))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);

        var productsByName = existingProducts
            .Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .GroupBy(x => NormalizeLookupKey(x.Name))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);

        var productsByBarcode = existingProducts
            .Where(x => !string.IsNullOrWhiteSpace(x.Barcode))
            .GroupBy(x => NormalizeLookupKey(x.Barcode!))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);

        var brandNameToId = await dbContext.Brands
            .AsNoTracking()
            .Where(x => !storeId.HasValue || x.StoreId == storeId.Value)
            .ToDictionaryAsync(x => NormalizeLookupKey(x.Name), x => x.Id, cancellationToken);

        var categoryNameToId = await dbContext.Categories
            .AsNoTracking()
            .Where(x => !storeId.HasValue || x.StoreId == storeId.Value)
            .ToDictionaryAsync(x => NormalizeLookupKey(x.Name), x => x.Id, cancellationToken);

        var pendingInitialStock = new List<(Guid ProductId, Guid? StoreId, decimal Quantity)>();

        foreach (var row in rows)
        {
            var rowIndex = row.RowIndex;
            var name = NormalizeOptional(row.Name);
            if (string.IsNullOrWhiteSpace(name))
            {
                AddError(result, rowIndex, "Product name is required.");
                continue;
            }

            if (row.UnitPrice < 0m || row.CostPrice < 0m || row.InitialStockQuantity < 0m ||
                row.ReorderLevel < 0m || row.SafetyStock < 0m || row.TargetStockLevel < 0m)
            {
                AddError(result, rowIndex, "Price and quantity fields cannot be negative.");
                continue;
            }

            var sku = NormalizeOptional(row.Sku);
            var barcode = NormalizeOptional(row.Barcode);
            var skuKey = string.IsNullOrWhiteSpace(sku) ? null : NormalizeLookupKey(sku);
            var barcodeKey = string.IsNullOrWhiteSpace(barcode) ? null : NormalizeLookupKey(barcode);
            var nameKey = NormalizeLookupKey(name);

            Guid? categoryId = null;
            Guid? brandId = null;

            var categoryName = NormalizeOptional(row.CategoryName);
            if (!string.IsNullOrWhiteSpace(categoryName))
            {
                if (!categoryNameToId.TryGetValue(NormalizeLookupKey(categoryName), out var resolvedCategoryId))
                {
                    AddError(result, rowIndex, $"Category '{categoryName}' was not found.");
                    continue;
                }

                categoryId = resolvedCategoryId;
            }

            var brandName = NormalizeOptional(row.BrandName);
            if (!string.IsNullOrWhiteSpace(brandName))
            {
                if (!brandNameToId.TryGetValue(NormalizeLookupKey(brandName), out var resolvedBrandId))
                {
                    AddError(result, rowIndex, $"Brand '{brandName}' was not found.");
                    continue;
                }

                brandId = resolvedBrandId;
            }

            Product? existing = null;
            if (!string.IsNullOrWhiteSpace(skuKey) && productsBySku.TryGetValue(skuKey, out var bySku))
            {
                existing = bySku;
            }
            else if (productsByName.TryGetValue(nameKey, out var byName))
            {
                existing = byName;
            }

            if (existing is not null)
            {
                if (duplicateStrategy == DuplicateStrategySkip)
                {
                    AddSkipped(result, rowIndex, existing.Id, existing.Name);
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(skuKey) &&
                    productsBySku.TryGetValue(skuKey, out var skuOwner) &&
                    skuOwner.Id != existing.Id)
                {
                    AddError(result, rowIndex, $"SKU '{sku}' already exists.");
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(barcodeKey) &&
                    productsByBarcode.TryGetValue(barcodeKey, out var barcodeOwner) &&
                    barcodeOwner.Id != existing.Id)
                {
                    AddError(result, rowIndex, $"Barcode '{barcode}' already exists.");
                    continue;
                }

                var previousSkuKey = string.IsNullOrWhiteSpace(existing.Sku) ? null : NormalizeLookupKey(existing.Sku);
                var previousBarcodeKey = string.IsNullOrWhiteSpace(existing.Barcode) ? null : NormalizeLookupKey(existing.Barcode);
                var previousNameKey = NormalizeLookupKey(existing.Name);

                existing.Name = name;
                existing.Sku = sku;
                existing.Barcode = barcode;
                existing.CategoryId = categoryId;
                existing.BrandId = brandId;
                existing.UnitPrice = RoundMoney(row.UnitPrice);
                existing.CostPrice = RoundMoney(row.CostPrice);
                existing.IsActive = row.IsActive;
                existing.UpdatedAtUtc = now;

                if (existing.Inventory is null)
                {
                    existing.Inventory = new InventoryRecord
                    {
                        Product = existing,
                        StoreId = existing.StoreId,
                        InitialStockQuantity = 0m,
                        QuantityOnHand = 0m,
                        ReorderLevel = 0m,
                        SafetyStock = 0m,
                        TargetStockLevel = 0m,
                        AllowNegativeStock = true,
                        UpdatedAtUtc = now
                    };
                }

                var targetStockLevel = row.TargetStockLevel > 0m ? row.TargetStockLevel : row.ReorderLevel;
                existing.Inventory.InitialStockQuantity = RoundQuantity(row.InitialStockQuantity);
                existing.Inventory.QuantityOnHand = RoundQuantity(row.InitialStockQuantity);
                existing.Inventory.ReorderLevel = RoundQuantity(row.ReorderLevel);
                existing.Inventory.SafetyStock = RoundQuantity(row.SafetyStock);
                existing.Inventory.TargetStockLevel = RoundQuantity(Math.Max(targetStockLevel, row.ReorderLevel));
                existing.Inventory.AllowNegativeStock = row.AllowNegativeStock;
                existing.Inventory.UpdatedAtUtc = now;

                if (!string.IsNullOrWhiteSpace(previousSkuKey))
                {
                    productsBySku.Remove(previousSkuKey);
                }

                if (!string.IsNullOrWhiteSpace(previousBarcodeKey))
                {
                    productsByBarcode.Remove(previousBarcodeKey);
                }

                productsByName.Remove(previousNameKey);
                productsByName[nameKey] = existing;
                if (!string.IsNullOrWhiteSpace(skuKey))
                {
                    productsBySku[skuKey] = existing;
                }

                if (!string.IsNullOrWhiteSpace(barcodeKey))
                {
                    productsByBarcode[barcodeKey] = existing;
                }

                AddUpdated(result, rowIndex, existing.Id, existing.Name);
                continue;
            }

            if (!string.IsNullOrWhiteSpace(skuKey) && productsBySku.ContainsKey(skuKey))
            {
                AddError(result, rowIndex, $"SKU '{sku}' already exists.");
                continue;
            }

            if (!string.IsNullOrWhiteSpace(barcodeKey) && productsByBarcode.ContainsKey(barcodeKey))
            {
                AddError(result, rowIndex, $"Barcode '{barcode}' already exists.");
                continue;
            }

            var normalizedTargetStock = row.TargetStockLevel > 0m
                ? row.TargetStockLevel
                : row.ReorderLevel;
            normalizedTargetStock = Math.Max(normalizedTargetStock, row.ReorderLevel);

            var product = new Product
            {
                StoreId = storeId,
                Name = name,
                Sku = sku,
                Barcode = barcode,
                CategoryId = categoryId,
                BrandId = brandId,
                UnitPrice = RoundMoney(row.UnitPrice),
                CostPrice = RoundMoney(row.CostPrice),
                IsActive = row.IsActive,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            var inventory = new InventoryRecord
            {
                Product = product,
                StoreId = storeId,
                InitialStockQuantity = RoundQuantity(row.InitialStockQuantity),
                QuantityOnHand = RoundQuantity(row.InitialStockQuantity),
                ReorderLevel = RoundQuantity(row.ReorderLevel),
                SafetyStock = RoundQuantity(row.SafetyStock),
                TargetStockLevel = RoundQuantity(normalizedTargetStock),
                AllowNegativeStock = row.AllowNegativeStock,
                UpdatedAtUtc = now
            };

            dbContext.Products.Add(product);
            dbContext.Inventory.Add(inventory);
            productsByName[nameKey] = product;
            if (!string.IsNullOrWhiteSpace(skuKey))
            {
                productsBySku[skuKey] = product;
            }

            if (!string.IsNullOrWhiteSpace(barcodeKey))
            {
                productsByBarcode[barcodeKey] = product;
            }

            if (inventory.InitialStockQuantity > 0m)
            {
                pendingInitialStock.Add((product.Id, product.StoreId, inventory.InitialStockQuantity));
            }

            AddInserted(result, rowIndex, product.Id, product.Name);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        foreach (var movement in pendingInitialStock)
        {
            await stockMovementHelper.RecordMovementAsync(
                storeId: movement.StoreId,
                productId: movement.ProductId,
                type: StockMovementType.Adjustment,
                quantityChange: movement.Quantity,
                refType: StockMovementRef.Adjustment,
                refId: movement.ProductId,
                batchId: null,
                serialNumber: null,
                reason: "initial_stock",
                userId: await GetCurrentUserIdAsync(),
                cancellationToken: cancellationToken,
                quantityBeforeOverride: 0m,
                updateInventory: false);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<ImportSummary> BulkImportCustomersAsync(
        BulkImportCustomersRequest request,
        CancellationToken cancellationToken)
    {
        var duplicateStrategy = NormalizeDuplicateStrategy(request.DuplicateStrategy);
        var rows = request.Rows;
        var result = CreateSummary(rows.Count);
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;

        var existingCustomers = await dbContext.Customers
            .Where(x => !storeId.HasValue || x.StoreId == storeId.Value)
            .ToListAsync(cancellationToken);

        var byPhone = existingCustomers
            .Where(x => !string.IsNullOrWhiteSpace(x.Phone))
            .GroupBy(x => NormalizeLookupKey(x.Phone!))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);

        var byEmail = existingCustomers
            .Where(x => !string.IsNullOrWhiteSpace(x.Email))
            .GroupBy(x => NormalizeLookupKey(x.Email!))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);

        var byName = existingCustomers
            .Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .GroupBy(x => NormalizeLookupKey(x.Name))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);

        var codeOwnerByKey = existingCustomers
            .Where(x => !string.IsNullOrWhiteSpace(x.Code))
            .GroupBy(x => NormalizeLookupKey(x.Code!))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.Ordinal);

        var usedCodes = new HashSet<string>(
            existingCustomers
                .Where(x => !string.IsNullOrWhiteSpace(x.Code))
                .Select(x => NormalizeLookupKey(x.Code!)),
            StringComparer.Ordinal);

        var nextCustomerNumber = existingCustomers
            .Select(x => ParseCustomerCodeNumber(x.Code))
            .Where(x => x.HasValue)
            .Select(x => x!.Value)
            .DefaultIfEmpty(0)
            .Max() + 1;

        foreach (var row in rows)
        {
            var rowIndex = row.RowIndex;
            var name = NormalizeOptional(row.Name);
            if (string.IsNullOrWhiteSpace(name))
            {
                AddError(result, rowIndex, "Customer name is required.");
                continue;
            }

            if (row.CreditLimit < 0m)
            {
                AddError(result, rowIndex, "Credit limit cannot be negative.");
                continue;
            }

            var phone = NormalizeOptional(row.Phone);
            var email = NormalizeOptional(row.Email);
            var code = NormalizeOptional(row.Code);

            var dedupeType = GetCustomerDedupeType(phone, email);
            var dedupeKey = dedupeType switch
            {
                CustomerDedupeType.Phone => NormalizeLookupKey(phone!),
                CustomerDedupeType.Email => NormalizeLookupKey(email!),
                _ => NormalizeLookupKey(name),
            };

            Customer? existing = dedupeType switch
            {
                CustomerDedupeType.Phone => byPhone.GetValueOrDefault(dedupeKey),
                CustomerDedupeType.Email => byEmail.GetValueOrDefault(dedupeKey),
                _ => byName.GetValueOrDefault(dedupeKey),
            };

            var parsedDateOfBirth = ParseDateOnly(row.DateOfBirth);
            if (!string.IsNullOrWhiteSpace(row.DateOfBirth) && !parsedDateOfBirth.HasValue)
            {
                AddError(result, rowIndex, "date_of_birth must use YYYY-MM-DD.");
                continue;
            }

            if (existing is not null)
            {
                if (duplicateStrategy == DuplicateStrategySkip)
                {
                    AddSkipped(result, rowIndex, existing.Id, existing.Name);
                    continue;
                }

                var normalizedCode = string.IsNullOrWhiteSpace(code)
                    ? existing.Code
                    : code.ToUpperInvariant();
                var normalizedCodeKey = string.IsNullOrWhiteSpace(normalizedCode)
                    ? null
                    : NormalizeLookupKey(normalizedCode);

                if (!string.IsNullOrWhiteSpace(normalizedCodeKey) &&
                    codeOwnerByKey.TryGetValue(normalizedCodeKey, out var codeOwner) &&
                    codeOwner.Id != existing.Id)
                {
                    AddError(result, rowIndex, $"Customer code '{normalizedCode}' already exists.");
                    continue;
                }

                var oldPhoneKey = string.IsNullOrWhiteSpace(existing.Phone) ? null : NormalizeLookupKey(existing.Phone);
                var oldEmailKey = string.IsNullOrWhiteSpace(existing.Email) ? null : NormalizeLookupKey(existing.Email);
                var oldNameKey = NormalizeLookupKey(existing.Name);
                var oldCodeKey = string.IsNullOrWhiteSpace(existing.Code) ? null : NormalizeLookupKey(existing.Code);

                existing.Name = name;
                existing.Code = normalizedCode;
                existing.Phone = phone;
                existing.Email = email;
                existing.Address = NormalizeOptional(row.Address);
                existing.DateOfBirth = parsedDateOfBirth;
                existing.CreditLimit = RoundMoney(row.CreditLimit);
                existing.Notes = NormalizeOptional(row.Notes);
                existing.IsActive = row.IsActive;
                existing.UpdatedAtUtc = now;

                if (!string.IsNullOrWhiteSpace(oldPhoneKey))
                {
                    byPhone.Remove(oldPhoneKey);
                }

                if (!string.IsNullOrWhiteSpace(oldEmailKey))
                {
                    byEmail.Remove(oldEmailKey);
                }

                byName.Remove(oldNameKey);
                byName[NormalizeLookupKey(existing.Name)] = existing;

                if (!string.IsNullOrWhiteSpace(existing.Phone))
                {
                    byPhone[NormalizeLookupKey(existing.Phone)] = existing;
                }

                if (!string.IsNullOrWhiteSpace(existing.Email))
                {
                    byEmail[NormalizeLookupKey(existing.Email)] = existing;
                }

                if (!string.IsNullOrWhiteSpace(oldCodeKey))
                {
                    codeOwnerByKey.Remove(oldCodeKey);
                    usedCodes.Remove(oldCodeKey);
                }

                if (!string.IsNullOrWhiteSpace(normalizedCodeKey))
                {
                    codeOwnerByKey[normalizedCodeKey] = existing;
                    usedCodes.Add(normalizedCodeKey);
                }

                AddUpdated(result, rowIndex, existing.Id, existing.Name);
                continue;
            }

            var finalCode = string.IsNullOrWhiteSpace(code)
                ? GenerateNextCustomerCode(usedCodes, ref nextCustomerNumber)
                : code.ToUpperInvariant();
            var finalCodeKey = NormalizeLookupKey(finalCode);
            if (usedCodes.Contains(finalCodeKey))
            {
                AddError(result, rowIndex, $"Customer code '{finalCode}' already exists.");
                continue;
            }

            var customer = new Customer
            {
                StoreId = storeId,
                Name = name,
                Code = finalCode,
                Phone = phone,
                Email = email,
                Address = NormalizeOptional(row.Address),
                DateOfBirth = parsedDateOfBirth,
                CreditLimit = RoundMoney(row.CreditLimit),
                OutstandingBalance = 0m,
                LoyaltyPoints = 0m,
                Notes = NormalizeOptional(row.Notes),
                IsActive = row.IsActive,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            dbContext.Customers.Add(customer);
            byName[NormalizeLookupKey(customer.Name)] = customer;
            if (!string.IsNullOrWhiteSpace(customer.Phone))
            {
                byPhone[NormalizeLookupKey(customer.Phone)] = customer;
            }

            if (!string.IsNullOrWhiteSpace(customer.Email))
            {
                byEmail[NormalizeLookupKey(customer.Email)] = customer;
            }

            usedCodes.Add(finalCodeKey);
            codeOwnerByKey[finalCodeKey] = customer;

            AddInserted(result, rowIndex, customer.Id, customer.Name);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return result;
    }

    private static ImportSummary CreateSummary(int total)
    {
        return new ImportSummary { Total = total };
    }

    private static void AddInserted(ImportSummary summary, int rowIndex, Guid entityId, string? name)
    {
        summary.Inserted++;
        summary.Rows.Add(new ImportRowResult
        {
            RowIndex = rowIndex,
            Status = "ok",
            EntityId = entityId,
            Name = name
        });
    }

    private static void AddUpdated(ImportSummary summary, int rowIndex, Guid entityId, string? name)
    {
        summary.Updated++;
        summary.Rows.Add(new ImportRowResult
        {
            RowIndex = rowIndex,
            Status = "updated",
            EntityId = entityId,
            Name = name
        });
    }

    private static void AddSkipped(ImportSummary summary, int rowIndex, Guid entityId, string? name)
    {
        summary.Skipped++;
        summary.Rows.Add(new ImportRowResult
        {
            RowIndex = rowIndex,
            Status = "skipped",
            EntityId = entityId,
            Name = name
        });
    }

    private static void AddError(ImportSummary summary, int rowIndex, string error)
    {
        summary.Errors++;
        summary.Rows.Add(new ImportRowResult
        {
            RowIndex = rowIndex,
            Status = "error",
            Error = error
        });
    }

    private static string NormalizeDuplicateStrategy(string value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            DuplicateStrategySkip => DuplicateStrategySkip,
            DuplicateStrategyUpdate => DuplicateStrategyUpdate,
            _ => throw new InvalidOperationException("duplicate_strategy must be 'skip' or 'update'.")
        };
    }

    private static string NormalizeLookupKey(string value)
    {
        return value.Trim().ToLowerInvariant();
    }

    private static string? NormalizeOptional(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static decimal RoundMoney(decimal value)
    {
        return decimal.Round(value, 2, MidpointRounding.AwayFromZero);
    }

    private static decimal RoundQuantity(decimal value)
    {
        return decimal.Round(value, 3, MidpointRounding.AwayFromZero);
    }

    private async Task<Guid?> GetCurrentStoreIdAsync(CancellationToken cancellationToken)
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user is null)
        {
            return null;
        }

        var userIdValue = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return await dbContext.Users
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => x.StoreId)
            .SingleOrDefaultAsync(cancellationToken);
    }

    private Task<Guid?> GetCurrentUserIdAsync()
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user is null)
        {
            return Task.FromResult<Guid?>(null);
        }

        var userIdValue = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return Task.FromResult<Guid?>(null);
        }

        return Task.FromResult<Guid?>(userId);
    }

    private static DateOnly? ParseDateOnly(string? value)
    {
        var normalized = NormalizeOptional(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        return DateOnly.TryParse(normalized, out var parsed) ? parsed : null;
    }

    private static int? ParseCustomerCodeNumber(string? code)
    {
        var normalized = NormalizeOptional(code);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        var upper = normalized.ToUpperInvariant();
        if (!upper.StartsWith(CustomerCodePrefix, StringComparison.Ordinal))
        {
            return null;
        }

        return int.TryParse(upper[CustomerCodePrefix.Length..], out var number) ? number : null;
    }

    private static string GenerateNextCustomerCode(HashSet<string> usedCodes, ref int nextCustomerNumber)
    {
        while (true)
        {
            var candidate = $"{CustomerCodePrefix}{nextCustomerNumber:0000}";
            nextCustomerNumber++;
            var key = NormalizeLookupKey(candidate);
            if (usedCodes.Contains(key))
            {
                continue;
            }

            return candidate;
        }
    }

    private static CustomerDedupeType GetCustomerDedupeType(string? phone, string? email)
    {
        if (!string.IsNullOrWhiteSpace(phone))
        {
            return CustomerDedupeType.Phone;
        }

        if (!string.IsNullOrWhiteSpace(email))
        {
            return CustomerDedupeType.Email;
        }

        return CustomerDedupeType.Name;
    }

    private enum CustomerDedupeType
    {
        Phone,
        Email,
        Name
    }
}
