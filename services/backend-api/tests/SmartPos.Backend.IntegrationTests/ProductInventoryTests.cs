using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Net;

namespace SmartPos.Backend.IntegrationTests;

public sealed class ProductInventoryTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task ProductInventoryLifecycle_ShouldSupportCategoryBarcodeAdjustmentsAndLowStock()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var categoryName = $"Integration Category {runId}";

        var createCategory = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/categories", new
            {
                name = categoryName,
                description = "Integration category",
                is_active = true
            }));

        var categoryId = Guid.Parse(TestJson.GetString(createCategory, "category_id"));
        Assert.Equal(categoryName, TestJson.GetString(createCategory, "name"));

        var barcode = $"IT{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{Random.Shared.Next(100, 999)}";
        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Integration Product {runId}",
                sku = $"IT-SKU-{runId}",
                barcode,
                category_id = categoryId,
                unit_price = 125m,
                cost_price = 80m,
                initial_stock_quantity = 10m,
                reorder_level = 6m,
                allow_negative_stock = false,
                is_active = true
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));
        Assert.Equal(10m, TestJson.GetDecimal(createProduct, "stock_quantity"));
        Assert.Equal(barcode, TestJson.GetString(createProduct, "barcode"));

        var barcodeSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/search?q={Uri.EscapeDataString(barcode)}"));
        var barcodeHit = FirstObjectFromArray(barcodeSearch, "items");
        Assert.Equal(
            productId.ToString(),
            TestJson.GetString(barcodeHit, "id"),
            ignoreCase: true,
            ignoreLineEndingDifferences: false,
            ignoreWhiteSpaceDifferences: false);

        var updateProduct = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/products/{productId}", new
            {
                name = $"Integration Product Updated {runId}",
                sku = $"IT-SKU-{runId}",
                barcode,
                category_id = categoryId,
                unit_price = 130m,
                cost_price = 82m,
                reorder_level = 6m,
                allow_negative_stock = false,
                is_active = true
            }));
        Assert.Equal(130m, TestJson.GetDecimal(updateProduct, "unit_price"));

        var stockAdjust = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/stock-adjustments", new
            {
                delta_quantity = -3m,
                reason = "manual_count_correction"
            }));
        Assert.Equal(10m, TestJson.GetDecimal(stockAdjust, "previous_quantity"));
        Assert.Equal(7m, TestJson.GetDecimal(stockAdjust, "new_quantity"));

        var completeSale = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/complete", new
            {
                sale_id = (Guid?)null,
                items = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity = 2m
                    }
                },
                discount_percent = 0m,
                role = "cashier",
                payments = new[]
                {
                    new
                    {
                        method = "cash",
                        amount = 1000m,
                        reference_number = (string?)null
                    }
                }
            }));
        Assert.Equal("completed", TestJson.GetString(completeSale, "status"));

        var productCatalog = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/catalog?q={Uri.EscapeDataString(barcode)}&take=20"));
        var catalogItem = FindObjectInArray(productCatalog, "items", "product_id", productId.ToString());
        Assert.Equal(5m, TestJson.GetDecimal(catalogItem, "stock_quantity"));
        Assert.True(catalogItem["is_low_stock"]?.GetValue<bool>() ?? false);

        var lowStock = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/reports/low-stock?take=200&threshold=5"));
        var lowStockItem = FindObjectInArray(lowStock, "items", "product_id", productId.ToString());
        Assert.Equal(5m, TestJson.GetDecimal(lowStockItem, "quantity_on_hand"));
    }

    [Fact]
    public async Task ProductUpdate_ShouldExposeAndCorrectInitialStock()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Initial Stock Product {runId}",
                sku = $"INIT-{runId}",
                unit_price = 150m,
                cost_price = 100m,
                initial_stock_quantity = 5m,
                reorder_level = 2m,
                safety_stock = 1m,
                target_stock_level = 8m,
                allow_negative_stock = false,
                is_active = true
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));
        Assert.Equal(5m, TestJson.GetDecimal(createProduct, "stock_quantity"));
        Assert.Equal(5m, TestJson.GetDecimal(createProduct, "initial_stock_quantity"));

        var stockAdjust = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/stock-adjustments", new
            {
                delta_quantity = -2m,
                reason = "manual_count_correction"
            }));
        Assert.Equal(5m, TestJson.GetDecimal(stockAdjust, "previous_quantity"));
        Assert.Equal(3m, TestJson.GetDecimal(stockAdjust, "new_quantity"));

        var updatedProduct = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/products/{productId}", new
            {
                name = $"Initial Stock Product {runId}",
                sku = $"INIT-{runId}",
                barcode = (string?)null,
                category_id = (Guid?)null,
                brand_id = (Guid?)null,
                unit_price = 150m,
                cost_price = 100m,
                initial_stock_quantity = 7m,
                reorder_level = 2m,
                safety_stock = 1m,
                target_stock_level = 8m,
                allow_negative_stock = false,
                is_active = true
            }));

        Assert.Equal(7m, TestJson.GetDecimal(updatedProduct, "initial_stock_quantity"));
        Assert.Equal(5m, TestJson.GetDecimal(updatedProduct, "stock_quantity"));

        var productCatalog = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/catalog?q={Uri.EscapeDataString($"Initial Stock Product {runId}")}&take=20"));
        var catalogItem = FindObjectInArray(productCatalog, "items", "product_id", productId.ToString());
        Assert.Equal(7m, TestJson.GetDecimal(catalogItem, "initial_stock_quantity"));
        Assert.Equal(5m, TestJson.GetDecimal(catalogItem, "stock_quantity"));
    }

    [Fact]
    public async Task ProductSerialNumbers_ShouldListPersistedSerialsAfterReload()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var serialOne = $"SER-{runId}-001";
        var serialTwo = $"SER-{runId}-002";

        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Serial Tracked Product {runId}",
                sku = $"SER-{runId}",
                unit_price = 250m,
                cost_price = 180m,
                initial_stock_quantity = 2m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true,
                is_serial_tracked = true,
                warranty_months = 12
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/serials", new
            {
                serials = new[] { serialOne, serialTwo }
            }));

        var reloadPayload = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/{productId}/serials"));
        var items = reloadPayload["items"]?.AsArray()
                    ?? throw new InvalidOperationException("Missing serial items.");

        var serialValues = items
            .OfType<JsonObject>()
            .Select(item => TestJson.GetString(item, "serial_value"))
            .ToArray();

        Assert.Equal(2, serialValues.Length);
        Assert.Contains(serialOne, serialValues);
        Assert.Contains(serialTwo, serialValues);
    }

    [Fact]
    public async Task ProductSearch_ShouldMatchSerialNumberQueries()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var serialValue = $"SER-SEARCH-{runId}-001";

        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Serial Search Product {runId}",
                sku = $"SER-SEARCH-{runId}",
                unit_price = 250m,
                cost_price = 180m,
                initial_stock_quantity = 1m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true,
                is_serial_tracked = true,
                warranty_months = 12
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/serials", new
            {
                serials = new[] { serialValue }
            }));

        var serialSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/search?q={Uri.EscapeDataString(serialValue)}"));
        var serialHit = FindObjectInArray(serialSearch, "items", "id", productId.ToString());

        Assert.Equal($"Serial Search Product {runId}", TestJson.GetString(serialHit, "name"));
        Assert.True(serialHit["is_serial_tracked"]?.GetValue<bool>() ?? false);
    }

    [Fact]
    public async Task ProductSerialNumbers_ShouldUpdateAndDeleteSerials()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var serialOne = $"SER-UPDATE-{runId}-001";
        var serialTwo = $"SER-UPDATE-{runId}-002";

        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Serial Update Product {runId}",
                sku = $"SER-UPD-{runId}",
                unit_price = 250m,
                cost_price = 180m,
                initial_stock_quantity = 2m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true,
                is_serial_tracked = true,
                warranty_months = 12
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));

        var added = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/serials", new
            {
                serials = new[] { serialOne, serialTwo }
            }));

        var addedItems = added["items"]?.AsArray()
                        ?? throw new InvalidOperationException("Missing added serial items.");
        var firstSerial = addedItems.OfType<JsonObject>().FirstOrDefault()
                         ?? throw new InvalidOperationException("Missing first serial item.");
        var firstSerialId = Guid.Parse(TestJson.GetString(firstSerial, "id"));
        var firstWarranty = DateTimeOffset.UtcNow.AddMonths(6);

        var updatedSerial = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/products/{productId}/serials/{firstSerialId}", new
            {
                status = "Defective",
                warranty_expiry_date = firstWarranty.ToString("O")
            }));

        Assert.Equal("Defective", TestJson.GetString(updatedSerial, "status"));
        Assert.Equal(
            firstWarranty.UtcDateTime,
            DateTimeOffset.Parse(TestJson.GetString(updatedSerial, "warranty_expiry_date")).UtcDateTime);

        var remainingSerial = addedItems.OfType<JsonObject>().Skip(1).FirstOrDefault()
                             ?? throw new InvalidOperationException("Missing second serial item.");
        var remainingSerialId = Guid.Parse(TestJson.GetString(remainingSerial, "id"));

        var deleteResponse = await client.DeleteAsync($"/api/products/{productId}/serials/{remainingSerialId}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var reloadPayload = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/{productId}/serials"));
        var items = reloadPayload["items"]?.AsArray()
                    ?? throw new InvalidOperationException("Missing serial items.");

        var serialValues = items
            .OfType<JsonObject>()
            .Select(item => TestJson.GetString(item, "serial_value"))
            .ToArray();

        Assert.Single(serialValues);
        Assert.Contains(serialOne, serialValues);
        Assert.DoesNotContain(serialTwo, serialValues);
    }

    [Fact]
    public async Task ProductSerialNumbers_ShouldMarkSerialDefective()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var serialValue = $"SER-DEF-{runId}-001";

        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Serial Defective Product {runId}",
                sku = $"SER-DEF-{runId}",
                unit_price = 250m,
                cost_price = 180m,
                initial_stock_quantity = 1m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true,
                is_serial_tracked = true,
                warranty_months = 12
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));

        var added = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/serials", new
            {
                serials = new[] { serialValue }
            }));

        var serialItem = added["items"]?.AsArray()?.OfType<JsonObject>().FirstOrDefault()
                         ?? throw new InvalidOperationException("Missing serial item.");
        var serialId = Guid.Parse(TestJson.GetString(serialItem, "id"));

        var markedDefective = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/products/{productId}/serials/{serialId}", new
            {
                status = "Defective"
            }));

        Assert.Equal("Defective", TestJson.GetString(markedDefective, "status"));
        Assert.Equal(serialValue, TestJson.GetString(markedDefective, "serial_value"));
    }

    [Fact]
    public async Task Checkout_ShouldSellTheRequestedSerialNumber()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var serialOne = $"SER-CHECKOUT-{runId}-001";
        var serialTwo = $"SER-CHECKOUT-{runId}-002";

        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Serial Checkout Product {runId}",
                sku = $"SER-CHK-{runId}",
                unit_price = 250m,
                cost_price = 180m,
                initial_stock_quantity = 2m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true,
                is_serial_tracked = true,
                warranty_months = 12
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));

        var added = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/products/{productId}/serials", new
            {
                serials = new[] { serialOne, serialTwo }
            }));

        var addedItems = added["items"]?.AsArray()
                        ?? throw new InvalidOperationException("Missing added serial items.");
        var targetSerial = addedItems
            .OfType<JsonObject>()
            .FirstOrDefault(item => string.Equals(TestJson.GetString(item, "serial_value"), serialTwo, StringComparison.Ordinal))
                           ?? throw new InvalidOperationException("Missing target serial item.");
        var targetSerialId = Guid.Parse(TestJson.GetString(targetSerial, "id"));

        var saleResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/complete", new
            {
                sale_id = (Guid?)null,
                items = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity = 1m,
                        serial_number_id = targetSerialId
                    }
                },
                discount_percent = 0m,
                role = "cashier",
                payments = new[]
                {
                    new
                    {
                        method = "cash",
                        amount = 250m,
                        reference_number = (string?)null
                    }
                }
            }));

        Assert.Equal("completed", TestJson.GetString(saleResponse, "status"));

        var serialReload = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/{productId}/serials"));
        var serialItems = serialReload["items"]?.AsArray()
                          ?? throw new InvalidOperationException("Missing serial items after sale.");
        var soldSerial = serialItems
            .OfType<JsonObject>()
            .First(item => string.Equals(TestJson.GetString(item, "serial_value"), serialTwo, StringComparison.Ordinal));
        var untouchedSerial = serialItems
            .OfType<JsonObject>()
            .First(item => string.Equals(TestJson.GetString(item, "serial_value"), serialOne, StringComparison.Ordinal));

        Assert.Equal("Sold", TestJson.GetString(soldSerial, "status"));
        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(soldSerial, "sale_id")));
        Assert.Equal("Available", TestJson.GetString(untouchedSerial, "status"));
    }

    [Fact]
    public async Task ProductBarcodeEndpoints_ShouldGenerateValidateAssignAndBulkGenerateMissing()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var generated = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products/barcodes/generate", new
            {
                name = $"Barcode Seed Item {runId}",
                sku = $"BAR-{runId}"
            }));

        var generatedBarcode = TestJson.GetString(generated, "barcode");
        Assert.Equal(13, generatedBarcode.Length);
        Assert.True(generatedBarcode.All(char.IsDigit));

        var validateBeforeUse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products/barcodes/validate", new
            {
                barcode = generatedBarcode
            }));
        Assert.True(validateBeforeUse["is_valid"]?.GetValue<bool>() ?? false);
        Assert.Equal("ean-13", TestJson.GetString(validateBeforeUse, "format"));
        Assert.False(validateBeforeUse["exists"]?.GetValue<bool>() ?? true);

        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Barcode Product {runId}",
                sku = $"BRC-{runId}",
                barcode = generatedBarcode,
                category_id = (Guid?)null,
                unit_price = 100m,
                cost_price = 60m,
                initial_stock_quantity = 5m,
                reorder_level = 2m,
                allow_negative_stock = true,
                is_active = true
            }));

        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));

        var validateAfterUse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products/barcodes/validate", new
            {
                barcode = generatedBarcode
            }));
        Assert.True(validateAfterUse["exists"]?.GetValue<bool>() ?? false);

        var assignWithoutForce = await client.PostAsJsonAsync(
            $"/api/products/{productId}/barcode/generate",
            new
            {
                force_replace = false
            });
        Assert.Equal(HttpStatusCode.BadRequest, assignWithoutForce.StatusCode);

        var assignWithForce = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync(
                $"/api/products/{productId}/barcode/generate",
                new
                {
                    force_replace = true
                }));

        var regeneratedBarcode = TestJson.GetString(assignWithForce, "barcode");
        Assert.NotEqual(generatedBarcode, regeneratedBarcode);
        Assert.Equal(13, regeneratedBarcode.Length);
        Assert.True(regeneratedBarcode.All(char.IsDigit));

        var missingBarcodeProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Missing Barcode Product {runId}",
                sku = $"MB-{runId}",
                barcode = (string?)null,
                category_id = (Guid?)null,
                unit_price = 90m,
                cost_price = 50m,
                initial_stock_quantity = 3m,
                reorder_level = 1m,
                allow_negative_stock = true,
                is_active = true
            }));
        var missingProductId = Guid.Parse(TestJson.GetString(missingBarcodeProduct, "product_id"));

        var dryRun = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products/barcodes/bulk-generate-missing", new
            {
                take = 200,
                include_inactive = true,
                dry_run = true
            }));
        Assert.True((dryRun["would_generate"]?.GetValue<int>() ?? 0) >= 1);

        var applyRun = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products/barcodes/bulk-generate-missing", new
            {
                take = 200,
                include_inactive = true,
                dry_run = false
            }));
        Assert.True((applyRun["generated"]?.GetValue<int>() ?? 0) >= 1);

        var catalogAfterBulk = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/catalog?q={Uri.EscapeDataString($"Missing Barcode Product {runId}")}&take=20"));
        var updatedMissingProduct = FindObjectInArray(
            catalogAfterBulk,
            "items",
            "product_id",
            missingProductId.ToString());
        var bulkBarcode = TestJson.GetString(updatedMissingProduct, "barcode");
        Assert.False(string.IsNullOrWhiteSpace(bulkBarcode));
        Assert.Equal(13, bulkBarcode.Length);
        Assert.True(bulkBarcode.All(char.IsDigit));
    }

    [Fact]
    public async Task ProductBarcodeAssign_ShouldReplayDeterministically_WithSameIdempotencyKey()
    {
        await TestAuth.SignInAsManagerAsync(client);

        client.DefaultRequestHeaders.Remove("Idempotency-Key");

        var runId = Guid.NewGuid().ToString("N")[..8];
        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Idempotent Barcode Product {runId}",
                sku = $"IDEMP-BAR-{runId}",
                barcode = (string?)null,
                category_id = (Guid?)null,
                unit_price = 99m,
                cost_price = 55m,
                initial_stock_quantity = 2m,
                reorder_level = 1m,
                allow_negative_stock = true,
                is_active = true
            }));
        var productId = Guid.Parse(TestJson.GetString(createProduct, "product_id"));

        var replayKey = $"barcode-replay-{Guid.NewGuid():N}";
        var firstAssign = await PostWithIdempotencyAsync(
            client,
            $"/api/products/{productId}/barcode/generate",
            new
            {
                force_replace = true,
                seed = $"IDEMP-SEED-{runId}"
            },
            replayKey);
        var firstBarcode = TestJson.GetString(firstAssign, "barcode");

        var replayAssign = await PostWithIdempotencyAsync(
            client,
            $"/api/products/{productId}/barcode/generate",
            new
            {
                force_replace = true,
                seed = $"IDEMP-SEED-{runId}"
            },
            replayKey);
        var replayBarcode = TestJson.GetString(replayAssign, "barcode");
        Assert.Equal(firstBarcode, replayBarcode);

        var newKeyAssign = await PostWithIdempotencyAsync(
            client,
            $"/api/products/{productId}/barcode/generate",
            new
            {
                force_replace = true,
                seed = $"IDEMP-SEED-{runId}"
            },
            $"barcode-replay-{Guid.NewGuid():N}");
        var newKeyBarcode = TestJson.GetString(newKeyAssign, "barcode");
        Assert.NotEqual(firstBarcode, newKeyBarcode);
    }

    [Fact]
    public async Task ProductBarcodeUniqueness_ShouldBlockNormalizedDuplicatesAndSupportExcludeProductValidation()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        const string baseBarcode = "4006381333931";

        var primaryProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Primary Barcode Product {runId}",
                sku = $"PRI-BAR-{runId}",
                barcode = baseBarcode,
                category_id = (Guid?)null,
                unit_price = 120m,
                cost_price = 70m,
                initial_stock_quantity = 4m,
                reorder_level = 1m,
                allow_negative_stock = true,
                is_active = true
            }));
        var primaryProductId = Guid.Parse(TestJson.GetString(primaryProduct, "product_id"));

        var validateExisting = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products/barcodes/validate", new
            {
                barcode = "4006-3813 3393-1"
            }));
        Assert.True(validateExisting["is_valid"]?.GetValue<bool>() ?? false);
        Assert.Equal("4006381333931", TestJson.GetString(validateExisting, "normalized_barcode"));
        Assert.True(validateExisting["exists"]?.GetValue<bool>() ?? false);

        var validateExcluded = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products/barcodes/validate", new
            {
                barcode = "4006-3813 3393-1",
                exclude_product_id = primaryProductId
            }));
        Assert.True(validateExcluded["is_valid"]?.GetValue<bool>() ?? false);
        Assert.Equal("4006381333931", TestJson.GetString(validateExcluded, "normalized_barcode"));
        Assert.False(validateExcluded["exists"]?.GetValue<bool>() ?? true);

        var duplicateCreateResponse = await client.PostAsJsonAsync("/api/products", new
        {
            name = $"Duplicate Barcode Product {runId}",
            sku = $"DUP-BAR-{runId}",
            barcode = "4006-3813 3393-1",
            category_id = (Guid?)null,
            unit_price = 130m,
            cost_price = 80m,
            initial_stock_quantity = 2m,
            reorder_level = 1m,
            allow_negative_stock = true,
            is_active = true
        });
        Assert.Equal(HttpStatusCode.BadRequest, duplicateCreateResponse.StatusCode);
        var duplicateCreateError = await duplicateCreateResponse.Content.ReadFromJsonAsync<JsonObject>()
                                   ?? throw new InvalidOperationException("Expected duplicate create error payload.");
        Assert.Equal("Barcode already exists.", TestJson.GetString(duplicateCreateError, "message"));

        var secondaryProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"Secondary Barcode Product {runId}",
                sku = $"SEC-BAR-{runId}",
                barcode = (string?)null,
                category_id = (Guid?)null,
                unit_price = 115m,
                cost_price = 65m,
                initial_stock_quantity = 3m,
                reorder_level = 1m,
                allow_negative_stock = true,
                is_active = true
            }));
        var secondaryProductId = Guid.Parse(TestJson.GetString(secondaryProduct, "product_id"));

        var duplicateUpdateResponse = await client.PutAsJsonAsync($"/api/products/{secondaryProductId}", new
        {
            name = $"Secondary Barcode Product Updated {runId}",
            sku = $"SEC-BAR-{runId}",
            barcode = "4006 3813 3393 1",
            category_id = (Guid?)null,
            unit_price = 116m,
            cost_price = 66m,
            reorder_level = 1m,
            allow_negative_stock = true,
            is_active = true
        });
        Assert.Equal(HttpStatusCode.BadRequest, duplicateUpdateResponse.StatusCode);
        var duplicateUpdateError = await duplicateUpdateResponse.Content.ReadFromJsonAsync<JsonObject>()
                                   ?? throw new InvalidOperationException("Expected duplicate update error payload.");
        Assert.Equal("Barcode already exists.", TestJson.GetString(duplicateUpdateError, "message"));
    }

    private static JsonObject FirstObjectFromArray(JsonNode root, string propertyName)
    {
        var array = root[propertyName]?.AsArray()
                    ?? throw new InvalidOperationException($"Missing array '{propertyName}'.");

        return array
                   .OfType<JsonObject>()
                   .FirstOrDefault()
               ?? throw new InvalidOperationException($"Array '{propertyName}' was empty.");
    }

    private static JsonObject FindObjectInArray(
        JsonNode root,
        string arrayPropertyName,
        string keyPropertyName,
        string expectedValue)
    {
        var array = root[arrayPropertyName]?.AsArray()
                    ?? throw new InvalidOperationException($"Missing array '{arrayPropertyName}'.");

        return array
                   .OfType<JsonObject>()
                   .FirstOrDefault(item =>
                       string.Equals(
                           item[keyPropertyName]?.GetValue<string>(),
                           expectedValue,
                           StringComparison.OrdinalIgnoreCase))
               ?? throw new InvalidOperationException(
                   $"Value '{expectedValue}' was not found in '{arrayPropertyName}'.");
    }

    private static async Task<JsonObject> PostWithIdempotencyAsync(
        HttpClient httpClient,
        string url,
        object payload,
        string idempotencyKey)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.Remove("Idempotency-Key");
        request.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);

        var response = await httpClient.SendAsync(request);
        return await TestJson.ReadObjectAsync(response);
    }
}
