using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Features.Purchases;

namespace SmartPos.Backend.IntegrationTests;

public sealed class PurchaseOcrOpenAiImportTests
{
    [Fact]
    public async Task PurchaseOcrDraft_OpenAiProvider_ShouldReturnMappedDraft()
    {
        await using var factory = new PurchaseOpenAiSuccessWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var createProductPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = PurchaseOpenAiSuccessWebApplicationFactory.MatchedProductName,
                sku = "OPENAI-ITM-001",
                barcode = $"OPENAIOCR{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                category_id = (Guid?)null,
                unit_price = 250m,
                cost_price = 150m,
                initial_stock_quantity = 5m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true
            }));

        var productId = Guid.Parse(TestJson.GetString(createProductPayload, "product_id"));
        Assert.NotEqual(Guid.Empty, productId);

        using var formData = BuildPngUpload(
            fileName: $"openai-success-{Guid.NewGuid():N}.png",
            payload: "openai success fixture image");

        var response = await client.PostAsync("/api/purchases/imports/ocr-draft", formData);
        var draftPayload = await TestJson.ReadObjectAsync(response);

        Assert.Equal("parsed", TestJson.GetString(draftPayload, "status"));
        Assert.False(draftPayload["review_required"]?.GetValue<bool>() ?? true);
        Assert.True(draftPayload["can_auto_commit"]?.GetValue<bool>() ?? false);
        Assert.Equal("INV-OAI-INT-001", TestJson.GetString(draftPayload, "invoice_number"));

        var lineItems = draftPayload["line_items"]?.AsArray()
                        ?? throw new InvalidOperationException("Missing line_items payload.");
        Assert.Single(lineItems);

        var line = lineItems[0]?.AsObject()
                   ?? throw new InvalidOperationException("Expected first line item.");
        Assert.Equal("matched", line["match_status"]?.GetValue<string>());
        Assert.Equal("exact_name", line["match_method"]?.GetValue<string>());
        Assert.Equal(PurchaseOpenAiSuccessWebApplicationFactory.MatchedProductName, line["matched_product_name"]?.GetValue<string>());
    }

    [Fact]
    public async Task PurchaseOcrDraft_OpenAiProviderFailure_ShouldFallbackToManualReview()
    {
        await using var factory = new PurchaseOpenAiFailureWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        using var formData = BuildPngUpload(
            fileName: $"openai-failure-{Guid.NewGuid():N}.png",
            payload: "openai failure fixture image");

        var response = await client.PostAsync("/api/purchases/imports/ocr-draft", formData);
        var draftPayload = await TestJson.ReadObjectAsync(response);

        Assert.Equal("manual_review_required", TestJson.GetString(draftPayload, "status"));
        Assert.True(draftPayload["review_required"]?.GetValue<bool>() ?? false);
        Assert.False(draftPayload["can_auto_commit"]?.GetValue<bool>() ?? true);

        var blockedReasons = draftPayload["blocked_reasons"]?.AsArray()
                             ?? throw new InvalidOperationException("Missing blocked_reasons payload.");
        var blockedReasonValues = blockedReasons
            .Select(x => x?.GetValue<string>())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

        Assert.Contains("ocr_provider_unavailable", blockedReasonValues, StringComparer.OrdinalIgnoreCase);
        Assert.Contains("manual_review_required", blockedReasonValues, StringComparer.OrdinalIgnoreCase);
        Assert.Contains("no_line_items_extracted", blockedReasonValues, StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PurchaseImportConfirm_OpenAiDraft_ShouldUpdateInventoryAndReplayIdempotently()
    {
        await using var factory = new PurchaseOpenAiSuccessWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        var barcode = $"OPENAI-CF-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
        var createProductPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = PurchaseOpenAiSuccessWebApplicationFactory.MatchedProductName,
                sku = "OPENAI-CF-001",
                barcode,
                category_id = (Guid?)null,
                unit_price = 250m,
                cost_price = 150m,
                initial_stock_quantity = 5m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true
            }));
        var baseStock = TestJson.GetDecimal(createProductPayload, "stock_quantity");

        var draft = await CreateOpenAiDraftAsync(client);

        var confirmBody = new
        {
            import_request_id = $"OPENAI-CF-{Guid.NewGuid():N}",
            draft_id = draft.DraftId,
            supplier_name = "OpenAI Supplier",
            items = new[]
            {
                new
                {
                    line_no = draft.LineNo,
                    product_id = draft.ProductId,
                    quantity = 2m,
                    unit_cost = 250m,
                    line_total = 500m
                }
            }
        };

        var confirmPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/purchases/imports/confirm", confirmBody));
        Assert.Equal("confirmed", TestJson.GetString(confirmPayload, "status"));
        Assert.False(confirmPayload["idempotent_replay"]?.GetValue<bool>() ?? true);

        var stockAfterFirstConfirm = await GetStockByBarcodeAsync(client, barcode);
        Assert.Equal(baseStock + 2m, stockAfterFirstConfirm);

        using (var scope = factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var ledgerEntries = await dbContext.Ledger
                .AsNoTracking()
                .Where(x => x.Description.Contains("Purchase import INV-OAI-INT-001"))
                .ToListAsync();
            var ledgerEntry = ledgerEntries
                .OrderByDescending(x => x.CreatedAtUtc)
                .FirstOrDefault();

            Assert.NotNull(ledgerEntry);
            Assert.Equal(500m, ledgerEntry!.Debit);
        }

        var replayPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/purchases/imports/confirm", confirmBody));
        Assert.Equal("idempotent_replay", TestJson.GetString(replayPayload, "status"));
        Assert.True(replayPayload["idempotent_replay"]?.GetValue<bool>() ?? false);

        var stockAfterReplay = await GetStockByBarcodeAsync(client, barcode);
        Assert.Equal(stockAfterFirstConfirm, stockAfterReplay);
    }

    [Fact]
    public async Task PurchaseImportConfirm_OpenAiDraft_ShouldRejectDuplicateSupplierInvoice()
    {
        await using var factory = new PurchaseOpenAiSuccessWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = PurchaseOpenAiSuccessWebApplicationFactory.MatchedProductName,
                sku = "OPENAI-DUP-001",
                barcode = $"OPENAI-DUP-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                category_id = (Guid?)null,
                unit_price = 250m,
                cost_price = 150m,
                initial_stock_quantity = 3m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true
            }));

        var firstDraft = await CreateOpenAiDraftAsync(client);
        var firstConfirm = await client.PostAsJsonAsync("/api/purchases/imports/confirm", new
        {
            import_request_id = $"OPENAI-DUP-FIRST-{Guid.NewGuid():N}",
            draft_id = firstDraft.DraftId,
            supplier_name = "OpenAI Supplier",
            items = new[]
            {
                new
                {
                    line_no = firstDraft.LineNo,
                    product_id = firstDraft.ProductId,
                    quantity = 2m,
                    unit_cost = 250m,
                    line_total = 500m
                }
            }
        });
        firstConfirm.EnsureSuccessStatusCode();

        var secondDraft = await CreateOpenAiDraftAsync(client);
        var duplicateResponse = await client.PostAsJsonAsync("/api/purchases/imports/confirm", new
        {
            import_request_id = $"OPENAI-DUP-SECOND-{Guid.NewGuid():N}",
            draft_id = secondDraft.DraftId,
            supplier_name = "OpenAI Supplier",
            items = new[]
            {
                new
                {
                    line_no = secondDraft.LineNo,
                    product_id = secondDraft.ProductId,
                    quantity = 2m,
                    unit_cost = 250m,
                    line_total = 500m
                }
            }
        });

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, duplicateResponse.StatusCode);
        var errorBody = await duplicateResponse.Content.ReadFromJsonAsync<JsonObject>();
        var errorMessage = errorBody?["message"]?.GetValue<string>() ?? string.Empty;
        Assert.Contains("already exists", errorMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PurchaseOcrDraft_OpenAiLowConfidence_ShouldRequireManualReview()
    {
        await using var factory = new PurchaseOpenAiLowConfidenceWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = PurchaseOpenAiSuccessWebApplicationFactory.MatchedProductName,
                sku = "OPENAI-LC-001",
                barcode = $"OPENAI-LC-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                category_id = (Guid?)null,
                unit_price = 250m,
                cost_price = 150m,
                initial_stock_quantity = 2m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true
            }));

        var draft = await TestJson.ReadObjectAsync(
            await client.PostAsync(
                "/api/purchases/imports/ocr-draft",
                BuildPngUpload($"openai-low-confidence-{Guid.NewGuid():N}.png", "low confidence payload")));

        Assert.Equal("review_required", TestJson.GetString(draft, "status"));
        Assert.True(draft["review_required"]?.GetValue<bool>() ?? false);
        Assert.False(draft["can_auto_commit"]?.GetValue<bool>() ?? true);

        var blockedReasons = draft["blocked_reasons"]?.AsArray()
                             ?? throw new InvalidOperationException("Missing blocked_reasons payload.");
        var blockedReasonValues = blockedReasons
            .Select(x => x?.GetValue<string>())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

        Assert.Contains("low_confidence_lines", blockedReasonValues, StringComparer.OrdinalIgnoreCase);
        Assert.Contains("manual_review_required", blockedReasonValues, StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PurchaseImportConfirm_OpenAiTotalsMismatch_ShouldRequireApprovalReason()
    {
        await using var factory = new PurchaseOpenAiTotalsMismatchWebApplicationFactory();
        using var client = factory.CreateClient();
        await TestAuth.SignInAsManagerAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = PurchaseOpenAiSuccessWebApplicationFactory.MatchedProductName,
                sku = "OPENAI-TM-001",
                barcode = $"OPENAI-TM-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                category_id = (Guid?)null,
                unit_price = 250m,
                cost_price = 150m,
                initial_stock_quantity = 2m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true
            }));

        var draft = await CreateOpenAiDraftAsync(client);
        var confirmWithoutReason = await client.PostAsJsonAsync("/api/purchases/imports/confirm", new
        {
            import_request_id = $"OPENAI-TM-{Guid.NewGuid():N}",
            draft_id = draft.DraftId,
            supplier_name = "OpenAI Supplier",
            items = new[]
            {
                new
                {
                    line_no = draft.LineNo,
                    product_id = draft.ProductId,
                    quantity = 2m,
                    unit_cost = 250m,
                    line_total = 500m
                }
            }
        });

        Assert.Equal(System.Net.HttpStatusCode.BadRequest, confirmWithoutReason.StatusCode);
        var errorBody = await confirmWithoutReason.Content.ReadFromJsonAsync<JsonObject>();
        var errorMessage = errorBody?["message"]?.GetValue<string>() ?? string.Empty;
        Assert.Contains("approval_reason", errorMessage, StringComparison.OrdinalIgnoreCase);
    }

    private static MultipartFormDataContent BuildPngUpload(string fileName, string payload)
    {
        var header = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
        var bytes = header.Concat(Encoding.UTF8.GetBytes(payload)).ToArray();

        var formData = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        formData.Add(fileContent, "file", fileName);
        return formData;
    }

    private static async Task<(Guid DraftId, Guid ProductId, int LineNo)> CreateOpenAiDraftAsync(HttpClient client)
    {
        using var formData = BuildPngUpload(
            fileName: $"openai-draft-{Guid.NewGuid():N}.png",
            payload: "openai integration draft payload");

        var draftPayload = await TestJson.ReadObjectAsync(
            await client.PostAsync("/api/purchases/imports/ocr-draft", formData));

        var draftId = Guid.Parse(TestJson.GetString(draftPayload, "draft_id"));
        var line = draftPayload["line_items"]?.AsArray()?.OfType<JsonObject>().FirstOrDefault()
                   ?? throw new InvalidOperationException("Draft line item missing.");
        var productId = Guid.Parse(TestJson.GetString(line, "matched_product_id"));
        var lineNo = line["line_no"]?.GetValue<int>() ?? 1;
        return (draftId, productId, lineNo);
    }

    private static async Task<decimal> GetStockByBarcodeAsync(HttpClient client, string barcode)
    {
        var payload = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/search?q={Uri.EscapeDataString(barcode)}"));

        var firstHit = payload["items"]?.AsArray()?.OfType<JsonObject>().FirstOrDefault()
                       ?? throw new InvalidOperationException($"Could not find product by barcode: {barcode}");

        return TestJson.GetDecimal(firstHit, "stockQuantity");
    }
}

public sealed class PurchaseOpenAiSuccessWebApplicationFactory : CustomWebApplicationFactory
{
    public const string MatchedProductName = "OpenAI Integration Matched Product";

    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["Purchasing:OcrProvider"] = "openai",
            ["Purchasing:OcrRetryCount"] = "0",
            ["Purchasing:OpenAiApiBaseUrl"] = "https://api.openai.com/v1",
            ["Purchasing:OpenAiApiKey"] = "test-openai-key",
            ["Purchasing:OpenAiApiKeyEnvironmentVariable"] = "OPENAI_API_KEY_TEST_OCR_SUCCESS_2026_04_06"
        };
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureServices(services =>
        {
            services.AddSingleton<IOcrProviderCore, StubOpenAiSuccessOcrProvider>();
        });
    }

    private sealed class StubOpenAiSuccessOcrProvider : IOcrProviderCore
    {
        public Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken)
        {
            return Task.FromResult(new PurchaseOcrExtractionResult
            {
                ProviderName = "openai",
                SupplierName = "OpenAI Supplier",
                InvoiceNumber = "INV-OAI-INT-001",
                InvoiceDate = DateTimeOffset.Parse("2026-04-06T00:00:00+05:30"),
                Currency = "LKR",
                Subtotal = 500m,
                TaxTotal = 0m,
                GrandTotal = 500m,
                OverallConfidence = 0.94m,
                RawText = "{\"provider\":\"openai-stub\"}",
                Lines =
                [
                    new PurchaseOcrExtractionLine
                    {
                        LineNumber = 1,
                        RawText = $"{MatchedProductName} 2 250.00 500.00",
                        ItemName = MatchedProductName,
                        Quantity = 2m,
                        UnitCost = 250m,
                        LineTotal = 500m,
                        Confidence = 0.95m
                    }
                ]
            });
        }
    }
}

public sealed class PurchaseOpenAiFailureWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["Purchasing:OcrProvider"] = "openai",
            ["Purchasing:OcrRetryCount"] = "0",
            ["Purchasing:OpenAiApiBaseUrl"] = "https://api.openai.com/v1",
            ["Purchasing:OpenAiApiKey"] = "test-openai-key",
            ["Purchasing:OpenAiApiKeyEnvironmentVariable"] = "OPENAI_API_KEY_TEST_OCR_FAILURE_2026_04_06"
        };
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureServices(services =>
        {
            services.AddSingleton<IOcrProviderCore, StubOpenAiFailureOcrProvider>();
        });
    }

    private sealed class StubOpenAiFailureOcrProvider : IOcrProviderCore
    {
        public Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken)
        {
            throw new OcrProviderUnavailableException("OpenAI OCR stub failure for integration test.");
        }
    }
}

public sealed class PurchaseOpenAiLowConfidenceWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["Purchasing:OcrProvider"] = "openai",
            ["Purchasing:OcrRetryCount"] = "0",
            ["Purchasing:OpenAiApiBaseUrl"] = "https://api.openai.com/v1",
            ["Purchasing:OpenAiApiKey"] = "test-openai-key",
            ["Purchasing:OpenAiApiKeyEnvironmentVariable"] = "OPENAI_API_KEY_TEST_OCR_LOWCONF_2026_04_06"
        };
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureServices(services =>
        {
            services.AddSingleton<IOcrProviderCore, StubOpenAiLowConfidenceOcrProvider>();
        });
    }

    private sealed class StubOpenAiLowConfidenceOcrProvider : IOcrProviderCore
    {
        public Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken)
        {
            return Task.FromResult(new PurchaseOcrExtractionResult
            {
                ProviderName = "openai",
                SupplierName = "OpenAI Supplier",
                InvoiceNumber = "INV-OAI-LOWCONF-001",
                InvoiceDate = DateTimeOffset.Parse("2026-04-06T00:00:00+05:30"),
                Currency = "LKR",
                Subtotal = 500m,
                TaxTotal = 0m,
                GrandTotal = 500m,
                OverallConfidence = 0.40m,
                RawText = "{\"provider\":\"openai-low-confidence-stub\"}",
                Lines =
                [
                    new PurchaseOcrExtractionLine
                    {
                        LineNumber = 1,
                        RawText = $"{PurchaseOpenAiSuccessWebApplicationFactory.MatchedProductName} 2 250.00 500.00",
                        ItemName = PurchaseOpenAiSuccessWebApplicationFactory.MatchedProductName,
                        Quantity = 2m,
                        UnitCost = 250m,
                        LineTotal = 500m,
                        Confidence = 0.30m
                    }
                ]
            });
        }
    }
}

public sealed class PurchaseOpenAiTotalsMismatchWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["Purchasing:OcrProvider"] = "openai",
            ["Purchasing:OcrRetryCount"] = "0",
            ["Purchasing:OpenAiApiBaseUrl"] = "https://api.openai.com/v1",
            ["Purchasing:OpenAiApiKey"] = "test-openai-key",
            ["Purchasing:OpenAiApiKeyEnvironmentVariable"] = "OPENAI_API_KEY_TEST_OCR_TOTALSMIS_2026_04_06"
        };
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureServices(services =>
        {
            services.AddSingleton<IOcrProviderCore, StubOpenAiTotalsMismatchOcrProvider>();
        });
    }

    private sealed class StubOpenAiTotalsMismatchOcrProvider : IOcrProviderCore
    {
        public Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken)
        {
            return Task.FromResult(new PurchaseOcrExtractionResult
            {
                ProviderName = "openai",
                SupplierName = "OpenAI Supplier",
                InvoiceNumber = "INV-OAI-TOTALS-001",
                InvoiceDate = DateTimeOffset.Parse("2026-04-06T00:00:00+05:30"),
                Currency = "LKR",
                Subtotal = 500m,
                TaxTotal = 0m,
                GrandTotal = 900m,
                OverallConfidence = 0.93m,
                RawText = "{\"provider\":\"openai-totals-mismatch-stub\"}",
                Lines =
                [
                    new PurchaseOcrExtractionLine
                    {
                        LineNumber = 1,
                        RawText = $"{PurchaseOpenAiSuccessWebApplicationFactory.MatchedProductName} 2 250.00 500.00",
                        ItemName = PurchaseOpenAiSuccessWebApplicationFactory.MatchedProductName,
                        Quantity = 2m,
                        UnitCost = 250m,
                        LineTotal = 500m,
                        Confidence = 0.95m
                    }
                ]
            });
        }
    }
}
