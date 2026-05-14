using System.Text;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using UglyToad.PdfPig;

namespace SmartPos.Backend.Features.Purchases;

public sealed record BillFileData(
    string FileName,
    string ContentType,
    byte[] Bytes);

public sealed class PurchaseOcrExtractionResult
{
    public string ProviderName { get; set; } = "basic-text";
    public string? ProviderModel { get; set; }
    public string? SupplierName { get; set; }
    public string? InvoiceNumber { get; set; }
    public DateTimeOffset? InvoiceDate { get; set; }
    public string Currency { get; set; } = "LKR";
    public decimal? Subtotal { get; set; }
    public decimal? TaxTotal { get; set; }
    public decimal? GrandTotal { get; set; }
    public decimal? OverallConfidence { get; set; }
    public string? RawText { get; set; }
    public List<string> Warnings { get; set; } = [];
    public List<PurchaseOcrExtractionLine> Lines { get; set; } = [];
}

public sealed class PurchaseOcrExtractionLine
{
    public int LineNumber { get; set; }
    public string? RawText { get; set; }
    public string? ItemName { get; set; }
    public decimal? Quantity { get; set; }
    public decimal? UnitCost { get; set; }
    public decimal? LineTotal { get; set; }
    public decimal? Confidence { get; set; }
}

public interface IOcrProvider
{
    Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken);
}

public interface IOcrProviderCore
{
    Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken);
}

public interface IBillMalwareScanner
{
    Task<MalwareScanResult> ScanAsync(BillFileData file, CancellationToken cancellationToken);
}

public sealed class MalwareScanResult
{
    public bool IsClean { get; set; } = true;
    public string Status { get; set; } = "skipped";
    public string? Message { get; set; }

    public static MalwareScanResult Clean(string status = "clean") =>
        new()
        {
            IsClean = true,
            Status = status
        };
}

public sealed class NoOpBillMalwareScanner : IBillMalwareScanner
{
    public Task<MalwareScanResult> ScanAsync(BillFileData file, CancellationToken cancellationToken)
    {
        return Task.FromResult(MalwareScanResult.Clean("skipped"));
    }
}

public sealed class OcrProviderUnavailableException(string message, Exception? innerException = null)
    : Exception(message, innerException);

public sealed class BasicTextOcrProvider : IOcrProviderCore
{
    private static readonly Regex InvoiceRegex = new(
        @"(?im)\binvoice\s*(?:no|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})\b",
        RegexOptions.Compiled);

    private static readonly Regex SupplierRegex = new(
        @"(?im)\b(?:supplier|vendor)\s*[:\-]\s*(.{3,120})$",
        RegexOptions.Compiled);

    private static readonly Regex AmountTokenRegex = new(
        @"[+\-]?[0-9Oo][0-9Oo,\.]{0,20}",
        RegexOptions.Compiled);

    public Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken)
    {
        var rawText = TryDecodeRawText(file);
        var normalizedText = string.IsNullOrWhiteSpace(rawText) ? rawText : NormalizeRawTextForParsing(rawText);
        var result = new PurchaseOcrExtractionResult
        {
            ProviderName = "basic-text",
            RawText = normalizedText
        };

        if (string.IsNullOrWhiteSpace(normalizedText))
        {
            result.OverallConfidence = 0.2m;
            return Task.FromResult(result);
        }

        result.SupplierName = TryResolveSupplierName(normalizedText);
        result.InvoiceNumber = TryMatchSingleGroup(normalizedText, InvoiceRegex, 1);
        PopulateAmounts(normalizedText, result);
        result.Lines = ParseLineItems(normalizedText);

        var confidence = 0.35m;
        if (!string.IsNullOrWhiteSpace(result.InvoiceNumber))
        {
            confidence += 0.2m;
        }

        if (result.Lines.Count > 0)
        {
            confidence += 0.3m;
        }

        if (result.GrandTotal.HasValue)
        {
            confidence += 0.1m;
        }

        result.OverallConfidence = Math.Round(Math.Clamp(confidence, 0m, 0.95m), 4);
        return Task.FromResult(result);
    }

    private static string? TryMatchSingleGroup(string input, Regex regex, int index)
    {
        var match = regex.Match(input);
        if (!match.Success)
        {
            return null;
        }

        var value = match.Groups[index].Value.Trim();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static string? TryResolveSupplierName(string rawText)
    {
        var fromLabel = TryMatchSingleGroup(rawText, SupplierRegex, 1);
        if (!string.IsNullOrWhiteSpace(fromLabel) &&
            !fromLabel.Contains('/', StringComparison.Ordinal) &&
            !fromLabel.Equals("bill", StringComparison.OrdinalIgnoreCase))
        {
            return fromLabel;
        }

        return TryInferSupplierFromLines(rawText);
    }

    private static void PopulateAmounts(string rawText, PurchaseOcrExtractionResult result)
    {
        foreach (var line in SplitLines(rawText))
        {
            var normalized = line.ToLowerInvariant();
            string? label = null;
            if (normalized.Contains("grand total", StringComparison.Ordinal))
            {
                label = "grand total";
            }
            else if (normalized.Contains("subtotal", StringComparison.Ordinal))
            {
                label = "subtotal";
            }
            else if (normalized.Contains("tax", StringComparison.Ordinal) ||
                     normalized.Contains("vat", StringComparison.Ordinal))
            {
                label = "tax";
            }
            else if (normalized.Contains("total", StringComparison.Ordinal))
            {
                label = "total";
            }

            if (label is null)
            {
                continue;
            }

            if (!TryExtractTrailingAmount(line, out var amount))
            {
                continue;
            }

            if (label.Contains("grand total") || label == "total")
            {
                result.GrandTotal = amount;
                continue;
            }

            if (label == "subtotal")
            {
                result.Subtotal = amount;
                continue;
            }

            if (label == "tax" || label == "vat")
            {
                result.TaxTotal = amount;
            }
        }
    }

    private static List<PurchaseOcrExtractionLine> ParseLineItems(string rawText)
    {
        var lines = new List<PurchaseOcrExtractionLine>();
        var sourceLines = SplitLines(rawText);

        var lineNo = 1;
        foreach (var sourceLine in sourceLines)
        {
            if (ShouldSkipLineForItemParsing(sourceLine))
            {
                continue;
            }

            var normalizedLine = Regex.Replace(sourceLine.Replace("|", string.Empty), @"\s{2,}", " ").Trim();
            var amountMatches = AmountTokenRegex.Matches(normalizedLine);
            if (amountMatches.Count < 2)
            {
                continue;
            }

            if (!TryResolveLineAmounts(
                    amountMatches,
                    out var itemNameEndIndex,
                    out var qty,
                    out var unitCost,
                    out var lineTotal,
                    out var inferredQuantity))
            {
                continue;
            }

            if (itemNameEndIndex <= 0)
            {
                continue;
            }

            var name = normalizedLine[..itemNameEndIndex].Trim(" -:\t".ToCharArray());
            if (string.IsNullOrWhiteSpace(name) || name.Length < 3 || !char.IsLetter(name[0]))
            {
                continue;
            }

            lines.Add(new PurchaseOcrExtractionLine
            {
                LineNumber = lineNo++,
                RawText = sourceLine,
                ItemName = name,
                Quantity = Math.Round(qty, 3),
                UnitCost = Math.Round(unitCost, 2),
                LineTotal = Math.Round(lineTotal, 2),
                Confidence = inferredQuantity ? 0.68m : 0.8m
            });
        }

        if (lines.Count > 0)
        {
            return lines;
        }

        return ParseCompactItemRows(rawText);
    }

    private static List<PurchaseOcrExtractionLine> ParseCompactItemRows(string rawText)
    {
        var flattened = Regex.Replace(rawText, @"\s+", " ").Trim();
        if (string.IsNullOrWhiteSpace(flattened))
        {
            return [];
        }

        var startIndex = flattened.IndexOf("line total", StringComparison.OrdinalIgnoreCase);
        if (startIndex < 0)
        {
            startIndex = flattened.IndexOf("item description", StringComparison.OrdinalIgnoreCase);
        }

        if (startIndex < 0)
        {
            return [];
        }

        var candidate = flattened[startIndex..];
        var subtotalIndex = candidate.IndexOf("subtotal", StringComparison.OrdinalIgnoreCase);
        if (subtotalIndex > 0)
        {
            candidate = candidate[..subtotalIndex];
        }

        candidate = Regex.Replace(
            candidate,
            @"(?i)item\s+description\s*qty\s*unit\s*cost\s*\(lkr\)\s*line\s*total\s*\(lkr\)",
            string.Empty);
        candidate = Regex.Replace(candidate, @"(?<=\d\.\d{2})(?=\d)", " ");
        candidate = Regex.Replace(candidate, @"(?<=\d\.\d{2})(?=[A-Z])", "\n");

        var results = new List<PurchaseOcrExtractionLine>();
        var lineNo = 1;
        var pseudoLines = candidate
            .Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim())
            .Where(x => x.Length >= 5);

        foreach (var pseudoLine in pseudoLines)
        {
            var compactLine = Regex.Replace(
                    pseudoLine,
                    @"(?i)item\s+description\s*qty\s*unit\s*cost\s*\(lkr\)\s*line\s*total\s*\(lkr\)|line\s*total\s*\(lkr\)",
                    string.Empty)
                .Trim();

            if (ShouldSkipLineForItemParsing(compactLine))
            {
                continue;
            }

            var normalizedLine = Regex.Replace(compactLine.Replace("|", string.Empty), @"\s{2,}", " ").Trim();
            var amountMatches = AmountTokenRegex.Matches(normalizedLine);
            if (amountMatches.Count < 2)
            {
                continue;
            }

            if (!TryResolveLineAmounts(
                    amountMatches,
                    out var itemNameEndIndex,
                    out var qty,
                    out var unitCost,
                    out var lineTotal,
                    out var inferredQuantity))
            {
                continue;
            }

            if (itemNameEndIndex <= 0)
            {
                continue;
            }

            var name = normalizedLine[..itemNameEndIndex].Trim(" -:\t".ToCharArray());
            if (string.IsNullOrWhiteSpace(name) || name.Length < 3 || !char.IsLetter(name[0]))
            {
                continue;
            }

            results.Add(new PurchaseOcrExtractionLine
            {
                LineNumber = lineNo++,
                RawText = compactLine,
                ItemName = name,
                Quantity = Math.Round(qty, 3),
                UnitCost = Math.Round(unitCost, 2),
                LineTotal = Math.Round(lineTotal, 2),
                Confidence = inferredQuantity ? 0.65m : 0.72m
            });
        }

        return results;
    }

    private static bool TryResolveLineAmounts(
        MatchCollection amountMatches,
        out int itemNameEndIndex,
        out decimal quantity,
        out decimal unitCost,
        out decimal lineTotal,
        out bool inferredQuantity)
    {
        itemNameEndIndex = 0;
        inferredQuantity = false;
        quantity = 0m;
        unitCost = 0m;
        lineTotal = 0m;

        if (amountMatches.Count >= 3 &&
            TryParseAmount(amountMatches[^3].Value, out var parsedQty) &&
            parsedQty > 0m &&
            parsedQty <= 200m &&
            TryParseAmount(amountMatches[^2].Value, out var parsedUnitCost) &&
            parsedUnitCost > 0m &&
            TryParseAmount(amountMatches[^1].Value, out var parsedLineTotal) &&
            parsedLineTotal > 0m &&
            IsQuantityUnitTotalConsistent(parsedQty, parsedUnitCost, parsedLineTotal))
        {
            itemNameEndIndex = amountMatches[^3].Index;
            quantity = parsedQty;
            unitCost = parsedUnitCost;
            lineTotal = parsedLineTotal;
            return true;
        }

        if (!TryParseAmount(amountMatches[^2].Value, out var fallbackUnitCost) ||
            !TryParseAmount(amountMatches[^1].Value, out var fallbackLineTotal) ||
            fallbackUnitCost <= 0m ||
            fallbackLineTotal <= 0m)
        {
            return false;
        }

        inferredQuantity = true;
        itemNameEndIndex = amountMatches[^2].Index;
        unitCost = fallbackUnitCost;
        lineTotal = fallbackLineTotal;

        if (!TryInferQuantityFromAmounts(fallbackUnitCost, fallbackLineTotal, out var inferred))
        {
            if (TrySplitCombinedQuantityAndUnit(amountMatches[^2].Value, fallbackLineTotal, out var splitQty, out var splitUnit))
            {
                quantity = splitQty;
                unitCost = splitUnit;
                return true;
            }

            quantity = 1m;
            return true;
        }

        quantity = inferred;
        return true;
    }

    private static bool IsQuantityUnitTotalConsistent(decimal quantity, decimal unitCost, decimal lineTotal)
    {
        if (quantity <= 0m || unitCost <= 0m || lineTotal <= 0m)
        {
            return false;
        }

        var expectedLineTotal = quantity * unitCost;
        var tolerance = Math.Max(2m, Math.Abs(expectedLineTotal) * 0.12m);
        return Math.Abs(expectedLineTotal - lineTotal) <= tolerance;
    }

    private static bool TryInferQuantityFromAmounts(decimal unitCost, decimal lineTotal, out decimal quantity)
    {
        quantity = 0m;
        if (unitCost <= 0m || lineTotal <= 0m)
        {
            return false;
        }

        var estimated = lineTotal / unitCost;
        if (estimated < 1m || estimated > 200m)
        {
            return false;
        }

        var roundedWhole = Math.Round(estimated, 0, MidpointRounding.AwayFromZero);
        if (Math.Abs(estimated - roundedWhole) <= 0.08m)
        {
            quantity = Math.Max(1m, roundedWhole);
            return true;
        }

        quantity = Math.Round(estimated, 3);
        return true;
    }

    private static bool TrySplitCombinedQuantityAndUnit(
        string combinedToken,
        decimal lineTotal,
        out decimal quantity,
        out decimal unitCost)
    {
        quantity = 0m;
        unitCost = 0m;

        var normalized = combinedToken.Trim().Replace('O', '0').Replace('o', '0');
        var decimalPointIndex = normalized.LastIndexOf('.');
        if (decimalPointIndex <= 0 || decimalPointIndex >= normalized.Length - 1)
        {
            return false;
        }

        var integerDigits = normalized[..decimalPointIndex].Replace(",", string.Empty);
        var fractionDigits = normalized[(decimalPointIndex + 1)..];
        if (integerDigits.Length < 2 || fractionDigits.Length == 0)
        {
            return false;
        }

        for (var qtyDigitsLength = 1; qtyDigitsLength <= 2; qtyDigitsLength++)
        {
            if (qtyDigitsLength >= integerDigits.Length)
            {
                continue;
            }

            var quantityToken = integerDigits[..qtyDigitsLength];
            var unitIntegerToken = integerDigits[qtyDigitsLength..];
            var unitToken = $"{unitIntegerToken}.{fractionDigits}";

            if (!decimal.TryParse(quantityToken, NumberStyles.None, CultureInfo.InvariantCulture, out var parsedQuantity) ||
                parsedQuantity <= 0m ||
                parsedQuantity > 200m)
            {
                continue;
            }

            if (!decimal.TryParse(unitToken, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var parsedUnitCost) ||
                parsedUnitCost <= 0m)
            {
                continue;
            }

            if (!IsQuantityUnitTotalConsistent(parsedQuantity, parsedUnitCost, lineTotal))
            {
                continue;
            }

            quantity = parsedQuantity;
            unitCost = parsedUnitCost;
            return true;
        }

        return false;
    }

    private static bool ShouldSkipLineForItemParsing(string line)
    {
        var normalized = line.ToLowerInvariant();
        if (normalized.Contains("invoice", StringComparison.Ordinal) ||
            normalized.Contains("supplier", StringComparison.Ordinal) ||
            normalized.Contains("vendor", StringComparison.Ordinal) ||
            normalized.Contains("phone", StringComparison.Ordinal) ||
            normalized.Contains("subtotal", StringComparison.Ordinal) ||
            normalized.Contains("tax", StringComparison.Ordinal) ||
            normalized.Contains("vat", StringComparison.Ordinal) ||
            normalized.Contains("grand total", StringComparison.Ordinal) ||
            normalized.Contains("item description", StringComparison.Ordinal) ||
            normalized.Contains("line total", StringComparison.Ordinal) ||
            normalized.StartsWith("%pdf", StringComparison.Ordinal) ||
            normalized.Contains("/type", StringComparison.Ordinal) ||
            normalized.Contains("endobj", StringComparison.Ordinal) ||
            normalized == "obj" ||
            normalized.Contains("xref", StringComparison.Ordinal) ||
            normalized.Contains("trailer", StringComparison.Ordinal))
        {
            return true;
        }

        return false;
    }

    private static bool TryExtractTrailingAmount(string line, out decimal amount)
    {
        amount = 0m;
        var normalized = line.Replace("|", string.Empty);
        var amountMatches = AmountTokenRegex.Matches(normalized);
        for (var index = amountMatches.Count - 1; index >= 0; index--)
        {
            if (TryParseAmount(amountMatches[index].Value, out amount))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TryParseAmount(string value, out decimal parsed)
    {
        parsed = 0m;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var filtered = new string(value
            .Where(ch => char.IsDigit(ch) || ch is '.' or ',' or '-' or '+' or 'O' or 'o')
            .ToArray());

        if (string.IsNullOrWhiteSpace(filtered))
        {
            return false;
        }

        filtered = filtered.Replace('O', '0').Replace('o', '0');

        if (filtered.Contains(',') && filtered.Contains('.'))
        {
            if (filtered.LastIndexOf('.') > filtered.LastIndexOf(','))
            {
                filtered = filtered.Replace(",", string.Empty);
            }
            else
            {
                filtered = filtered.Replace(".", string.Empty).Replace(',', '.');
            }
        }
        else if (filtered.Contains(','))
        {
            var commaIndex = filtered.LastIndexOf(',');
            var digitsAfterComma = filtered.Length - commaIndex - 1;
            filtered = digitsAfterComma <= 2
                ? filtered.Replace(',', '.')
                : filtered.Replace(",", string.Empty);
        }

        var dotCount = filtered.Count(ch => ch == '.');
        if (dotCount > 1)
        {
            var lastDot = filtered.LastIndexOf('.');
            filtered = $"{filtered[..lastDot].Replace(".", string.Empty)}{filtered[lastDot..]}";
        }

        return decimal.TryParse(
            filtered,
            NumberStyles.AllowDecimalPoint | NumberStyles.AllowLeadingSign,
            CultureInfo.InvariantCulture,
            out parsed);
    }

    private static string? TryDecodeRawText(BillFileData file)
    {
        var bytes = file.Bytes;
        if (bytes.Length == 0)
        {
            return null;
        }

        if (IsPdf(file))
        {
            var pdfText = TryExtractPdfText(bytes);
            if (!string.IsNullOrWhiteSpace(pdfText))
            {
                return TruncateText(pdfText);
            }
        }

        var utf8 = Encoding.UTF8.GetString(bytes);
        if (string.IsNullOrWhiteSpace(utf8))
        {
            return null;
        }

        var printableChars = utf8.Count(ch =>
            ch == '\n' || ch == '\r' || ch == '\t' ||
            (!char.IsControl(ch) && ch < 127));

        var ratio = printableChars / (double)Math.Max(1, utf8.Length);
        if (ratio < 0.45d)
        {
            return null;
        }

        return TruncateText(utf8);
    }

    private static string? TryExtractPdfText(byte[] bytes)
    {
        try
        {
            using var stream = new MemoryStream(bytes);
            using var document = PdfDocument.Open(stream);
            var builder = new StringBuilder(capacity: 8_192);
            foreach (var page in document.GetPages())
            {
                var pageText = page.Text;
                if (string.IsNullOrWhiteSpace(pageText))
                {
                    continue;
                }

                builder.AppendLine(pageText);
                if (builder.Length >= 32_000)
                {
                    break;
                }
            }

            var text = builder.ToString();
            return string.IsNullOrWhiteSpace(text) ? null : text;
        }
        catch
        {
            return null;
        }
    }

    private static bool IsPdf(BillFileData file)
    {
        if (string.Equals(file.ContentType, "application/pdf", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var extension = Path.GetExtension(file.FileName);
        if (string.Equals(extension, ".pdf", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var bytes = file.Bytes;
        return bytes.Length >= 5 &&
               bytes[0] == 0x25 &&
               bytes[1] == 0x50 &&
               bytes[2] == 0x44 &&
               bytes[3] == 0x46 &&
               bytes[4] == 0x2D;
    }

    private static string? TryInferSupplierFromLines(string rawText)
    {
        var compact = Regex.Replace(rawText, @"\s+", " ").Trim();
        var leadingName = Regex.Match(compact, @"^\s*(?<name>[A-Za-z][A-Za-z\s\.\-&]{2,120}?)(?=\d)");
        if (leadingName.Success)
        {
            var candidate = leadingName.Groups["name"].Value.Trim();
            if (candidate.Length >= 3 &&
                !candidate.Contains("invoice", StringComparison.OrdinalIgnoreCase) &&
                !candidate.Contains("supplier bill", StringComparison.OrdinalIgnoreCase))
            {
                return candidate;
            }
        }

        foreach (var line in SplitLines(rawText))
        {
            var normalized = Regex.Replace(line, @"\s{2,}", " ").Trim();
            if (normalized.Length < 3)
            {
                continue;
            }

            var lower = normalized.ToLowerInvariant();
            if (lower.StartsWith("%pdf", StringComparison.Ordinal) ||
                lower.Contains("/type", StringComparison.Ordinal) ||
                lower.Contains("reportlab", StringComparison.Ordinal) ||
                lower.Contains("invoice", StringComparison.Ordinal) ||
                lower.Contains("subtotal", StringComparison.Ordinal) ||
                lower.Contains("tax", StringComparison.Ordinal) ||
                lower.Contains("total", StringComparison.Ordinal) ||
                lower.Contains("phone", StringComparison.Ordinal) ||
                lower.Contains("generated sample", StringComparison.Ordinal) ||
                normalized.Contains('/'))
            {
                continue;
            }

            if (lower.Contains("supplier bill", StringComparison.Ordinal))
            {
                normalized = Regex.Replace(normalized, @"(?i)\bsupplier\s+bill\b", string.Empty).Trim();
            }

            if (normalized.Length < 3 || char.IsDigit(normalized[0]))
            {
                continue;
            }

            var letterCount = normalized.Count(char.IsLetter);
            if (letterCount < 4)
            {
                continue;
            }

            return normalized;
        }

        return null;
    }

    private static IEnumerable<string> SplitLines(string rawText)
    {
        return rawText
            .Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Trim())
            .Where(x => x.Length >= 3);
    }

    private static string NormalizeRawTextForParsing(string rawText)
    {
        var normalized = rawText
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n');

        normalized = Regex.Replace(normalized, @"(?i)(supplier\s+bill)\s*(invoice\s+no\s*:)", "$1\n$2");
        normalized = Regex.Replace(normalized, @"(?i)\s*(invoice\s+no\s*:)", "\n$1");
        normalized = Regex.Replace(normalized, @"(?i)\s*(invoice\s+date\s*:)", "\n$1");
        normalized = Regex.Replace(normalized, @"(?i)\s*(item\s+description)", "\n$1");
        normalized = Regex.Replace(normalized, @"(?i)\s*(subtotal\b)", "\n$1");
        normalized = Regex.Replace(normalized, @"(?i)\s*(tax\b)", "\n$1");
        normalized = Regex.Replace(normalized, @"(?i)\s*(grand\s+total\b)", "\n$1");
        normalized = Regex.Replace(normalized, @"(?i)\s*(generated sample supplier bill)", "\n$1");

        return Regex.Replace(normalized, @"[ \t]{2,}", " ").Trim();
    }

    private static string TruncateText(string text)
    {
        return text.Length > 24_000 ? text[..24_000] : text;
    }
}

public sealed class ResilientOcrProvider(
    IOcrProviderCore innerProvider,
    IOptions<PurchasingOptions> options,
    ILogger<ResilientOcrProvider> logger) : IOcrProvider
{
    private readonly object gate = new();
    private int consecutiveFailures;
    private DateTimeOffset? circuitOpenUntilUtc;

    public async Task<PurchaseOcrExtractionResult> ExtractAsync(
        BillFileData file,
        CancellationToken cancellationToken)
    {
        ThrowIfCircuitOpen();

        Exception? lastException = null;
        var retryCount = Math.Max(0, options.Value.OcrRetryCount);
        var timeoutMs = ResolveProviderTimeoutMs(options.Value);

        for (var attempt = 1; attempt <= retryCount + 1; attempt++)
        {
            try
            {
                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeoutCts.CancelAfter(TimeSpan.FromMilliseconds(timeoutMs));
                var result = await innerProvider.ExtractAsync(file, timeoutCts.Token);
                ResetCircuit();
                return result;
            }
            catch (OcrProviderUnavailableException exception)
            {
                lastException = exception;
                logger.LogWarning(
                    exception,
                    "OCR provider reported unavailable on attempt {Attempt} for file {FileName}. Reason: {Reason}",
                    attempt,
                    file.FileName,
                    exception.Message);
            }
            catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
            {
                lastException = exception;
                logger.LogWarning(
                    "OCR provider timed out on attempt {Attempt} for file {FileName}.",
                    attempt,
                    file.FileName);
            }
            catch (Exception exception)
            {
                lastException = exception;
                logger.LogWarning(
                    exception,
                    "OCR provider failed on attempt {Attempt} for file {FileName}.",
                    attempt,
                    file.FileName);
            }

            if (attempt <= retryCount)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(250 * attempt), cancellationToken);
            }
        }

        MarkFailure();
        if (lastException is OcrProviderUnavailableException providerException)
        {
            throw providerException;
        }

        if (lastException is OperationCanceledException)
        {
            throw new OcrProviderUnavailableException(
                "OCR provider request timed out. Please retry with a clearer image or check provider availability.",
                lastException);
        }

        throw new OcrProviderUnavailableException(
            "OCR provider is currently unavailable. Switch to manual review for this bill.",
            lastException);
    }

    private static int ResolveProviderTimeoutMs(PurchasingOptions settings)
    {
        var provider = (settings.OcrProvider ?? string.Empty).Trim();
        var configuredTimeout = string.Equals(provider, "openai", StringComparison.OrdinalIgnoreCase)
            ? settings.OpenAiRequestTimeoutMs
            : settings.OcrTimeoutMs;
        if (configuredTimeout <= 0)
        {
            configuredTimeout = string.Equals(provider, "openai", StringComparison.OrdinalIgnoreCase) ? 20000 : 8000;
        }

        return Math.Clamp(configuredTimeout, 1000, 180000);
    }

    private void ThrowIfCircuitOpen()
    {
        lock (gate)
        {
            if (!circuitOpenUntilUtc.HasValue)
            {
                return;
            }

            if (circuitOpenUntilUtc.Value <= DateTimeOffset.UtcNow)
            {
                circuitOpenUntilUtc = null;
                consecutiveFailures = 0;
                return;
            }

            throw new OcrProviderUnavailableException(
                $"OCR provider circuit breaker is open until {circuitOpenUntilUtc.Value:O}.");
        }
    }

    private void ResetCircuit()
    {
        lock (gate)
        {
            consecutiveFailures = 0;
            circuitOpenUntilUtc = null;
        }
    }

    private void MarkFailure()
    {
        lock (gate)
        {
            consecutiveFailures++;
            var threshold = Math.Max(1, options.Value.OcrCircuitBreakerFailureThreshold);
            if (consecutiveFailures < threshold)
            {
                return;
            }

            var openSeconds = Math.Max(10, options.Value.OcrCircuitBreakerOpenSeconds);
            circuitOpenUntilUtc = DateTimeOffset.UtcNow.AddSeconds(openSeconds);
            logger.LogWarning(
                "OCR provider circuit opened for {OpenSeconds}s after {Failures} consecutive failures.",
                openSeconds,
                consecutiveFailures);
        }
    }
}
