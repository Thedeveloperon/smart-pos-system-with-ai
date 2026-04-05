using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Purchases;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.IntegrationTests;

public sealed class PurchaseOcrUnitTests
{
    [Fact]
    public async Task BasicTextOcrProvider_ShouldParseStructuredBillText()
    {
        var provider = new BasicTextOcrProvider();
        var billText = """
            Supplier: Acme Traders
            Invoice No: INV-2026-9001
            Ceylon Tea 100g 2 450.00 900.00
            Coconut Oil Pure 750ml 1 1200.00 1200.00
            Subtotal: 2100.00
            Tax: 0.00
            Total: 2100.00
            """;

        var result = await provider.ExtractAsync(
            new BillFileData("structured-invoice.txt", "text/plain", Encoding.UTF8.GetBytes(billText)),
            CancellationToken.None);

        Assert.Equal("Acme Traders", result.SupplierName);
        Assert.Equal("INV-2026-9001", result.InvoiceNumber);
        Assert.Equal(2100.00m, result.Subtotal);
        Assert.Equal(0.00m, result.TaxTotal);
        Assert.Equal(2100.00m, result.GrandTotal);
        Assert.Equal(2, result.Lines.Count);

        var firstLine = result.Lines[0];
        Assert.Equal(1, firstLine.LineNumber);
        Assert.Equal("Ceylon Tea 100g", firstLine.ItemName);
        Assert.Equal(2m, firstLine.Quantity);
        Assert.Equal(450.00m, firstLine.UnitCost);
        Assert.Equal(900.00m, firstLine.LineTotal);
    }

    [Fact]
    public async Task BasicTextOcrProvider_ShouldPreferInvoiceNumberOverBillHeading()
    {
        var provider = new BasicTextOcrProvider();
        var ocrText = """
            Ceylon Wholesale Traders SUPPLIER BILL
            145 Main Street, Colombo 10 Invoice No: INV-2026-1042
            Subtotal (LKR) 3,200.00
            Tax (LKR) 0.00
            Grand Total (LKR) 3,200.00
            """;

        var result = await provider.ExtractAsync(
            new BillFileData("ocr-output.txt", "text/plain", Encoding.UTF8.GetBytes(ocrText)),
            CancellationToken.None);

        Assert.Equal("INV-2026-1042", result.InvoiceNumber);
        Assert.Equal("Ceylon Wholesale Traders", result.SupplierName);
        Assert.Equal(3200.00m, result.Subtotal);
        Assert.Equal(0.00m, result.TaxTotal);
        Assert.Equal(3200.00m, result.GrandTotal);
    }

    [Fact]
    public async Task BasicTextOcrProvider_ShouldInferQuantity_WhenOnlyUnitAndTotalDetected()
    {
        var provider = new BasicTextOcrProvider();
        var ocrText = """
            Ceylon Tea 100g 450.00 |900.00
            Coconut Oil Pure 750ml 1,200.00 1|200.00
            """;

        var result = await provider.ExtractAsync(
            new BillFileData("ocr-output.txt", "text/plain", Encoding.UTF8.GetBytes(ocrText)),
            CancellationToken.None);

        Assert.Equal(2, result.Lines.Count);

        var tea = result.Lines[0];
        Assert.Equal("Ceylon Tea 100g", tea.ItemName);
        Assert.Equal(2m, tea.Quantity);
        Assert.Equal(450.00m, tea.UnitCost);
        Assert.Equal(900.00m, tea.LineTotal);

        var oil = result.Lines[1];
        Assert.Equal("Coconut Oil Pure 750ml", oil.ItemName);
        Assert.Equal(1m, oil.Quantity);
        Assert.Equal(1200.00m, oil.UnitCost);
        Assert.Equal(1200.00m, oil.LineTotal);
    }

    [Fact]
    public async Task TesseractOcrProvider_ShouldFallbackToBasicText_ForNonImageFiles()
    {
        var provider = new TesseractOcrProvider(
            new BasicTextOcrProvider(),
            Options.Create(new PurchasingOptions
            {
                OcrProvider = "tesseract",
                TesseractCommand = $"missing-tesseract-{Guid.NewGuid():N}",
                TesseractLanguage = "eng",
                TesseractPageSegMode = 6
            }),
            NullLogger<TesseractOcrProvider>.Instance);

        var billText = """
            Supplier: Fallback Supplier
            Invoice No: INV-FALLBACK-001
            Milk Packet 1 450.00 450.00
            Subtotal: 450.00
            Tax: 0.00
            Total: 450.00
            """;

        var result = await provider.ExtractAsync(
            new BillFileData("fallback-invoice.pdf", "application/pdf", Encoding.UTF8.GetBytes(billText)),
            CancellationToken.None);

        Assert.Equal("basic-text", result.ProviderName);
        Assert.Equal("Fallback Supplier", result.SupplierName);
        Assert.Equal("INV-FALLBACK-001", result.InvoiceNumber);
        Assert.Single(result.Lines);
    }

    [Fact]
    public async Task TesseractOcrProvider_ShouldThrowUnavailable_WhenCommandMissingForImageFile()
    {
        var provider = new TesseractOcrProvider(
            new BasicTextOcrProvider(),
            Options.Create(new PurchasingOptions
            {
                OcrProvider = "tesseract",
                TesseractCommand = $"missing-tesseract-{Guid.NewGuid():N}",
                TesseractLanguage = "eng",
                TesseractPageSegMode = 6
            }),
            NullLogger<TesseractOcrProvider>.Instance);

        var pngLikeBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

        await Assert.ThrowsAsync<OcrProviderUnavailableException>(() =>
            provider.ExtractAsync(
                new BillFileData("missing-command.png", "image/png", pngLikeBytes),
                CancellationToken.None));
    }

    [Fact]
    public async Task CreateOcrDraft_ShouldClassifyExactFuzzyAndUnmatchedLines()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var dbOptions = new DbContextOptionsBuilder<SmartPosDbContext>()
            .UseSqlite(connection)
            .Options;

        await using var dbContext = new SmartPosDbContext(dbOptions);
        await dbContext.Database.EnsureCreatedAsync();

        SeedCatalogProducts(dbContext);

        var extraction = new PurchaseOcrExtractionResult
        {
            ProviderName = "unit-test-provider",
            SupplierName = "Unit Supplier",
            InvoiceNumber = "INV-UNIT-MATCH-001",
            Currency = "LKR",
            Subtotal = 300m,
            TaxTotal = 0m,
            GrandTotal = 300m,
            OverallConfidence = 0.91m,
            RawText = "unit test payload",
            Lines =
            [
                new PurchaseOcrExtractionLine
                {
                    LineNumber = 1,
                    ItemName = "775599001",
                    RawText = "775599001 1 50.00 50.00",
                    Quantity = 1m,
                    UnitCost = 50m,
                    LineTotal = 50m,
                    Confidence = 0.95m
                },
                new PurchaseOcrExtractionLine
                {
                    LineNumber = 2,
                    ItemName = "Fresh Milk Full Cream 1L",
                    RawText = "Fresh Milk Full Cream 1L 2 80.00 160.00",
                    Quantity = 2m,
                    UnitCost = 80m,
                    LineTotal = 160m,
                    Confidence = 0.96m
                },
                new PurchaseOcrExtractionLine
                {
                    LineNumber = 3,
                    ItemName = "Cocnut Oil Pure 750ml",
                    RawText = "Cocnut Oil Pure 750ml 1 70.00 70.00",
                    Quantity = 1m,
                    UnitCost = 70m,
                    LineTotal = 70m,
                    Confidence = 0.88m
                },
                new PurchaseOcrExtractionLine
                {
                    LineNumber = 4,
                    ItemName = "Unknown Snack Packet",
                    RawText = "Unknown Snack Packet 1 20.00 20.00",
                    Quantity = 1m,
                    UnitCost = 20m,
                    LineTotal = 20m,
                    Confidence = 0.91m
                }
            ]
        };

        var purchaseService = BuildPurchaseService(
            dbContext,
            extraction,
            new PurchasingOptions
            {
                EnableOcrImport = true,
                TotalsToleranceAmount = 2m,
                FuzzyMatchThreshold = 0.45m,
                LowConfidenceThreshold = 0.75m
            });
        var uploadFile = BuildPngFormFile(
            "match-classification.png",
            "fixture payload for classification");

        var response = await purchaseService.CreateOcrDraftAsync(
            uploadFile,
            supplierHint: null,
            correlationId: "unit-correlation-001",
            cancellationToken: CancellationToken.None);

        Assert.Equal(4, response.LineItems.Count);

        var exactCode = response.LineItems.Single(x => x.LineNumber == 1);
        Assert.Equal("matched", exactCode.MatchStatus);
        Assert.Equal("exact_code", exactCode.MatchMethod);
        Assert.NotNull(exactCode.MatchedProductId);

        var exactName = response.LineItems.Single(x => x.LineNumber == 2);
        Assert.Equal("matched", exactName.MatchStatus);
        Assert.Equal("exact_name", exactName.MatchMethod);
        Assert.NotNull(exactName.MatchedProductId);

        var fuzzy = response.LineItems.Single(x => x.LineNumber == 3);
        Assert.Equal("matched_fuzzy", fuzzy.MatchStatus);
        Assert.Equal("fuzzy_name", fuzzy.MatchMethod);
        Assert.Equal("needs_review", fuzzy.ReviewStatus);
        Assert.NotNull(fuzzy.MatchedProductId);

        var unmatched = response.LineItems.Single(x => x.LineNumber == 4);
        Assert.Equal("unmatched", unmatched.MatchStatus);
        Assert.Equal("needs_review", unmatched.ReviewStatus);
        Assert.Null(unmatched.MatchedProductId);

        Assert.True(response.ReviewRequired);
        Assert.False(response.CanAutoCommit);
        Assert.Contains("fuzzy_match_requires_review", response.BlockedReasons);
        Assert.Contains("unmatched_line_items", response.BlockedReasons);
    }

    [Fact]
    public async Task CreateOcrDraft_ShouldRequireApprovalReason_WhenTotalsOutOfTolerance()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var dbOptions = new DbContextOptionsBuilder<SmartPosDbContext>()
            .UseSqlite(connection)
            .Options;

        await using var dbContext = new SmartPosDbContext(dbOptions);
        await dbContext.Database.EnsureCreatedAsync();

        SeedCatalogProducts(dbContext);

        var extraction = new PurchaseOcrExtractionResult
        {
            ProviderName = "unit-test-provider",
            SupplierName = "Totals Supplier",
            InvoiceNumber = "INV-UNIT-TOTALS-001",
            Currency = "LKR",
            Subtotal = 100m,
            TaxTotal = 0m,
            GrandTotal = 130m,
            OverallConfidence = 0.95m,
            RawText = "totals mismatch payload",
            Lines =
            [
                new PurchaseOcrExtractionLine
                {
                    LineNumber = 1,
                    ItemName = "Fresh Milk Full Cream 1L",
                    RawText = "Fresh Milk Full Cream 1L 1 100.00 100.00",
                    Quantity = 1m,
                    UnitCost = 100m,
                    LineTotal = 100m,
                    Confidence = 0.96m
                }
            ]
        };

        var purchaseService = BuildPurchaseService(
            dbContext,
            extraction,
            new PurchasingOptions
            {
                EnableOcrImport = true,
                TotalsToleranceAmount = 2m,
                FuzzyMatchThreshold = 0.72m,
                LowConfidenceThreshold = 0.75m
            });

        var uploadFile = BuildPngFormFile(
            "totals-mismatch.png",
            "fixture payload for totals mismatch");

        var response = await purchaseService.CreateOcrDraftAsync(
            uploadFile,
            supplierHint: null,
            correlationId: "unit-correlation-002",
            cancellationToken: CancellationToken.None);

        Assert.False(response.Totals.WithinTolerance);
        Assert.True(response.Totals.RequiresApprovalReason);
        Assert.True(response.ReviewRequired);
        Assert.Contains("totals_mismatch_requires_approval", response.BlockedReasons);
    }

    private static PurchaseService BuildPurchaseService(
        SmartPosDbContext dbContext,
        PurchaseOcrExtractionResult extraction,
        PurchasingOptions? purchasingOptions = null)
    {
        var httpContextAccessor = new HttpContextAccessor
        {
            HttpContext = new DefaultHttpContext()
        };

        var options = Options.Create(purchasingOptions ?? new PurchasingOptions
        {
            EnableOcrImport = true,
            TotalsToleranceAmount = 2m,
            FuzzyMatchThreshold = 0.72m,
            LowConfidenceThreshold = 0.75m
        });

        return new PurchaseService(
            dbContext,
            new StubOcrProvider(extraction),
            new NoOpBillMalwareScanner(),
            options,
            httpContextAccessor,
            new AuditLogService(dbContext, httpContextAccessor),
            NullLogger<PurchaseService>.Instance);
    }

    private static void SeedCatalogProducts(SmartPosDbContext dbContext)
    {
        var now = DateTimeOffset.UtcNow;

        Product BuildProduct(string name, string sku, string barcode)
        {
            var product = new Product
            {
                Name = name,
                Sku = sku,
                Barcode = barcode,
                UnitPrice = 100m,
                CostPrice = 60m,
                IsActive = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            var inventory = new InventoryRecord
            {
                Product = product,
                ProductId = product.Id,
                QuantityOnHand = 10m,
                ReorderLevel = 2m,
                SafetyStock = 0m,
                TargetStockLevel = 0m,
                AllowNegativeStock = false,
                UpdatedAtUtc = now
            };

            product.Inventory = inventory;
            return product;
        }

        dbContext.Products.AddRange(
            BuildProduct("Barcode Matched Item", "BAR-SKU-001", "775599001"),
            BuildProduct("Fresh Milk Full Cream 1L", "MILK-1L", "775599002"),
            BuildProduct("Coconut Oil Pure 750ml", "COCO-750", "775599003"));

        dbContext.SaveChanges();
    }

    private static FormFile BuildPngFormFile(string fileName, string payload)
    {
        var header = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
        var bytes = header.Concat(Encoding.UTF8.GetBytes(payload)).ToArray();
        var stream = new MemoryStream(bytes);

        return new FormFile(stream, 0, bytes.Length, "file", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };
    }

    private sealed class StubOcrProvider(PurchaseOcrExtractionResult extraction) : IOcrProvider
    {
        public Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken)
        {
            return Task.FromResult(extraction);
        }
    }
}
