using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Inventory;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Purchases;

public sealed class PurchaseService(
    SmartPosDbContext dbContext,
    IOcrProvider ocrProvider,
    IBillMalwareScanner malwareScanner,
    IOptions<PurchasingOptions> options,
    IHttpContextAccessor httpContextAccessor,
    AuditLogService auditLogService,
    StockMovementHelper stockMovementHelper,
    ILogger<PurchaseService> logger)
{
    private static readonly string[] AllowedExtensions = [".pdf", ".png", ".jpg", ".jpeg"];
    private static readonly Regex CodeTokenRegex = new(@"[A-Za-z0-9\-]{3,}", RegexOptions.Compiled);
    private static readonly ConcurrentDictionary<string, ConfirmLockEntry> ConfirmLocks = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Meter PurchasingMeter = new("SmartPos.Purchasing", "1.0.0");
    private static readonly Counter<long> OcrDraftCounter = PurchasingMeter.CreateCounter<long>(
        "smartpos.purchasing.ocr_draft.total",
        description: "Number of OCR draft attempts.");
    private static readonly Counter<long> OcrManualReviewCounter = PurchasingMeter.CreateCounter<long>(
        "smartpos.purchasing.ocr_manual_review.total",
        description: "Number of OCR drafts that require manual review.");
    private static readonly Counter<long> OcrProviderFallbackCounter = PurchasingMeter.CreateCounter<long>(
        "smartpos.purchasing.ocr_provider_fallback.total",
        description: "Number of OCR provider fallback events.");
    private static readonly Counter<long> OcrTotalsMismatchCounter = PurchasingMeter.CreateCounter<long>(
        "smartpos.purchasing.ocr_totals_mismatch.total",
        description: "Number of OCR drafts with totals mismatch requiring approval.");
    private static readonly Counter<long> ImportConfirmCounter = PurchasingMeter.CreateCounter<long>(
        "smartpos.purchasing.import_confirm.total",
        description: "Number of purchase import confirm outcomes.");

    public async Task<PurchaseOcrDraftResponse> CreateOcrDraftAsync(
        IFormFile? file,
        string? supplierHint,
        string correlationId,
        CancellationToken cancellationToken)
    {
        if (!options.Value.EnableOcrImport)
        {
            throw new InvalidOperationException("Supplier bill OCR import is disabled.");
        }

        var validated = await ValidateAndReadFileAsync(file, cancellationToken);
        var scanResult = await malwareScanner.ScanAsync(validated.FileData, cancellationToken);
        var now = DateTimeOffset.UtcNow;

        if (!scanResult.IsClean)
        {
            logger.LogWarning(
                "Supplier bill upload rejected by malware scanner for file {FileName}. Status: {Status}",
                validated.FileData.FileName,
                scanResult.Status);
            RecordDraftTelemetry(
                provider: "malware-scan",
                status: "rejected",
                reviewRequired: true,
                blockedReasons: ["malware_scan_rejected", "manual_review_required"],
                totalsMismatch: false);
            var rejectedDocument = await SaveDraftDocumentAsync(
                validated.FileData,
                fileHash: validated.FileHash,
                status: "rejected",
                confidence: null,
                payloadJson: JsonSerializer.Serialize(new
                {
                    correlation_id = correlationId,
                    reason = scanResult.Message ?? "malware_scan_rejected"
                }),
                processedAtUtc: now,
                cancellationToken: cancellationToken);

            return new PurchaseOcrDraftResponse
            {
                DraftId = rejectedDocument.Id,
                CorrelationId = correlationId,
                Status = "rejected",
                ScanStatus = scanResult.Status,
                FileName = validated.FileData.FileName,
                ContentType = validated.FileData.ContentType,
                FileSize = validated.FileData.Bytes.LongLength,
                Currency = "LKR",
                ReviewRequired = true,
                CanAutoCommit = false,
                BlockedReasons = ["malware_scan_rejected", "manual_review_required"],
                Warnings =
                [
                    scanResult.Message ?? "File was rejected by malware scan."
                ],
                Totals = new PurchaseOcrTotalsValidationResponse
                {
                    Tolerance = Math.Round(Math.Max(0m, options.Value.TotalsToleranceAmount), 2),
                    WithinTolerance = true,
                    RequiresApprovalReason = false
                },
                CreatedAt = now
            };
        }

        PurchaseOcrExtractionResult extraction;
        var warnings = new List<string>();
        var providerFallback = false;

        try
        {
            extraction = await ocrProvider.ExtractAsync(validated.FileData, cancellationToken);
        }
        catch (OcrProviderUnavailableException exception)
        {
            providerFallback = true;
            OcrProviderFallbackCounter.Add(1);
            logger.LogWarning(
                exception,
                "OCR provider fallback triggered for file {FileName}.",
                validated.FileData.FileName);
            warnings.Add(exception.Message);
            extraction = new PurchaseOcrExtractionResult
            {
                ProviderName = "fallback-manual",
                ProviderModel = null,
                SupplierName = NormalizeOptional(supplierHint),
                Currency = "LKR",
                OverallConfidence = 0m,
                RawText = null,
                Lines = []
            };
        }

        if (extraction.Warnings.Count > 0)
        {
            warnings.AddRange(extraction.Warnings);
        }

        var lowConfidenceThreshold = Math.Clamp(options.Value.LowConfidenceThreshold, 0m, 1m);
        var fuzzyThreshold = Math.Clamp(options.Value.FuzzyMatchThreshold, 0m, 1m);
        var lines = NormalizeLines(extraction.Lines, lowConfidenceThreshold);
        var catalogProducts = await LoadCatalogProductsAsync(cancellationToken);
        var matchOutcome = ApplyProductMatching(lines, catalogProducts, lowConfidenceThreshold, fuzzyThreshold);
        var totals = ValidateTotals(extraction, matchOutcome.Lines);
        var blockedReasons = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var reason in matchOutcome.BlockedReasons)
        {
            blockedReasons.Add(reason);
        }

        if (providerFallback)
        {
            blockedReasons.Add("ocr_provider_unavailable");
        }

        if (matchOutcome.Lines.Count == 0)
        {
            blockedReasons.Add("no_line_items_extracted");
        }

        if (totals.RequiresApprovalReason)
        {
            OcrTotalsMismatchCounter.Add(1);
            blockedReasons.Add("totals_mismatch_requires_approval");
            warnings.Add(
                $"Totals mismatch detected (difference {totals.Difference:0.00} > tolerance {totals.Tolerance:0.00}). Approval reason is required.");
        }

        var reviewRequired = providerFallback ||
                             matchOutcome.ReviewRequired ||
                             totals.RequiresApprovalReason ||
                             matchOutcome.Lines.Count == 0;
        if (reviewRequired)
        {
            blockedReasons.Add("manual_review_required");
        }

        var canAutoCommit = !reviewRequired && blockedReasons.Count == 0;
        var status = providerFallback
            ? "manual_review_required"
            : reviewRequired
                ? "review_required"
                : "parsed";

        if (matchOutcome.Lines.Count == 0)
        {
            warnings.Add("No line items were confidently extracted. Manual mapping is required.");
        }

        if (!string.IsNullOrWhiteSpace(supplierHint) && string.IsNullOrWhiteSpace(extraction.SupplierName))
        {
            extraction.SupplierName = NormalizeOptional(supplierHint);
        }

        var payload = new
        {
            correlation_id = correlationId,
            provider = extraction.ProviderName,
            provider_model = extraction.ProviderModel,
            extraction.SupplierName,
            extraction.InvoiceNumber,
            extraction.InvoiceDate,
            extraction.Currency,
            extraction.Subtotal,
            extraction.TaxTotal,
            extraction.GrandTotal,
            extraction.OverallConfidence,
            extraction.RawText,
            lines = matchOutcome.Lines.Select(x => new
            {
                line_no = x.LineNumber,
                raw_text = x.RawText,
                item_name = x.ItemName,
                quantity = x.Quantity,
                unit_cost = x.UnitCost,
                line_total = x.LineTotal,
                confidence = x.Confidence,
                review_status = x.ReviewStatus,
                match_status = x.MatchStatus,
                match_method = x.MatchMethod,
                match_score = x.MatchScore,
                matched_product_id = x.MatchedProductId,
                matched_product_name = x.MatchedProductName,
                matched_product_sku = x.MatchedProductSku,
                matched_product_barcode = x.MatchedProductBarcode
            }),
            totals = new
            {
                totals.LineTotalSum,
                totals.ExtractedSubtotal,
                totals.ExtractedTaxTotal,
                totals.ExtractedGrandTotal,
                totals.ExpectedGrandTotal,
                totals.Difference,
                totals.Tolerance,
                totals.WithinTolerance,
                totals.RequiresApprovalReason
            },
            blocked_reasons = blockedReasons.OrderBy(x => x).ToArray(),
            warnings
        };

        var document = await SaveDraftDocumentAsync(
            validated.FileData,
            fileHash: validated.FileHash,
            status: status,
            confidence: extraction.OverallConfidence,
            payloadJson: JsonSerializer.Serialize(payload),
            processedAtUtc: now,
            cancellationToken: cancellationToken);
        var orderedBlockedReasons = blockedReasons.OrderBy(x => x).ToList();
        RecordDraftTelemetry(
            provider: extraction.ProviderName,
            status: status,
            reviewRequired: reviewRequired,
            blockedReasons: orderedBlockedReasons,
            totalsMismatch: totals.RequiresApprovalReason);
        logger.LogInformation(
            "Purchase OCR draft completed. Provider={Provider}, Status={Status}, ReviewRequired={ReviewRequired}, LineCount={LineCount}, BlockedReasons={BlockedReasons}.",
            extraction.ProviderName,
            status,
            reviewRequired,
            matchOutcome.Lines.Count,
            orderedBlockedReasons.Count == 0 ? "none" : string.Join(",", orderedBlockedReasons));

        return new PurchaseOcrDraftResponse
        {
            DraftId = document.Id,
            CorrelationId = correlationId,
            Status = status,
            ScanStatus = scanResult.Status,
            FileName = validated.FileData.FileName,
            ContentType = validated.FileData.ContentType,
            FileSize = validated.FileData.Bytes.LongLength,
            SupplierName = extraction.SupplierName,
            InvoiceNumber = extraction.InvoiceNumber,
            InvoiceDate = extraction.InvoiceDate,
            Currency = extraction.Currency,
            Subtotal = extraction.Subtotal,
            TaxTotal = extraction.TaxTotal,
            GrandTotal = extraction.GrandTotal,
            OcrConfidence = extraction.OverallConfidence,
            ExtractionProvider = extraction.ProviderName,
            ExtractionModel = extraction.ProviderModel,
            ReviewRequired = reviewRequired,
            CanAutoCommit = canAutoCommit,
            BlockedReasons = orderedBlockedReasons,
            Totals = totals,
            LineItems = matchOutcome.Lines,
            Warnings = warnings,
            CreatedAt = now
        };
    }

    public async Task<PurchaseImportConfirmResponse> ConfirmImportAsync(
        PurchaseImportConfirmRequest request,
        CancellationToken cancellationToken)
    {
        var importRequestId = NormalizeRequired(request.ImportRequestId, "import_request_id is required.");
        if (request.DraftId == Guid.Empty)
        {
            throw new InvalidOperationException("draft_id is required.");
        }

        if (request.Items.Count == 0)
        {
            throw new InvalidOperationException("At least one mapped line item is required.");
        }

        var lockEntry = AcquireConfirmLock(importRequestId);
        var lockAcquired = false;
        try
        {
            await lockEntry.Semaphore.WaitAsync(cancellationToken);
            lockAcquired = true;
            return await ConfirmImportInternalAsync(importRequestId, request, cancellationToken);
        }
        finally
        {
            if (lockAcquired)
            {
                lockEntry.Semaphore.Release();
            }

            if (lockEntry.ReleaseReference() == 0)
            {
                ConfirmLocks.TryRemove(new KeyValuePair<string, ConfirmLockEntry>(importRequestId, lockEntry));
                lockEntry.Dispose();
            }
        }
    }

    public async Task<List<PurchaseBillSummaryResponse>> ListBillsAsync(
        Guid? supplierId,
        Guid? purchaseOrderId,
        DateTimeOffset? fromDate,
        DateTimeOffset? toDate,
        int? page,
        int? take,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var normalizedPage = Math.Max(1, page ?? 1);
        var normalizedTake = Math.Clamp(take ?? 20, 1, 100);

        var query = dbContext.PurchaseBills
            .AsNoTracking()
            .AsQueryable();

        if (currentStoreId.HasValue)
        {
            query = query.Where(x => x.StoreId == currentStoreId.Value);
        }

        if (supplierId.HasValue)
        {
            query = query.Where(x => x.SupplierId == supplierId.Value);
        }

        if (purchaseOrderId.HasValue)
        {
            query = query.Where(x => x.PurchaseOrderId == purchaseOrderId.Value);
        }

        if (fromDate.HasValue)
        {
            query = query.Where(x => x.InvoiceDateUtc >= fromDate.Value);
        }

        if (toDate.HasValue)
        {
            query = query.Where(x => x.InvoiceDateUtc < toDate.Value.AddDays(1));
        }

        return await query
            .OrderByDescending(x => x.InvoiceDateUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .Skip((normalizedPage - 1) * normalizedTake)
            .Take(normalizedTake)
            .Select(x => new PurchaseBillSummaryResponse
            {
                Id = x.Id,
                PurchaseOrderId = x.PurchaseOrderId,
                InvoiceNumber = x.InvoiceNumber,
                InvoiceDate = x.InvoiceDateUtc,
                SourceType = x.SourceType,
                GrandTotal = RoundMoney(x.GrandTotal),
                CreatedAtUtc = x.CreatedAtUtc
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<PurchaseBillDetailResponse> GetBillAsync(
        Guid billId,
        CancellationToken cancellationToken)
    {
        if (billId == Guid.Empty)
        {
            throw new InvalidOperationException("bill_id is required.");
        }

        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var bill = await dbContext.PurchaseBills
            .AsNoTracking()
            .Include(x => x.Supplier)
            .Include(x => x.PurchaseOrder)
            .Include(x => x.Items)
                .ThenInclude(x => x.Product)
            .FirstOrDefaultAsync(x => x.Id == billId, cancellationToken);

        if (bill is null || (currentStoreId.HasValue && bill.StoreId != currentStoreId.Value))
        {
            throw new KeyNotFoundException("Purchase bill not found.");
        }

        return ToBillDetailResponse(bill);
    }

    public async Task<PurchaseBillDetailResponse> CreateManualBillAsync(
        CreateManualBillRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var createdByUserId = ParseGuid(
            httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier));

        var supplier = await dbContext.Suppliers
            .FirstOrDefaultAsync(x => x.Id == request.SupplierId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken)
            ?? throw new KeyNotFoundException("Supplier not found.");

        var invoiceNumber = NormalizeRequired(request.InvoiceNumber, "invoice_number is required.");
        if (request.InvoiceDate == default)
        {
            throw new InvalidOperationException("invoice_date is required.");
        }
        if (request.Items.Count == 0)
        {
            throw new InvalidOperationException("At least one bill item is required.");
        }

        var duplicateInvoice = await dbContext.PurchaseBills
            .AsNoTracking()
            .AnyAsync(x =>
                    x.SupplierId == supplier.Id &&
                    x.InvoiceNumber.ToLower() == invoiceNumber.ToLower() &&
                    (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value),
                cancellationToken);
        if (duplicateInvoice)
        {
            throw new InvalidOperationException("A purchase bill with this supplier and invoice number already exists.");
        }

        PurchaseOrder? purchaseOrder = null;
        if (request.PurchaseOrderId.HasValue && request.PurchaseOrderId.Value != Guid.Empty)
        {
            purchaseOrder = await dbContext.PurchaseOrders
                .Include(x => x.Supplier)
                .FirstOrDefaultAsync(x => x.Id == request.PurchaseOrderId.Value && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken)
                ?? throw new KeyNotFoundException("Purchase order not found.");

            if (purchaseOrder.SupplierId != supplier.Id)
            {
                throw new InvalidOperationException("The purchase order supplier does not match the selected supplier.");
            }
        }

        var normalizedLines = request.Items
            .Select(x => NormalizeBillLine(x.ProductId, x.Quantity, x.UnitCost, x.SupplierItemName, x.BatchNumber, x.ExpiryDate, x.ManufactureDate))
            .ToList();

        var productIds = normalizedLines.Select(x => x.ProductId).Distinct().ToArray();
        if (productIds.Any(x => x == Guid.Empty))
        {
            throw new InvalidOperationException("All bill items must include a valid product_id.");
        }

        var products = await dbContext.Products
            .Include(x => x.Inventory)
            .Where(x => productIds.Contains(x.Id))
            .Where(x => !currentStoreId.HasValue || x.StoreId == currentStoreId.Value)
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        if (products.Count != productIds.Length)
        {
            throw new InvalidOperationException("One or more bill products were not found.");
        }

        var invoiceDate = request.InvoiceDate == default ? DateTimeOffset.UtcNow : request.InvoiceDate;
        var subtotal = RoundMoney(normalizedLines.Sum(x => x.LineTotal));
        var grandTotal = subtotal;
        var now = DateTimeOffset.UtcNow;

        var purchaseBill = new PurchaseBill
        {
            StoreId = currentStoreId,
            Supplier = supplier,
            SupplierId = supplier.Id,
            PurchaseOrder = purchaseOrder,
            PurchaseOrderId = purchaseOrder?.Id,
            InvoiceNumber = invoiceNumber,
            InvoiceDateUtc = invoiceDate,
            Currency = "LKR",
            Subtotal = subtotal,
            DiscountTotal = 0m,
            TaxTotal = 0m,
            GrandTotal = grandTotal,
            SourceType = "manual",
            CreatedByUserId = createdByUserId,
            Notes = NormalizeOptional(request.Notes),
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        var purchaseBillItems = new List<PurchaseBillItem>();
        foreach (var line in normalizedLines)
        {
            var product = products[line.ProductId];
            purchaseBillItems.Add(new PurchaseBillItem
            {
                PurchaseBill = purchaseBill,
                Product = product,
                ProductId = product.Id,
                ProductNameSnapshot = product.Name,
                SupplierItemName = line.SupplierItemName,
                Quantity = line.Quantity,
                UnitCost = line.UnitCost,
                TaxAmount = 0m,
                LineTotal = line.LineTotal,
                CreatedAtUtc = now
            });
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            dbContext.PurchaseBills.Add(purchaseBill);
            dbContext.PurchaseBillItems.AddRange(purchaseBillItems);
            await ApplyPurchaseBillInventoryAsync(
                purchaseBill,
                normalizedLines,
                request.UpdateCostPrice,
                cancellationToken);

            purchaseBill.UpdatedAtUtc = now;

            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            logger.LogInformation(
                "Manual purchase bill created. PurchaseBillId={PurchaseBillId}, SupplierId={SupplierId}, ItemCount={ItemCount}.",
                purchaseBill.Id,
                purchaseBill.SupplierId,
                purchaseBillItems.Count);

            return await GetBillAsync(purchaseBill.Id, cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    internal async Task<IReadOnlyList<PurchaseInventoryUpdateResponse>> ApplyPurchaseBillInventoryAsync(
        PurchaseBill purchaseBill,
        IReadOnlyCollection<PurchaseBillInventoryLine> lines,
        bool updateCostPrice,
        CancellationToken cancellationToken)
    {
        if (purchaseBill.Supplier is null)
        {
            throw new InvalidOperationException("Purchase bill supplier is required.");
        }

        if (lines.Count == 0)
        {
            throw new InvalidOperationException("At least one bill item is required.");
        }

        var currentStoreId = purchaseBill.StoreId;
        var productIds = lines.Select(x => x.ProductId).Distinct().ToArray();
        var products = await dbContext.Products
            .Include(x => x.Inventory)
            .Where(x => productIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        if (products.Count != productIds.Length)
        {
            throw new InvalidOperationException("One or more bill products were not found.");
        }

        var now = DateTimeOffset.UtcNow;
        var createdByUserId = ParseGuid(
            httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier));
        var inventoryUpdates = new List<PurchaseInventoryUpdateResponse>();

        var lineIndex = 0;
        foreach (var line in lines)
        {
            lineIndex++;
            var product = products[line.ProductId];
            var inventory = product.Inventory;
            if (inventory is null)
            {
                inventory = new InventoryRecord
                {
                    Product = product,
                    ProductId = product.Id,
                    StoreId = currentStoreId,
                    QuantityOnHand = 0m,
                    ReorderLevel = 0m,
                    SafetyStock = 0m,
                    TargetStockLevel = 0m,
                    AllowNegativeStock = true,
                    UpdatedAtUtc = now
                };
                dbContext.Inventory.Add(inventory);
                product.Inventory = inventory;
            }

            inventory.StoreId = currentStoreId;
            var previousQty = RoundQuantity(inventory.QuantityOnHand);
            var deltaQty = RoundQuantity(line.Quantity);
            var batchNumber = NormalizeOptional(line.BatchNumber) ??
                              NormalizeOptional(line.SupplierItemName) ??
                              $"{purchaseBill.InvoiceNumber}-{lineIndex:000}";

            if (product.IsBatchTracked)
            {
                var existingBatch = await dbContext.ProductBatches.FirstOrDefaultAsync(
                    x => x.ProductId == product.Id &&
                         x.BatchNumber == batchNumber &&
                         x.StoreId == currentStoreId,
                    cancellationToken);

                if (existingBatch is null)
                {
                    existingBatch = new ProductBatch
                    {
                        StoreId = currentStoreId,
                        ProductId = product.Id,
                        SupplierId = purchaseBill.SupplierId,
                        PurchaseBill = purchaseBill,
                        PurchaseBillId = purchaseBill.Id,
                        BatchNumber = batchNumber,
                        ManufactureDate = line.ManufactureDate,
                        ExpiryDate = line.ExpiryDate,
                        InitialQuantity = deltaQty,
                        RemainingQuantity = deltaQty,
                        CostPrice = line.UnitCost,
                        ReceivedAtUtc = now,
                        CreatedAtUtc = now,
                        UpdatedAtUtc = now,
                        Product = product
                    };
                    dbContext.ProductBatches.Add(existingBatch);
                }
                else
                {
                    existingBatch.RemainingQuantity = RoundQuantity(existingBatch.RemainingQuantity + deltaQty);
                    existingBatch.InitialQuantity = RoundQuantity(existingBatch.InitialQuantity + deltaQty);
                    existingBatch.CostPrice = line.UnitCost;
                    if (line.ManufactureDate.HasValue)
                    {
                        existingBatch.ManufactureDate = line.ManufactureDate;
                    }

                    if (line.ExpiryDate.HasValue)
                    {
                        existingBatch.ExpiryDate = line.ExpiryDate;
                    }

                    existingBatch.UpdatedAtUtc = now;
                }
            }

            if (updateCostPrice)
            {
                product.CostPrice = ComputeWeightedCost(
                    currentCostPrice: product.CostPrice,
                    currentStockQty: previousQty,
                    incomingUnitCost: line.UnitCost,
                    incomingQty: deltaQty);
            }

            product.UpdatedAtUtc = now;
            await UpsertProductSupplierFromPurchaseAsync(
                product,
                purchaseBill.Supplier,
                new ConfirmLine(null, line.ProductId, line.SupplierItemName, line.Quantity, line.UnitCost, line.LineTotal),
                now,
                cancellationToken);

            await stockMovementHelper.RecordMovementAsync(
                storeId: currentStoreId,
                productId: product.Id,
                type: StockMovementType.Purchase,
                quantityChange: deltaQty,
                refType: StockMovementRef.Purchase,
                refId: purchaseBill.Id,
                batchId: null,
                serialNumber: null,
                reason: purchaseBill.SourceType,
                userId: createdByUserId,
                cancellationToken);

            inventoryUpdates.Add(new PurchaseInventoryUpdateResponse
            {
                ProductId = product.Id,
                ProductName = product.Name,
                PreviousQuantity = previousQty,
                DeltaQuantity = deltaQty,
                NewQuantity = RoundQuantity(previousQty + deltaQty)
            });
        }

        dbContext.Ledger.Add(new LedgerEntry
        {
            StoreId = currentStoreId,
            EntryType = LedgerEntryType.StockAdjustment,
            Description = $"Purchase {purchaseBill.SourceType} {purchaseBill.InvoiceNumber} ({lines.Count} items)",
            Debit = purchaseBill.GrandTotal,
            Credit = 0m,
            OccurredAtUtc = now,
            CreatedAtUtc = now
        });

        return inventoryUpdates;
    }

    private async Task<PurchaseImportConfirmResponse> ConfirmImportInternalAsync(
        string importRequestId,
        PurchaseImportConfirmRequest request,
        CancellationToken cancellationToken)
    {
        var existingByImportId = await dbContext.PurchaseBills
            .AsNoTracking()
            .Include(x => x.Supplier)
            .Include(x => x.Items)
            .FirstOrDefaultAsync(x => x.ImportRequestId == importRequestId, cancellationToken);
        if (existingByImportId is not null)
        {
            RecordConfirmTelemetry("idempotent_replay");
            logger.LogInformation(
                "Purchase import confirm replayed by import request id. ImportRequestId={ImportRequestId}, PurchaseBillId={PurchaseBillId}.",
                importRequestId,
                existingByImportId.Id);
            return ToConfirmResponse(existingByImportId, idempotentReplay: true, []);
        }

        var draftDocument = await dbContext.BillDocuments
            .FirstOrDefaultAsync(x => x.Id == request.DraftId, cancellationToken)
            ?? throw new KeyNotFoundException("OCR draft not found.");

        if (draftDocument.PurchaseBillId.HasValue)
        {
            var linked = await dbContext.PurchaseBills
                .AsNoTracking()
                .Include(x => x.Supplier)
                .Include(x => x.Items)
                .FirstOrDefaultAsync(x => x.Id == draftDocument.PurchaseBillId.Value, cancellationToken);

            if (linked is null)
            {
                throw new InvalidOperationException("Draft is already linked to a missing purchase record.");
            }

            if (string.Equals(linked.ImportRequestId, importRequestId, StringComparison.OrdinalIgnoreCase))
            {
                RecordConfirmTelemetry("idempotent_replay");
                logger.LogInformation(
                    "Purchase import confirm replayed by draft link. ImportRequestId={ImportRequestId}, DraftId={DraftId}, PurchaseBillId={PurchaseBillId}.",
                    importRequestId,
                    request.DraftId,
                    linked.Id);
                return ToConfirmResponse(linked, idempotentReplay: true, []);
            }

            throw new InvalidOperationException("Draft has already been confirmed with a different import_request_id.");
        }

        var metadata = ParseDraftMetadata(draftDocument.ExtractedPayloadJson);
        var requiresApprovalReason = metadata.RequiresApprovalReason;
        var approvalReason = NormalizeOptional(request.ApprovalReason);
        if (requiresApprovalReason && string.IsNullOrWhiteSpace(approvalReason))
        {
            throw new InvalidOperationException("approval_reason is required because draft totals are out of tolerance.");
        }

        if (metadata.LineNumbers.Count > 0)
        {
            var mappedLineNumbers = request.Items
                .Where(x => x.LineNumber.HasValue)
                .Select(x => x.LineNumber!.Value)
                .ToHashSet();

            var missingLineNumbers = metadata.LineNumbers
                .Where(lineNo => !mappedLineNumbers.Contains(lineNo))
                .ToList();

            if (missingLineNumbers.Count > 0)
            {
                throw new InvalidOperationException(
                    $"Line mapping is incomplete. Missing mapped lines: {string.Join(", ", missingLineNumbers)}.");
            }
        }

        var supplier = await ResolveSupplierAsync(
            request.SupplierId,
            request.SupplierName,
            metadata.SupplierName,
            cancellationToken);

        var invoiceNumber = NormalizeOptional(request.InvoiceNumber) ??
                            metadata.InvoiceNumber ??
                            throw new InvalidOperationException("invoice_number is required.");

        var duplicateInvoice = await dbContext.PurchaseBills
            .AsNoTracking()
            .AnyAsync(x =>
                    x.SupplierId == supplier.Id &&
                    x.InvoiceNumber.ToLower() == invoiceNumber.ToLower() &&
                    x.ImportRequestId != importRequestId,
                cancellationToken);

        if (duplicateInvoice)
        {
            throw new InvalidOperationException("A purchase bill with this supplier and invoice number already exists.");
        }

        var productIds = request.Items
            .Select(x => x.ProductId)
            .Distinct()
            .ToArray();

        if (productIds.Any(x => x == Guid.Empty))
        {
            throw new InvalidOperationException("All mapped items must include a valid product_id.");
        }

        var products = await dbContext.Products
            .Include(x => x.Inventory)
            .Where(x => productIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        if (products.Count != productIds.Length)
        {
            throw new InvalidOperationException("One or more mapped products were not found.");
        }

        var currency = NormalizeOptional(request.Currency) ?? metadata.Currency ?? "LKR";
        var invoiceDate = request.InvoiceDate ?? metadata.InvoiceDate ?? DateTimeOffset.UtcNow;
        var now = DateTimeOffset.UtcNow;
        var shouldUpdateCost = request.UpdateCostPrice ?? options.Value.UpdateCostPriceOnImport;
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);

        var normalizedLines = request.Items
            .Select(x => NormalizeConfirmLine(x))
            .ToList();

        var subtotal = RoundMoney(normalizedLines.Sum(x => x.LineTotal));
        var taxTotal = request.TaxTotal.HasValue
            ? RoundMoney(Math.Max(0m, request.TaxTotal.Value))
            : metadata.ExtractedTaxTotal ?? 0m;
        var calculatedGrand = RoundMoney(subtotal + taxTotal);
        var grandTotal = request.GrandTotal.HasValue
            ? RoundMoney(Math.Max(0m, request.GrandTotal.Value))
            : calculatedGrand;

        if (grandTotal <= 0m)
        {
            throw new InvalidOperationException("grand_total must be greater than zero.");
        }

        var createdByUserId = ParseGuid(
            httpContextAccessor.HttpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier));

        var purchaseBill = new PurchaseBill
        {
            StoreId = currentStoreId,
            Supplier = supplier,
            SupplierId = supplier.Id,
            ImportRequestId = importRequestId,
            InvoiceNumber = invoiceNumber,
            InvoiceDateUtc = invoiceDate,
            Currency = currency,
            Subtotal = subtotal,
            DiscountTotal = 0m,
            TaxTotal = taxTotal,
            GrandTotal = grandTotal,
            SourceType = "ocr_import",
            OcrConfidence = draftDocument.OcrConfidence,
            CreatedByUserId = createdByUserId,
            Notes = approvalReason,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        var inventoryUpdates = new List<PurchaseInventoryUpdateResponse>();
        var purchaseBillItems = new List<PurchaseBillItem>();

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            dbContext.PurchaseBills.Add(purchaseBill);

            foreach (var line in normalizedLines)
            {
                var product = products[line.ProductId];
                var inventory = product.Inventory;
                if (inventory is null)
                {
                    inventory = new InventoryRecord
                    {
                        Product = product,
                        ProductId = product.Id,
                        StoreId = purchaseBill.StoreId,
                        QuantityOnHand = 0m,
                        ReorderLevel = 0m,
                        SafetyStock = 0m,
                        TargetStockLevel = 0m,
                        AllowNegativeStock = true,
                        UpdatedAtUtc = now
                    };
                    dbContext.Inventory.Add(inventory);
                    product.Inventory = inventory;
                }
                inventory.StoreId = purchaseBill.StoreId;

                var previousQty = RoundQuantity(inventory.QuantityOnHand);
                var deltaQty = RoundQuantity(line.Quantity);
                var newQty = RoundQuantity(previousQty + deltaQty);

                inventory.UpdatedAtUtc = now;

                await stockMovementHelper.RecordMovementAsync(
                    storeId: purchaseBill.StoreId,
                    productId: product.Id,
                    type: StockMovementType.Purchase,
                    quantityChange: deltaQty,
                    refType: StockMovementRef.Purchase,
                    refId: purchaseBill.Id,
                    batchId: null,
                    serialNumber: null,
                    reason: "purchase_import",
                    userId: createdByUserId,
                    cancellationToken);

                if (product.IsBatchTracked)
                {
                    var batchNumber = NormalizeOptional(line.SupplierItemName) ??
                                      $"{purchaseBill.InvoiceNumber}-{purchaseBillItems.Count + 1:000}";
                    var existingBatch = await dbContext.ProductBatches.FirstOrDefaultAsync(
                        x => x.ProductId == product.Id &&
                             x.BatchNumber == batchNumber &&
                             x.StoreId == purchaseBill.StoreId,
                        cancellationToken);

                    if (existingBatch is null)
                    {
                        existingBatch = new ProductBatch
                        {
                            StoreId = purchaseBill.StoreId,
                            ProductId = product.Id,
                            SupplierId = supplier.Id,
                            PurchaseBill = purchaseBill,
                            PurchaseBillId = purchaseBill.Id,
                            BatchNumber = batchNumber,
                            ManufactureDate = null,
                            ExpiryDate = null,
                            InitialQuantity = deltaQty,
                            RemainingQuantity = deltaQty,
                            CostPrice = line.UnitCost,
                            ReceivedAtUtc = now,
                            CreatedAtUtc = now,
                            UpdatedAtUtc = now,
                            Product = product
                        };
                        dbContext.ProductBatches.Add(existingBatch);
                    }
                    else
                    {
                        existingBatch.RemainingQuantity = RoundQuantity(existingBatch.RemainingQuantity + deltaQty);
                        existingBatch.InitialQuantity = RoundQuantity(existingBatch.InitialQuantity + deltaQty);
                        existingBatch.CostPrice = line.UnitCost;
                        existingBatch.UpdatedAtUtc = now;
                    }
                }

                if (shouldUpdateCost)
                {
                    product.CostPrice = ComputeWeightedCost(
                        currentCostPrice: product.CostPrice,
                        currentStockQty: previousQty,
                        incomingUnitCost: line.UnitCost,
                        incomingQty: deltaQty);
                }

                product.UpdatedAtUtc = now;
                await UpsertProductSupplierFromPurchaseAsync(product, supplier, line, now, cancellationToken);

                var purchaseItem = new PurchaseBillItem
                {
                    PurchaseBill = purchaseBill,
                    Product = product,
                    ProductId = product.Id,
                    ProductNameSnapshot = product.Name,
                    SupplierItemName = line.SupplierItemName,
                    Quantity = deltaQty,
                    UnitCost = line.UnitCost,
                    TaxAmount = 0m,
                    LineTotal = line.LineTotal,
                    CreatedAtUtc = now
                };
                purchaseBillItems.Add(purchaseItem);
                dbContext.PurchaseBillItems.Add(purchaseItem);

                inventoryUpdates.Add(new PurchaseInventoryUpdateResponse
                {
                    ProductId = product.Id,
                    ProductName = product.Name,
                    PreviousQuantity = previousQty,
                    DeltaQuantity = deltaQty,
                    NewQuantity = newQty
                });
            }

            draftDocument.PurchaseBillId = purchaseBill.Id;
            draftDocument.OcrStatus = "confirmed";
            draftDocument.ProcessedAtUtc = now;

            dbContext.Ledger.Add(new LedgerEntry
            {
                EntryType = LedgerEntryType.StockAdjustment,
                Description = $"Purchase import {purchaseBill.InvoiceNumber} ({purchaseBillItems.Count} items)",
                Debit = purchaseBill.GrandTotal,
                Credit = 0m,
                OccurredAtUtc = now,
                CreatedAtUtc = now
            });

            auditLogService.Queue(
                action: "purchase_import_confirmed",
                entityName: "purchase_bill",
                entityId: purchaseBill.Id.ToString(),
                after: new
                {
                    purchase_bill_id = purchaseBill.Id,
                    import_request_id = importRequestId,
                    supplier_id = supplier.Id,
                    supplier_name = supplier.Name,
                    invoice_number = purchaseBill.InvoiceNumber,
                    invoice_date = purchaseBill.InvoiceDateUtc,
                    subtotal = purchaseBill.Subtotal,
                    tax_total = purchaseBill.TaxTotal,
                    grand_total = purchaseBill.GrandTotal,
                    approval_reason = approvalReason,
                    items = purchaseBillItems.Select(x => new
                    {
                        product_id = x.ProductId,
                        product_name = x.ProductNameSnapshot,
                        quantity = x.Quantity,
                        unit_cost = x.UnitCost,
                        line_total = x.LineTotal
                    }),
                    inventory_updates = inventoryUpdates
                });

            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            RecordConfirmTelemetry("confirmed");
            logger.LogInformation(
                "Purchase import confirmed. ImportRequestId={ImportRequestId}, PurchaseBillId={PurchaseBillId}, SupplierId={SupplierId}, ItemCount={ItemCount}, GrandTotal={GrandTotal}.",
                importRequestId,
                purchaseBill.Id,
                supplier.Id,
                purchaseBillItems.Count,
                purchaseBill.GrandTotal);

            return ToConfirmResponse(purchaseBill, idempotentReplay: false, inventoryUpdates);
        }
        catch (DbUpdateException exception)
        {
            await transaction.RollbackAsync(cancellationToken);
            logger.LogWarning(exception, "Purchase confirm failed and transaction rolled back.");

            var replay = await dbContext.PurchaseBills
                .AsNoTracking()
                .Include(x => x.Supplier)
                .Include(x => x.Items)
                .FirstOrDefaultAsync(x => x.ImportRequestId == importRequestId, cancellationToken);
            if (replay is not null)
            {
                RecordConfirmTelemetry("idempotent_replay");
                logger.LogInformation(
                    "Purchase import confirm replayed after db update conflict. ImportRequestId={ImportRequestId}, PurchaseBillId={PurchaseBillId}.",
                    importRequestId,
                    replay.Id);
                return ToConfirmResponse(replay, idempotentReplay: true, []);
            }

            var duplicateByInvoice = await dbContext.PurchaseBills
                .AsNoTracking()
                .AnyAsync(x => x.SupplierId == supplier.Id && x.InvoiceNumber.ToLower() == invoiceNumber.ToLower(), cancellationToken);
            if (duplicateByInvoice)
            {
                throw new InvalidOperationException("A purchase bill with this supplier and invoice number already exists.");
            }

            throw;
        }
    }

    private async Task<BillDocument> SaveDraftDocumentAsync(
        BillFileData fileData,
        string fileHash,
        string status,
        decimal? confidence,
        string payloadJson,
        DateTimeOffset processedAtUtc,
        CancellationToken cancellationToken)
    {
        var document = new BillDocument
        {
            FileName = fileData.FileName,
            ContentType = fileData.ContentType,
            StoragePath = null,
            FileHash = fileHash,
            OcrStatus = status,
            OcrConfidence = confidence is null ? null : Math.Round(confidence.Value, 4),
            ExtractedPayloadJson = payloadJson,
            CreatedAtUtc = processedAtUtc,
            ProcessedAtUtc = processedAtUtc
        };

        dbContext.BillDocuments.Add(document);
        await dbContext.SaveChangesAsync(cancellationToken);
        return document;
    }

    private List<PurchaseOcrDraftLineItemResponse> NormalizeLines(
        IReadOnlyCollection<PurchaseOcrExtractionLine> sourceLines,
        decimal lowConfidenceThreshold)
    {
        var normalized = new List<PurchaseOcrDraftLineItemResponse>();
        var nextLineNo = 1;

        foreach (var source in sourceLines.OrderBy(x => x.LineNumber))
        {
            var confidence = source.Confidence is null
                ? (decimal?)null
                : Math.Round(Math.Clamp(source.Confidence.Value, 0m, 1m), 4);

            var reviewStatus = confidence is null || confidence.Value < lowConfidenceThreshold
                ? "needs_review"
                : "ready";

            normalized.Add(new PurchaseOcrDraftLineItemResponse
            {
                LineNumber = source.LineNumber > 0 ? source.LineNumber : nextLineNo,
                RawText = NormalizeOptional(source.RawText),
                ItemName = NormalizeOptional(source.ItemName),
                Quantity = source.Quantity is null ? null : Math.Round(source.Quantity.Value, 3),
                UnitCost = source.UnitCost is null ? null : Math.Round(source.UnitCost.Value, 2),
                LineTotal = source.LineTotal is null ? null : Math.Round(source.LineTotal.Value, 2),
                Confidence = confidence,
                ReviewStatus = reviewStatus
            });
            nextLineNo++;
        }

        return normalized;
    }

    private async Task<List<CatalogProductProjection>> LoadCatalogProductsAsync(CancellationToken cancellationToken)
    {
        return await dbContext.Products
            .AsNoTracking()
            .Where(x => x.IsActive)
            .Select(x => new CatalogProductProjection(
                x.Id,
                x.Name,
                x.Sku,
                x.Barcode,
                NormalizeForComparison(x.Name),
                BuildTokenSet(x.Name)))
            .ToListAsync(cancellationToken);
    }

    private MatchOutcome ApplyProductMatching(
        List<PurchaseOcrDraftLineItemResponse> lines,
        IReadOnlyCollection<CatalogProductProjection> products,
        decimal lowConfidenceThreshold,
        decimal fuzzyThreshold)
    {
        var blockedReasons = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var reviewRequired = false;

        foreach (var line in lines)
        {
            var match = FindBestMatch(line, products, fuzzyThreshold);
            if (match is null)
            {
                line.MatchStatus = "unmatched";
                line.MatchMethod = null;
                line.MatchScore = null;
                line.MatchedProductId = null;
                line.MatchedProductName = null;
                line.MatchedProductSku = null;
                line.MatchedProductBarcode = null;
                line.ReviewStatus = "needs_review";
                reviewRequired = true;
                blockedReasons.Add("unmatched_line_items");
                continue;
            }

            line.MatchMethod = match.Method;
            line.MatchScore = Math.Round(Math.Clamp(match.Score, 0m, 1m), 4);
            line.MatchedProductId = match.Product.Id;
            line.MatchedProductName = match.Product.Name;
            line.MatchedProductSku = match.Product.Sku;
            line.MatchedProductBarcode = match.Product.Barcode;

            if (match.Method == "fuzzy_name")
            {
                line.MatchStatus = "matched_fuzzy";
                line.ReviewStatus = "needs_review";
                reviewRequired = true;
                blockedReasons.Add("fuzzy_match_requires_review");
            }
            else
            {
                line.MatchStatus = "matched";
            }

            if (line.Confidence is null || line.Confidence.Value < lowConfidenceThreshold)
            {
                line.ReviewStatus = "needs_review";
                reviewRequired = true;
                blockedReasons.Add("low_confidence_lines");
            }
        }

        return new MatchOutcome(lines, blockedReasons.OrderBy(x => x).ToList(), reviewRequired);
    }

    private ProductMatchResult? FindBestMatch(
        PurchaseOcrDraftLineItemResponse line,
        IReadOnlyCollection<CatalogProductProjection> products,
        decimal fuzzyThreshold)
    {
        var codeTokens = ExtractCodeTokens(line.ItemName, line.RawText);
        foreach (var token in codeTokens)
        {
            var codeMatch = products.FirstOrDefault(product =>
                string.Equals(product.Barcode, token, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(product.Sku, token, StringComparison.OrdinalIgnoreCase));

            if (codeMatch is not null)
            {
                return new ProductMatchResult(codeMatch, 1m, "exact_code");
            }
        }

        var normalizedLineName = NormalizeForComparison(line.ItemName);
        if (string.IsNullOrWhiteSpace(normalizedLineName))
        {
            normalizedLineName = NormalizeForComparison(line.RawText);
        }

        if (string.IsNullOrWhiteSpace(normalizedLineName))
        {
            return null;
        }

        var exactNameMatch = products.FirstOrDefault(product =>
            string.Equals(product.NormalizedName, normalizedLineName, StringComparison.Ordinal));
        if (exactNameMatch is not null)
        {
            return new ProductMatchResult(exactNameMatch, 0.99m, "exact_name");
        }

        var lineTokens = BuildTokenSet(normalizedLineName);
        if (lineTokens.Count == 0)
        {
            return null;
        }

        CatalogProductProjection? bestProduct = null;
        decimal bestScore = 0m;
        foreach (var product in products)
        {
            var score = CalculateNameSimilarity(normalizedLineName, lineTokens, product);
            if (score <= bestScore)
            {
                continue;
            }

            bestScore = score;
            bestProduct = product;
        }

        if (bestProduct is null || bestScore < fuzzyThreshold)
        {
            return null;
        }

        return new ProductMatchResult(bestProduct, bestScore, "fuzzy_name");
    }

    private PurchaseOcrTotalsValidationResponse ValidateTotals(
        PurchaseOcrExtractionResult extraction,
        IReadOnlyCollection<PurchaseOcrDraftLineItemResponse> lines)
    {
        var tolerance = Math.Round(Math.Max(0m, options.Value.TotalsToleranceAmount), 2);
        var lineTotalSum = Math.Round(lines.Sum(x => x.LineTotal ?? 0m), 2);
        var extractedTax = extraction.TaxTotal.HasValue ? Math.Round(extraction.TaxTotal.Value, 2) : (decimal?)null;
        var extractedSubtotal = extraction.Subtotal.HasValue ? Math.Round(extraction.Subtotal.Value, 2) : (decimal?)null;
        var extractedGrand = extraction.GrandTotal.HasValue ? Math.Round(extraction.GrandTotal.Value, 2) : (decimal?)null;

        var expectedGrandFromLines = Math.Round(lineTotalSum + (extractedTax ?? 0m), 2);

        decimal difference;
        if (extractedGrand.HasValue || extractedSubtotal.HasValue)
        {
            var subtotalDiff = extractedSubtotal.HasValue
                ? Math.Abs(extractedSubtotal.Value - lineTotalSum)
                : 0m;
            var grandDiff = extractedGrand.HasValue
                ? Math.Abs(extractedGrand.Value - expectedGrandFromLines)
                : 0m;
            difference = Math.Round(Math.Max(subtotalDiff, grandDiff), 2);
        }
        else
        {
            difference = 0m;
        }

        var withinTolerance = difference <= tolerance;
        return new PurchaseOcrTotalsValidationResponse
        {
            LineTotalSum = lineTotalSum,
            ExtractedSubtotal = extractedSubtotal,
            ExtractedTaxTotal = extractedTax,
            ExtractedGrandTotal = extractedGrand,
            ExpectedGrandTotal = expectedGrandFromLines,
            Difference = difference,
            Tolerance = tolerance,
            WithinTolerance = withinTolerance,
            RequiresApprovalReason = !withinTolerance
        };
    }

    private async Task<ValidatedBillFile> ValidateAndReadFileAsync(IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null)
        {
            throw new InvalidOperationException("File is required.");
        }

        if (file.Length <= 0)
        {
            throw new InvalidOperationException("Uploaded file is empty.");
        }

        if (file.Length > options.Value.MaxFileSizeBytes)
        {
            throw new InvalidOperationException(
                $"File exceeds max allowed size of {options.Value.MaxFileSizeBytes} bytes.");
        }

        var extension = Path.GetExtension(file.FileName)?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(extension) || !AllowedExtensions.Contains(extension))
        {
            throw new InvalidOperationException("Unsupported file extension. Use PDF, PNG, JPG, or JPEG.");
        }

        await using var stream = file.OpenReadStream();
        using var memory = new MemoryStream();
        await stream.CopyToAsync(memory, cancellationToken);
        var bytes = memory.ToArray();

        if (bytes.Length == 0)
        {
            throw new InvalidOperationException("Uploaded file is empty.");
        }

        var detectedKind = DetectFileKind(bytes);
        if (detectedKind == BillFileKind.Unknown)
        {
            throw new InvalidOperationException("File signature check failed. Upload a valid PDF/JPG/PNG.");
        }

        if (!IsExtensionCompatible(extension, detectedKind))
        {
            throw new InvalidOperationException("File extension does not match file content.");
        }

        if (!IsContentTypeCompatible(file.ContentType, detectedKind))
        {
            throw new InvalidOperationException("Content type does not match file content.");
        }

        if (detectedKind == BillFileKind.Pdf)
        {
            EnsurePdfNotEncrypted(bytes);
            EnsurePdfPageLimit(bytes);
        }

        var fileName = NormalizeFileName(file.FileName);
        var contentType = detectedKind switch
        {
            BillFileKind.Pdf => "application/pdf",
            BillFileKind.Png => "image/png",
            BillFileKind.Jpeg => "image/jpeg",
            _ => "application/octet-stream"
        };

        var hash = Convert.ToHexString(SHA256.HashData(bytes));
        var fileData = new BillFileData(fileName, contentType, bytes);
        return new ValidatedBillFile(fileData, hash);
    }

    private bool IsExtensionCompatible(string extension, BillFileKind kind)
    {
        return kind switch
        {
            BillFileKind.Pdf => extension == ".pdf",
            BillFileKind.Png => extension == ".png",
            BillFileKind.Jpeg => extension is ".jpg" or ".jpeg",
            _ => false
        };
    }

    private bool IsContentTypeCompatible(string? contentType, BillFileKind kind)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return false;
        }

        var normalized = contentType.Split(';', 2, StringSplitOptions.TrimEntries)[0].ToLowerInvariant();
        return kind switch
        {
            BillFileKind.Pdf => normalized == "application/pdf",
            BillFileKind.Png => normalized == "image/png",
            BillFileKind.Jpeg => normalized is "image/jpeg" or "image/jpg",
            _ => false
        };
    }

    private static BillFileKind DetectFileKind(byte[] bytes)
    {
        if (bytes.Length >= 5 && bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46 && bytes[4] == 0x2D)
        {
            return BillFileKind.Pdf;
        }

        if (bytes.Length >= 8 &&
            bytes[0] == 0x89 &&
            bytes[1] == 0x50 &&
            bytes[2] == 0x4E &&
            bytes[3] == 0x47 &&
            bytes[4] == 0x0D &&
            bytes[5] == 0x0A &&
            bytes[6] == 0x1A &&
            bytes[7] == 0x0A)
        {
            return BillFileKind.Png;
        }

        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
        {
            return BillFileKind.Jpeg;
        }

        return BillFileKind.Unknown;
    }

    private void EnsurePdfNotEncrypted(byte[] bytes)
    {
        var header = Encoding.ASCII.GetString(bytes, 0, Math.Min(bytes.Length, 256 * 1024));
        if (header.Contains("/Encrypt", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Encrypted or password-protected PDFs are not supported.");
        }
    }

    private void EnsurePdfPageLimit(byte[] bytes)
    {
        var payload = Encoding.ASCII.GetString(bytes, 0, Math.Min(bytes.Length, 512 * 1024));
        var pageCount = Regex.Matches(payload, @"/Type\s*/Page(?!s)", RegexOptions.IgnoreCase).Count;
        if (pageCount == 0)
        {
            return;
        }

        if (pageCount > options.Value.MaxPdfPages)
        {
            throw new InvalidOperationException(
                $"PDF page count ({pageCount}) exceeds the configured limit ({options.Value.MaxPdfPages}).");
        }
    }

    private string NormalizeFileName(string fileName)
    {
        var leafName = Path.GetFileName(fileName).Trim();
        if (string.IsNullOrWhiteSpace(leafName))
        {
            return "supplier-bill";
        }

        var sanitized = string.Concat(
            leafName.Select(ch => Path.GetInvalidFileNameChars().Contains(ch) ? '_' : ch)).Trim();

        return string.IsNullOrWhiteSpace(sanitized) ? "supplier-bill" : sanitized;
    }

    private static string? NormalizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim();
        return normalized.Length == 0 ? null : normalized;
    }

    private static string NormalizeRequired(string? value, string errorMessage)
    {
        return NormalizeOptional(value) ?? throw new InvalidOperationException(errorMessage);
    }

    private async Task<Supplier> ResolveSupplierAsync(
        Guid? supplierId,
        string? supplierNameFromRequest,
        string? supplierNameFromDraft,
        CancellationToken cancellationToken)
    {
        if (supplierId.HasValue)
        {
            var supplierById = await dbContext.Suppliers
                .FirstOrDefaultAsync(x => x.Id == supplierId.Value, cancellationToken)
                ?? throw new InvalidOperationException("supplier_id was not found.");

            if (!supplierById.IsActive)
            {
                throw new InvalidOperationException("supplier_id is not active.");
            }

            return supplierById;
        }

        var supplierName = NormalizeOptional(supplierNameFromRequest) ??
                           NormalizeOptional(supplierNameFromDraft) ??
                           throw new InvalidOperationException("supplier_name is required when supplier_id is not provided.");

        var normalizedName = supplierName.ToLowerInvariant();
        var existing = await dbContext.Suppliers
            .FirstOrDefaultAsync(x => x.Name.ToLower() == normalizedName, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var now = DateTimeOffset.UtcNow;
        var created = new Supplier
        {
            Name = supplierName,
            IsActive = true,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        dbContext.Suppliers.Add(created);
        return created;
    }

    private async Task UpsertProductSupplierFromPurchaseAsync(
        Product product,
        Supplier supplier,
        ConfirmLine line,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var mapping = await dbContext.ProductSuppliers
            .FirstOrDefaultAsync(x => x.ProductId == product.Id && x.SupplierId == supplier.Id, cancellationToken);

        if (mapping is null)
        {
            mapping = new ProductSupplier
            {
                Product = product,
                Supplier = supplier,
                ProductId = product.Id,
                SupplierId = supplier.Id,
                StoreId = product.StoreId,
                CreatedAtUtc = now
            };
            dbContext.ProductSuppliers.Add(mapping);
        }

        mapping.SupplierItemName = NormalizeOptional(line.SupplierItemName);
        mapping.LastPurchasePrice = RoundMoney(line.UnitCost);
        mapping.IsActive = true;
        mapping.UpdatedAtUtc = now;

        var hasPreferred = await dbContext.ProductSuppliers
            .AsNoTracking()
            .AnyAsync(x => x.ProductId == product.Id && x.IsPreferred, cancellationToken);

        if (!hasPreferred)
        {
            mapping.IsPreferred = true;
            await ClearOtherPreferredProductSuppliersAsync(product.Id, mapping.Id, cancellationToken);
        }
    }

    private async Task ClearOtherPreferredProductSuppliersAsync(
        Guid productId,
        Guid preferredProductSupplierId,
        CancellationToken cancellationToken)
    {
        var others = await dbContext.ProductSuppliers
            .Where(x => x.ProductId == productId && x.Id != preferredProductSupplierId && x.IsPreferred)
            .ToListAsync(cancellationToken);

        foreach (var other in others)
        {
            other.IsPreferred = false;
            other.UpdatedAtUtc = DateTimeOffset.UtcNow;
        }
    }

    private DraftPayloadMetadata ParseDraftMetadata(string? payloadJson)
    {
        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            return DraftPayloadMetadata.Empty;
        }

        try
        {
            var root = JsonNode.Parse(payloadJson) as JsonObject;
            if (root is null)
            {
                return DraftPayloadMetadata.Empty;
            }

            var totalsNode = TryGetNode(root, "totals") as JsonObject;
            var lineNumbers = new List<int>();
            if (TryGetNode(root, "lines") is JsonArray lines)
            {
                foreach (var node in lines.OfType<JsonObject>())
                {
                    var lineNumber = GetIntValue(node, "line_no", "LineNumber");
                    if (lineNumber is > 0)
                    {
                        lineNumbers.Add(lineNumber.Value);
                    }
                }
            }

            return new DraftPayloadMetadata(
                SupplierName: GetStringValue(root, "supplier_name", "SupplierName"),
                InvoiceNumber: GetStringValue(root, "invoice_number", "InvoiceNumber"),
                InvoiceDate: GetDateTimeOffsetValue(root, "invoice_date", "InvoiceDate"),
                Currency: GetStringValue(root, "currency", "Currency"),
                ExtractedTaxTotal: GetDecimalValue(root, "tax_total", "TaxTotal"),
                RequiresApprovalReason: totalsNode is not null &&
                                        (GetBoolValue(totalsNode, "requires_approval_reason", "RequiresApprovalReason") ?? false),
                LineNumbers: lineNumbers.Distinct().OrderBy(x => x).ToList());
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Failed to parse OCR draft metadata payload.");
            return DraftPayloadMetadata.Empty;
        }
    }

    private static ConfirmLine NormalizeConfirmLine(PurchaseImportConfirmLineRequest line)
    {
        if (line.ProductId == Guid.Empty)
        {
            throw new InvalidOperationException("All items must include a valid product_id.");
        }

        if (line.Quantity <= 0m)
        {
            throw new InvalidOperationException("Item quantity must be greater than zero.");
        }

        if (line.UnitCost < 0m)
        {
            throw new InvalidOperationException("Item unit_cost cannot be negative.");
        }

        var quantity = RoundQuantity(line.Quantity);
        var unitCost = RoundMoney(line.UnitCost);
        var lineTotal = line.LineTotal.HasValue
            ? RoundMoney(line.LineTotal.Value)
            : RoundMoney(quantity * unitCost);

        if (lineTotal < 0m)
        {
            throw new InvalidOperationException("Item line_total cannot be negative.");
        }

        return new ConfirmLine(
            line.LineNumber,
            line.ProductId,
            NormalizeOptional(line.SupplierItemName),
            quantity,
            unitCost,
            lineTotal);
    }

    private static PurchaseImportConfirmResponse ToConfirmResponse(
        PurchaseBill purchaseBill,
        bool idempotentReplay,
        IReadOnlyCollection<PurchaseInventoryUpdateResponse> inventoryUpdates)
    {
        return new PurchaseImportConfirmResponse
        {
            PurchaseBillId = purchaseBill.Id,
            ImportRequestId = purchaseBill.ImportRequestId ?? string.Empty,
            Status = idempotentReplay ? "idempotent_replay" : "confirmed",
            IdempotentReplay = idempotentReplay,
            SupplierId = purchaseBill.SupplierId,
            SupplierName = purchaseBill.Supplier?.Name ?? string.Empty,
            InvoiceNumber = purchaseBill.InvoiceNumber,
            InvoiceDate = purchaseBill.InvoiceDateUtc,
            Currency = purchaseBill.Currency,
            Subtotal = purchaseBill.Subtotal,
            TaxTotal = purchaseBill.TaxTotal,
            GrandTotal = purchaseBill.GrandTotal,
            Items = purchaseBill.Items
                .OrderBy(x => x.CreatedAtUtc)
                .Select(x => new PurchaseImportConfirmedItemResponse
                {
                    PurchaseBillItemId = x.Id,
                    LineNumber = null,
                    ProductId = x.ProductId,
                    ProductName = x.ProductNameSnapshot,
                    Quantity = x.Quantity,
                    UnitCost = x.UnitCost,
                    LineTotal = x.LineTotal
                })
                .ToList(),
            InventoryUpdates = inventoryUpdates.ToList(),
            CreatedAt = purchaseBill.CreatedAtUtc
        };
    }

    private static PurchaseBillInventoryLine NormalizeBillLine(
        Guid productId,
        decimal quantity,
        decimal unitCost,
        string? supplierItemName,
        string? batchNumber,
        DateTimeOffset? expiryDate,
        DateTimeOffset? manufactureDate)
    {
        if (productId == Guid.Empty)
        {
            throw new InvalidOperationException("All bill items must include a valid product_id.");
        }

        if (quantity <= 0m)
        {
            throw new InvalidOperationException("Bill item quantity must be greater than zero.");
        }

        if (unitCost < 0m)
        {
            throw new InvalidOperationException("Bill item unit_cost cannot be negative.");
        }

        var normalizedQuantity = RoundQuantity(quantity);
        var normalizedUnitCost = RoundMoney(unitCost);
        var lineTotal = RoundMoney(normalizedQuantity * normalizedUnitCost);

        return new PurchaseBillInventoryLine(
            ProductId: productId,
            Quantity: normalizedQuantity,
            UnitCost: normalizedUnitCost,
            LineTotal: lineTotal,
            SupplierItemName: NormalizeOptional(supplierItemName),
            BatchNumber: NormalizeOptional(batchNumber),
            ExpiryDate: expiryDate,
            ManufactureDate: manufactureDate);
    }

    private static PurchaseBillDetailResponse ToBillDetailResponse(PurchaseBill purchaseBill)
    {
        return new PurchaseBillDetailResponse
        {
            Id = purchaseBill.Id,
            PurchaseOrderId = purchaseBill.PurchaseOrderId,
            PurchaseOrderNumber = purchaseBill.PurchaseOrder?.PoNumber,
            SupplierId = purchaseBill.SupplierId,
            SupplierName = purchaseBill.Supplier?.Name ?? string.Empty,
            InvoiceNumber = purchaseBill.InvoiceNumber,
            InvoiceDate = purchaseBill.InvoiceDateUtc,
            Currency = purchaseBill.Currency,
            Subtotal = RoundMoney(purchaseBill.Subtotal),
            TaxTotal = RoundMoney(purchaseBill.TaxTotal),
            GrandTotal = RoundMoney(purchaseBill.GrandTotal),
            SourceType = purchaseBill.SourceType,
            Notes = purchaseBill.Notes,
            CreatedAtUtc = purchaseBill.CreatedAtUtc,
            Items = purchaseBill.Items
                .OrderBy(x => x.CreatedAtUtc)
                .Select(x => new PurchaseBillItemResponse
                {
                    Id = x.Id,
                    ProductId = x.ProductId,
                    ProductName = x.ProductNameSnapshot,
                    SupplierItemName = x.SupplierItemName,
                    Quantity = RoundQuantity(x.Quantity),
                    UnitCost = RoundMoney(x.UnitCost),
                    LineTotal = RoundMoney(x.LineTotal)
                })
                .ToList()
        };
    }

    private static decimal ComputeWeightedCost(
        decimal currentCostPrice,
        decimal currentStockQty,
        decimal incomingUnitCost,
        decimal incomingQty)
    {
        var safeCurrentQty = Math.Max(0m, currentStockQty);
        var safeIncomingQty = Math.Max(0m, incomingQty);
        if (safeIncomingQty <= 0m)
        {
            return RoundMoney(currentCostPrice);
        }

        var denominator = safeCurrentQty + safeIncomingQty;
        if (denominator <= 0m)
        {
            return RoundMoney(incomingUnitCost);
        }

        var weighted = ((currentCostPrice * safeCurrentQty) + (incomingUnitCost * safeIncomingQty)) / denominator;
        return RoundMoney(weighted);
    }

    private async Task<Guid?> GetCurrentStoreIdAsync(CancellationToken cancellationToken)
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user is null)
        {
            return null;
        }

        return await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
    }

    private static decimal RoundMoney(decimal value) =>
        decimal.Round(value, 2, MidpointRounding.AwayFromZero);

    private static decimal RoundQuantity(decimal value) =>
        decimal.Round(value, 3, MidpointRounding.AwayFromZero);

    private static Guid? ParseGuid(string? value) =>
        Guid.TryParse(value, out var parsed) ? parsed : null;

    private static JsonNode? TryGetNode(JsonObject root, string propertyName)
    {
        if (root.TryGetPropertyValue(propertyName, out var exact))
        {
            return exact;
        }

        var key = root.FirstOrDefault(x => string.Equals(x.Key, propertyName, StringComparison.OrdinalIgnoreCase));
        return key.Equals(default(KeyValuePair<string, JsonNode?>)) ? null : key.Value;
    }

    private static string? GetStringValue(JsonObject root, params string[] names)
    {
        foreach (var name in names)
        {
            if (TryGetNode(root, name) is JsonValue value && value.TryGetValue<string>(out var parsed))
            {
                var normalized = NormalizeOptional(parsed);
                if (!string.IsNullOrWhiteSpace(normalized))
                {
                    return normalized;
                }
            }
        }

        return null;
    }

    private static decimal? GetDecimalValue(JsonObject root, params string[] names)
    {
        foreach (var name in names)
        {
            if (TryGetNode(root, name) is not JsonValue value)
            {
                continue;
            }

            if (value.TryGetValue<decimal>(out var decimalParsed))
            {
                return RoundMoney(decimalParsed);
            }

            if (value.TryGetValue<double>(out var doubleParsed))
            {
                return RoundMoney((decimal)doubleParsed);
            }

            if (value.TryGetValue<string>(out var stringParsed) &&
                decimal.TryParse(stringParsed, out var fromString))
            {
                return RoundMoney(fromString);
            }
        }

        return null;
    }

    private static bool? GetBoolValue(JsonObject root, params string[] names)
    {
        foreach (var name in names)
        {
            if (TryGetNode(root, name) is not JsonValue value)
            {
                continue;
            }

            if (value.TryGetValue<bool>(out var parsed))
            {
                return parsed;
            }

            if (value.TryGetValue<string>(out var stringParsed) &&
                bool.TryParse(stringParsed, out var boolFromString))
            {
                return boolFromString;
            }
        }

        return null;
    }

    private static DateTimeOffset? GetDateTimeOffsetValue(JsonObject root, params string[] names)
    {
        foreach (var name in names)
        {
            if (TryGetNode(root, name) is not JsonValue value)
            {
                continue;
            }

            if (value.TryGetValue<DateTimeOffset>(out var parsed))
            {
                return parsed;
            }

            if (value.TryGetValue<string>(out var stringParsed) &&
                DateTimeOffset.TryParse(stringParsed, out var parsedFromString))
            {
                return parsedFromString;
            }
        }

        return null;
    }

    private static int? GetIntValue(JsonObject root, params string[] names)
    {
        foreach (var name in names)
        {
            if (TryGetNode(root, name) is not JsonValue value)
            {
                continue;
            }

            if (value.TryGetValue<int>(out var parsed))
            {
                return parsed;
            }

            if (value.TryGetValue<string>(out var stringParsed) &&
                int.TryParse(stringParsed, out var parsedFromString))
            {
                return parsedFromString;
            }
        }

        return null;
    }

    private static HashSet<string> ExtractCodeTokens(params string?[] values)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var value in values.Where(x => !string.IsNullOrWhiteSpace(x)))
        {
            foreach (Match match in CodeTokenRegex.Matches(value!))
            {
                var token = match.Value.Trim();
                if (token.Length < 3)
                {
                    continue;
                }

                result.Add(token);
            }
        }

        return result;
    }

    private static string NormalizeForComparison(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = Regex.Replace(value.ToLowerInvariant(), @"[^a-z0-9]+", " ");
        return Regex.Replace(normalized, @"\s+", " ").Trim();
    }

    private static HashSet<string> BuildTokenSet(string? value)
    {
        return NormalizeForComparison(value)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .ToHashSet(StringComparer.Ordinal);
    }

    private static decimal CalculateNameSimilarity(
        string normalizedLineName,
        IReadOnlySet<string> lineTokens,
        CatalogProductProjection product)
    {
        if (string.Equals(normalizedLineName, product.NormalizedName, StringComparison.Ordinal))
        {
            return 1m;
        }

        if (normalizedLineName.Contains(product.NormalizedName, StringComparison.Ordinal) ||
            product.NormalizedName.Contains(normalizedLineName, StringComparison.Ordinal))
        {
            return 0.9m;
        }

        var union = lineTokens.Union(product.NameTokens).Count();
        if (union == 0)
        {
            return 0m;
        }

        var intersection = lineTokens.Intersect(product.NameTokens).Count();
        return Math.Round((decimal)intersection / union, 4);
    }

    private void RecordDraftTelemetry(
        string provider,
        string status,
        bool reviewRequired,
        IReadOnlyCollection<string> blockedReasons,
        bool totalsMismatch)
    {
        OcrDraftCounter.Add(
            1,
            new KeyValuePair<string, object?>("provider", provider),
            new KeyValuePair<string, object?>("status", status));

        if (totalsMismatch)
        {
            OcrTotalsMismatchCounter.Add(
                1,
                new KeyValuePair<string, object?>("provider", provider),
                new KeyValuePair<string, object?>("status", status));
        }

        if (reviewRequired)
        {
            OcrManualReviewCounter.Add(
                1,
                new KeyValuePair<string, object?>("provider", provider),
                new KeyValuePair<string, object?>("status", status),
                new KeyValuePair<string, object?>("reason", ResolvePrimaryReviewReason(blockedReasons)));
        }
    }

    private static string ResolvePrimaryReviewReason(IReadOnlyCollection<string> blockedReasons)
    {
        string[] priority =
        [
            "ocr_provider_unavailable",
            "malware_scan_rejected",
            "totals_mismatch_requires_approval",
            "no_line_items_extracted",
            "low_confidence_lines",
            "fuzzy_match_requires_review",
            "unmatched_line_items",
            "manual_review_required"
        ];

        foreach (var reason in priority)
        {
            if (blockedReasons.Contains(reason, StringComparer.OrdinalIgnoreCase))
            {
                return reason;
            }
        }

        return "manual_review_required";
    }

    private static ConfirmLockEntry AcquireConfirmLock(string importRequestId)
    {
        while (true)
        {
            if (ConfirmLocks.TryGetValue(importRequestId, out var existingEntry))
            {
                if (existingEntry.TryAddReference())
                {
                    return existingEntry;
                }

                continue;
            }

            var newEntry = new ConfirmLockEntry();
            if (ConfirmLocks.TryAdd(importRequestId, newEntry))
            {
                return newEntry;
            }
        }
    }

    private static void RecordConfirmTelemetry(string status)
    {
        ImportConfirmCounter.Add(
            1,
            new KeyValuePair<string, object?>("status", status));
    }

    private sealed record ConfirmLine(
        int? LineNumber,
        Guid ProductId,
        string? SupplierItemName,
        decimal Quantity,
        decimal UnitCost,
        decimal LineTotal);

    private sealed record DraftPayloadMetadata(
        string? SupplierName,
        string? InvoiceNumber,
        DateTimeOffset? InvoiceDate,
        string? Currency,
        decimal? ExtractedTaxTotal,
        bool RequiresApprovalReason,
        List<int> LineNumbers)
    {
        public static DraftPayloadMetadata Empty =>
            new(
                SupplierName: null,
                InvoiceNumber: null,
                InvoiceDate: null,
                Currency: null,
                ExtractedTaxTotal: null,
                RequiresApprovalReason: false,
                LineNumbers: []);
    }

    private sealed record ValidatedBillFile(BillFileData FileData, string FileHash);
    private sealed record CatalogProductProjection(
        Guid Id,
        string Name,
        string? Sku,
        string? Barcode,
        string NormalizedName,
        HashSet<string> NameTokens);

    private sealed record ProductMatchResult(
        CatalogProductProjection Product,
        decimal Score,
        string Method);

    private sealed record MatchOutcome(
        List<PurchaseOcrDraftLineItemResponse> Lines,
        List<string> BlockedReasons,
        bool ReviewRequired);

    private sealed class ConfirmLockEntry : IDisposable
    {
        private int referenceCount = 1;

        public SemaphoreSlim Semaphore { get; } = new(1, 1);

        public bool TryAddReference()
        {
            while (true)
            {
                var currentCount = Volatile.Read(ref referenceCount);
                if (currentCount == 0)
                {
                    return false;
                }

                if (Interlocked.CompareExchange(ref referenceCount, currentCount + 1, currentCount) == currentCount)
                {
                    return true;
                }
            }
        }

        public int ReleaseReference()
        {
            return Interlocked.Decrement(ref referenceCount);
        }

        public void Dispose()
        {
            Semaphore.Dispose();
        }
    }

    internal enum BillFileKind
    {
        Unknown = 0,
        Pdf = 1,
        Png = 2,
        Jpeg = 3
    }
}
