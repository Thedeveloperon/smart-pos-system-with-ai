using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Text;
using System.Text.Json.Nodes;
using SmartPos.Backend.Features.Purchases;

namespace SmartPos.Backend.IntegrationTests;

public sealed class PurchaseOcrImportTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task PurchaseOcrDraft_ShouldReturnDraftForManager()
    {
        await TestAuth.SignInAsManagerAsync(client);

        using var formData = BuildPdfUpload(
            fileName: $"supplier-bill-{Guid.NewGuid():N}.pdf",
            textPayload: """
                %PDF-1.7
                Supplier: Acme Traders
                Invoice No: INV-2026-1001
                Color Pencils 1 280.00 280.00
                Unknown Snack 1 100.00 100.00
                Subtotal: 380.00
                Tax: 0.00
                Total: 380.00
                /Type /Page
                """);

        var response = await client.PostAsync("/api/purchases/imports/ocr-draft", formData);
        var payload = await TestJson.ReadObjectAsync(response);

        var status = TestJson.GetString(payload, "status");
        var allowedStatuses = new[] { "parsed", "review_required", "manual_review_required" };
        Assert.True(allowedStatuses.Contains(status), $"Unexpected status '{status}'.");
        Assert.NotEqual(Guid.Empty, Guid.Parse(TestJson.GetString(payload, "draft_id")));
        Assert.Equal("application/pdf", TestJson.GetString(payload, "content_type"));
        var lineItems = payload["line_items"]?.AsArray();
        Assert.NotNull(lineItems);
        Assert.True(lineItems!.Count >= 2);

        var firstLine = lineItems[0]?.AsObject();
        Assert.NotNull(firstLine);
        Assert.Equal("matched", firstLine!["match_status"]?.GetValue<string>());
        Assert.False(string.IsNullOrWhiteSpace(firstLine["matched_product_id"]?.GetValue<string>()));

        var secondLine = lineItems[1]?.AsObject();
        Assert.NotNull(secondLine);
        Assert.Equal("unmatched", secondLine!["match_status"]?.GetValue<string>());
        Assert.Equal("needs_review", secondLine["review_status"]?.GetValue<string>());
    }

    [Fact]
    public async Task PurchaseOcrDraft_ShouldRequireApprovalReason_WhenTotalsMismatch()
    {
        await TestAuth.SignInAsManagerAsync(client);

        using var formData = BuildPdfUpload(
            fileName: $"supplier-bill-mismatch-{Guid.NewGuid():N}.pdf",
            textPayload: """
                %PDF-1.7
                Supplier: Acme Traders
                Invoice No: INV-2026-1002
                Ceylon Tea 100g 1 850.00 850.00
                Subtotal: 850.00
                Tax: 0.00
                Total: 1000.00
                /Type /Page
                """);

        var response = await client.PostAsync("/api/purchases/imports/ocr-draft", formData);
        var payload = await TestJson.ReadObjectAsync(response);

        var totals = payload["totals"]?.AsObject()
                     ?? throw new InvalidOperationException("Missing totals payload.");

        Assert.False(totals["within_tolerance"]?.GetValue<bool>() ?? true);
        Assert.True(totals["requires_approval_reason"]?.GetValue<bool>() ?? false);
        var blockedReasons = payload["blocked_reasons"]?.AsArray()
                             ?? throw new InvalidOperationException("Missing blocked reasons.");
        Assert.Contains(
            blockedReasons.Select(x => x?.GetValue<string>()).Where(x => x is not null),
            reason => string.Equals(reason, "totals_mismatch_requires_approval", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task PurchaseOcrDraft_ShouldForbidCashier()
    {
        await TestAuth.SignInAsCashierAsync(client);

        using var formData = BuildPdfUpload(
            fileName: "cashier-upload.pdf",
            textPayload: """
                %PDF-1.7
                Invoice No: INV-CASHIER-1
                /Type /Page
                """);

        var response = await client.PostAsync("/api/purchases/imports/ocr-draft", formData);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task PurchaseImportConfirm_ShouldCreateAndReplayIdempotently()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var barcode = $"OCRCONFIRM{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{runId}";
        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"OCR Confirm Product {runId}",
                sku = $"OCR-SKU-{runId}",
                barcode,
                category_id = (Guid?)null,
                unit_price = 120m,
                cost_price = 60m,
                initial_stock_quantity = 5m,
                reorder_level = 2m,
                allow_negative_stock = false,
                is_active = true
            }));

        var baseStock = TestJson.GetDecimal(createProduct, "stock_quantity");
        var productName = TestJson.GetString(createProduct, "name");

        using var draftForm = BuildPdfUpload(
            fileName: $"purchase-confirm-{runId}.pdf",
            textPayload: $"""
                %PDF-1.7
                Supplier: OCR Supplier {runId}
                Invoice No: INV-CF-{runId}
                {productName} 2 10.00 20.00
                Subtotal: 20.00
                Tax: 0.00
                Total: 20.00
                /Type /Page
                """);

        var draftPayload = await TestJson.ReadObjectAsync(
            await client.PostAsync("/api/purchases/imports/ocr-draft", draftForm));
        var draftId = Guid.Parse(TestJson.GetString(draftPayload, "draft_id"));

        var firstLine = draftPayload["line_items"]?.AsArray()?.OfType<JsonObject>().FirstOrDefault()
                        ?? throw new InvalidOperationException("Draft did not include line items.");
        var matchedProductId = Guid.Parse(TestJson.GetString(firstLine, "matched_product_id"));
        var lineNo = firstLine["line_no"]?.GetValue<int>() ?? 1;

        var importRequestId = $"IMP-{runId}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
        var confirmBody = new
        {
            import_request_id = importRequestId,
            draft_id = draftId,
            supplier_name = $"OCR Supplier {runId}",
            items = new[]
            {
                new
                {
                    line_no = lineNo,
                    product_id = matchedProductId,
                    quantity = 2m,
                    unit_cost = 10m,
                    line_total = 20m
                }
            }
        };

        var confirmPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/purchases/imports/confirm", confirmBody));
        Assert.Equal("confirmed", TestJson.GetString(confirmPayload, "status"));
        Assert.False(confirmPayload["idempotent_replay"]?.GetValue<bool>() ?? true);

        var stockAfterFirstConfirm = await GetStockByBarcodeAsync(barcode);
        Assert.Equal(baseStock + 2m, stockAfterFirstConfirm);

        var replayPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/purchases/imports/confirm", confirmBody));
        Assert.Equal("idempotent_replay", TestJson.GetString(replayPayload, "status"));
        Assert.True(replayPayload["idempotent_replay"]?.GetValue<bool>() ?? false);

        var stockAfterReplay = await GetStockByBarcodeAsync(barcode);
        Assert.Equal(stockAfterFirstConfirm, stockAfterReplay);
        AssertConfirmLockReleased(importRequestId);
    }

    [Fact]
    public async Task PurchaseImportConfirm_ShouldRequireApprovalReason_WhenDraftTotalsMismatch()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var barcode = $"OCRMISMATCH{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{runId}";
        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"OCR Mismatch Product {runId}",
                sku = $"OCR-MIS-{runId}",
                barcode,
                category_id = (Guid?)null,
                unit_price = 90m,
                cost_price = 50m,
                initial_stock_quantity = 3m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true
            }));

        var productName = TestJson.GetString(createProduct, "name");

        using var draftForm = BuildPdfUpload(
            fileName: $"purchase-mismatch-{runId}.pdf",
            textPayload: $"""
                %PDF-1.7
                Supplier: OCR Supplier {runId}
                Invoice No: INV-MIS-{runId}
                {productName} 1 10.00 10.00
                Subtotal: 10.00
                Tax: 0.00
                Total: 20.00
                /Type /Page
                """);

        var draftPayload = await TestJson.ReadObjectAsync(
            await client.PostAsync("/api/purchases/imports/ocr-draft", draftForm));
        var draftId = Guid.Parse(TestJson.GetString(draftPayload, "draft_id"));
        var firstLine = draftPayload["line_items"]?.AsArray()?.OfType<JsonObject>().FirstOrDefault()
                        ?? throw new InvalidOperationException("Draft did not include line items.");
        var mappedProductId = Guid.Parse(TestJson.GetString(firstLine, "matched_product_id"));
        var lineNo = firstLine["line_no"]?.GetValue<int>() ?? 1;

        var withoutReason = await client.PostAsJsonAsync("/api/purchases/imports/confirm", new
        {
            import_request_id = $"MIS-{runId}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
            draft_id = draftId,
            supplier_name = $"OCR Supplier {runId}",
            items = new[]
            {
                new
                {
                    line_no = lineNo,
                    product_id = mappedProductId,
                    quantity = 1m,
                    unit_cost = 10m,
                    line_total = 10m
                }
            }
        });

        Assert.Equal(HttpStatusCode.BadRequest, withoutReason.StatusCode);
        var errorBody = await withoutReason.Content.ReadFromJsonAsync<JsonObject>();
        var errorMessage = errorBody?["message"]?.GetValue<string>() ?? string.Empty;
        Assert.Contains("approval_reason", errorMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PurchaseImportConfirm_ShouldRejectDuplicateSupplierInvoice()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var runId = Guid.NewGuid().ToString("N")[..8];
        var barcode = $"OCRDUP{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{runId}";
        var createProduct = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/products", new
            {
                name = $"OCR Duplicate Product {runId}",
                sku = $"OCR-DUP-{runId}",
                barcode,
                category_id = (Guid?)null,
                unit_price = 70m,
                cost_price = 40m,
                initial_stock_quantity = 4m,
                reorder_level = 1m,
                allow_negative_stock = false,
                is_active = true
            }));

        var productName = TestJson.GetString(createProduct, "name");
        var supplierName = $"OCR Supplier Dup {runId}";
        var invoiceNo = $"INV-DUP-{runId}";

        var firstDraft = await CreateDraftAsync(supplierName, invoiceNo, productName);
        await ConfirmDraftOnceAsync(
            firstDraft,
            importRequestId: $"DUP-FIRST-{runId}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
            supplierName);

        var secondDraft = await CreateDraftAsync(supplierName, invoiceNo, productName);
        var duplicateResponse = await client.PostAsJsonAsync("/api/purchases/imports/confirm", new
        {
            import_request_id = $"DUP-SECOND-{runId}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
            draft_id = secondDraft.DraftId,
            supplier_name = supplierName,
            items = new[]
            {
                new
                {
                    line_no = secondDraft.LineNo,
                    product_id = secondDraft.ProductId,
                    quantity = 1m,
                    unit_cost = 12m,
                    line_total = 12m
                }
            }
        });

        Assert.Equal(HttpStatusCode.BadRequest, duplicateResponse.StatusCode);
        var errorBody = await duplicateResponse.Content.ReadFromJsonAsync<JsonObject>();
        var errorMessage = errorBody?["message"]?.GetValue<string>() ?? string.Empty;
        Assert.Contains("already exists", errorMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("clear-invoice-image.png", "image/png")]
    [InlineData("noisy-invoice-image.png", "image/png")]
    [InlineData("sample-supplier-bill.pdf", "application/pdf")]
    public async Task PurchaseOcrDraft_ShouldAcceptFixtureFiles(string fixtureFile, string contentType)
    {
        await TestAuth.SignInAsManagerAsync(client);

        var fixtureBytes = await ReadFixtureBytesAsync(fixtureFile);
        using var formData = BuildFixtureUpload(
            fileName: $"{Guid.NewGuid():N}-{fixtureFile}",
            bytes: fixtureBytes,
            contentType: contentType);

        var response = await client.PostAsync("/api/purchases/imports/ocr-draft", formData);
        var payload = await TestJson.ReadObjectAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.NotEqual(Guid.Empty, Guid.Parse(TestJson.GetString(payload, "draft_id")));

        var status = TestJson.GetString(payload, "status");
        var allowedStatuses = new[] { "parsed", "review_required", "manual_review_required" };
        Assert.Contains(status, allowedStatuses);
    }

    private async Task<(Guid DraftId, Guid ProductId, int LineNo)> CreateDraftAsync(
        string supplierName,
        string invoiceNo,
        string productName)
    {
        using var draftForm = BuildPdfUpload(
            fileName: $"purchase-draft-{Guid.NewGuid():N}.pdf",
            textPayload: $"""
                %PDF-1.7
                Supplier: {supplierName}
                Invoice No: {invoiceNo}
                {productName} 1 12.00 12.00
                Subtotal: 12.00
                Tax: 0.00
                Total: 12.00
                /Type /Page
                """);

        var draftPayload = await TestJson.ReadObjectAsync(
            await client.PostAsync("/api/purchases/imports/ocr-draft", draftForm));

        var draftId = Guid.Parse(TestJson.GetString(draftPayload, "draft_id"));
        var line = draftPayload["line_items"]?.AsArray()?.OfType<JsonObject>().FirstOrDefault()
                   ?? throw new InvalidOperationException("Draft line was missing.");

        var productId = Guid.Parse(TestJson.GetString(line, "matched_product_id"));
        var lineNo = line["line_no"]?.GetValue<int>() ?? 1;
        return (draftId, productId, lineNo);
    }

    private async Task ConfirmDraftOnceAsync(
        (Guid DraftId, Guid ProductId, int LineNo) draft,
        string importRequestId,
        string supplierName)
    {
        var response = await client.PostAsJsonAsync("/api/purchases/imports/confirm", new
        {
            import_request_id = importRequestId,
            draft_id = draft.DraftId,
            supplier_name = supplierName,
            items = new[]
            {
                new
                {
                    line_no = draft.LineNo,
                    product_id = draft.ProductId,
                    quantity = 1m,
                    unit_cost = 12m,
                    line_total = 12m
                }
            }
        });

        response.EnsureSuccessStatusCode();
    }

    private async Task<decimal> GetStockByBarcodeAsync(string barcode)
    {
        var payload = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/products/search?q={Uri.EscapeDataString(barcode)}"));

        var firstHit = payload["items"]?.AsArray()?.OfType<JsonObject>().FirstOrDefault()
                       ?? throw new InvalidOperationException($"Could not find product by barcode: {barcode}");

        return TestJson.GetDecimal(firstHit, "stockQuantity");
    }

    private static MultipartFormDataContent BuildPdfUpload(string fileName, string textPayload)
    {
        var form = new MultipartFormDataContent();
        var bytes = Encoding.UTF8.GetBytes(textPayload);
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("application/pdf");
        form.Add(fileContent, "file", fileName);
        form.Add(new StringContent("Acme Traders"), "supplier_hint");
        return form;
    }

    private static MultipartFormDataContent BuildFixtureUpload(string fileName, byte[] bytes, string contentType)
    {
        var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        form.Add(fileContent, "file", fileName);
        form.Add(new StringContent("Fixture Supplier"), "supplier_hint");
        return form;
    }

    private static async Task<byte[]> ReadFixtureBytesAsync(string fixtureFile)
    {
        var fixturePath = Path.Combine(AppContext.BaseDirectory, "Fixtures", fixtureFile);
        if (!File.Exists(fixturePath))
        {
            throw new FileNotFoundException($"Fixture file not found: {fixturePath}");
        }

        var bytes = await File.ReadAllBytesAsync(fixturePath);
        return NormalizeFixtureBytes(fixtureFile, bytes);
    }

    private static byte[] NormalizeFixtureBytes(string fixtureFile, byte[] bytes)
    {
        if (!fixtureFile.EndsWith(".png", StringComparison.OrdinalIgnoreCase) ||
            bytes.Length < 7 ||
            bytes[0] != 0x89 ||
            bytes[1] != 0x50 ||
            bytes[2] != 0x4E ||
            bytes[3] != 0x47 ||
            bytes[4] != 0x0A ||
            bytes[5] != 0x1A ||
            bytes[6] != 0x0A)
        {
            return bytes;
        }

        var normalized = new byte[bytes.Length + 1];
        normalized[0] = 0x89;
        normalized[1] = 0x50;
        normalized[2] = 0x4E;
        normalized[3] = 0x47;
        normalized[4] = 0x0D;
        normalized[5] = 0x0A;
        normalized[6] = 0x1A;
        normalized[7] = 0x0A;
        Array.Copy(bytes, 7, normalized, 8, bytes.Length - 7);
        return normalized;
    }

    private static void AssertConfirmLockReleased(string importRequestId)
    {
        var field = typeof(PurchaseService).GetField("ConfirmLocks", BindingFlags.NonPublic | BindingFlags.Static)
            ?? throw new InvalidOperationException("PurchaseService confirm lock dictionary was not found.");
        var dictionary = field.GetValue(null)
            ?? throw new InvalidOperationException("PurchaseService confirm lock dictionary was not initialized.");
        var containsKeyMethod = dictionary.GetType().GetMethod("ContainsKey", [typeof(string)])
            ?? throw new InvalidOperationException("Confirm lock dictionary does not expose ContainsKey.");
        var stillPresent = (bool?)containsKeyMethod.Invoke(dictionary, [importRequestId]) ?? false;

        Assert.False(stillPresent);
    }
}
