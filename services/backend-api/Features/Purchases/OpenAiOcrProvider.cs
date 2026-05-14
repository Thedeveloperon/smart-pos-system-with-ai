using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace SmartPos.Backend.Features.Purchases;

public sealed class OpenAiOcrProvider(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    BasicTextOcrProvider basicTextProvider,
    IOptions<PurchasingOptions> options,
    ILogger<OpenAiOcrProvider> logger) : IOcrProviderCore
{
    private const int MaxRawTextLength = 24_000;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> SupportedImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png",
        ".jpg",
        ".jpeg"
    };
    private static readonly HashSet<string> SupportedImageContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png",
        "image/jpg",
        "image/jpeg"
    };

    public async Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var apiBaseUrl = (settings.OpenAiApiBaseUrl ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(apiBaseUrl))
        {
            throw new OcrProviderUnavailableException("Purchasing OpenAI API base URL is not configured.");
        }

        var (apiKey, keySource) = ResolveApiKey(configuration, settings);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new OcrProviderUnavailableException(
                $"OpenAI API key is not configured for Purchasing OCR. Set '{keySource}'.");
        }

        var model = string.IsNullOrWhiteSpace(settings.OpenAiModel)
            ? "gpt-5.4-mini"
            : settings.OpenAiModel.Trim();
        var isImage = IsImageFile(file);
        var isPdf = IsPdf(file);

        PurchaseOcrExtractionResult? localFallback = null;
        var localText = string.Empty;
        if (!isImage || isPdf)
        {
            localFallback = await basicTextProvider.ExtractAsync(file, cancellationToken);
            localText = (localFallback.RawText ?? string.Empty).Trim();
        }

        var userContent = BuildUserContent(file, isImage, isPdf, localText);
        using var requestMessage = BuildRequestMessage(apiBaseUrl, model, userContent, apiKey, settings);
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromMilliseconds(Math.Clamp(settings.OpenAiRequestTimeoutMs, 1000, 120000)));

        string rawResponse;
        try
        {
            var client = httpClientFactory.CreateClient("openai-ocr");
            using var response = await client.SendAsync(requestMessage, timeoutCts.Token);
            rawResponse = await response.Content.ReadAsStringAsync(timeoutCts.Token);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "OpenAI OCR request failed with status {StatusCode}. Body preview: {BodyPreview}",
                    (int)response.StatusCode,
                    Preview(rawResponse));
                throw new OcrProviderUnavailableException(
                    $"OpenAI OCR request failed with status {(int)response.StatusCode}.");
            }
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new OcrProviderUnavailableException("OpenAI OCR request timed out.", exception);
        }
        catch (HttpRequestException exception)
        {
            throw new OcrProviderUnavailableException("OpenAI OCR request failed to reach provider.", exception);
        }

        var outputText = ExtractOutputTextFromRawResponse(rawResponse);
        if (string.IsNullOrWhiteSpace(outputText))
        {
            throw new OcrProviderUnavailableException("OpenAI OCR response was empty.");
        }

        JsonElement payloadRoot;
        try
        {
            payloadRoot = ParseOutputJsonPayload(outputText);
        }
        catch (JsonException exception)
        {
            throw new OcrProviderUnavailableException("OpenAI OCR returned invalid JSON output.", exception);
        }

        var extracted = MapToExtractionResult(payloadRoot, outputText);
        return MergeWithFallback(extracted, localFallback);
    }

    private static HttpRequestMessage BuildRequestMessage(
        string apiBaseUrl,
        string model,
        IReadOnlyList<object> userContent,
        string apiKey,
        PurchasingOptions settings)
    {
        var payload = new
        {
            model,
            input = new object[]
            {
                new
                {
                    role = "system",
                    content = new object[]
                    {
                        new
                        {
                            type = "input_text",
                            text = "You extract supplier bill data for POS stock intake. Output must be strictly valid JSON only."
                        }
                    }
                },
                new
                {
                    role = "user",
                    content = userContent
                }
            },
            max_output_tokens = Math.Clamp(settings.OpenAiMaxOutputTokens, 256, 4096),
            temperature = 0.1
        };

        var message = new HttpRequestMessage(HttpMethod.Post, $"{apiBaseUrl.TrimEnd('/')}/responses")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(payload, JsonOptions),
                Encoding.UTF8,
                "application/json")
        };
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        return message;
    }

    private static List<object> BuildUserContent(BillFileData file, bool isImage, bool isPdf, string localText)
    {
        var content = new List<object>
        {
            new
            {
                type = "input_text",
                text = BuildExtractionInstruction(file)
            }
        };

        if (isImage)
        {
            var mimeType = ResolveImageMimeType(file);
            content.Add(new
            {
                type = "input_image",
                image_url = BuildDataUrl(file.Bytes, mimeType)
            });
        }
        else if (isPdf && string.IsNullOrWhiteSpace(localText))
        {
            content.Add(new
            {
                type = "input_file",
                filename = file.FileName,
                file_data = BuildDataUrl(file.Bytes, "application/pdf")
            });
        }

        if (!string.IsNullOrWhiteSpace(localText))
        {
            content.Add(new
            {
                type = "input_text",
                text = $"Extracted text from local parser (use as supplemental context):\n{Truncate(localText, MaxRawTextLength)}"
            });
        }

        return content;
    }

    private static string BuildExtractionInstruction(BillFileData file)
    {
        return $$"""
Extract this supplier bill into JSON for stock intake.
Return JSON only. Do not include markdown or explanation.

Schema:
{
  "supplier_name": string|null,
  "invoice_number": string|null,
  "invoice_date": string|null,
  "currency": string|null,
  "subtotal": number|null,
  "tax_total": number|null,
  "grand_total": number|null,
  "overall_confidence": number|null,
  "lines": [
    {
      "line_no": number|null,
      "raw_text": string|null,
      "item_name": string|null,
      "quantity": number|null,
      "unit_cost": number|null,
      "line_total": number|null,
      "confidence": number|null
    }
  ]
}

Rules:
- Keep monetary values as plain numbers.
- Use null when unknown.
- Confidence must be between 0 and 1.
- Exclude summary rows such as subtotal/tax/grand total from lines.
- Currency code should be ISO style (for Sri Lanka use LKR).

Metadata:
- file_name: "{{file.FileName}}"
- content_type: "{{file.ContentType}}"
""";
    }

    private static (string ApiKey, string KeySource) ResolveApiKey(
        IConfiguration configuration,
        PurchasingOptions settings)
    {
        var configuredEnvVar = (settings.OpenAiApiKeyEnvironmentVariable ?? string.Empty).Trim();
        var envVarName = string.IsNullOrWhiteSpace(configuredEnvVar)
            ? "OPENAI_API_KEY"
            : configuredEnvVar;

        var fromEnv = Environment.GetEnvironmentVariable(envVarName);
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return (fromEnv.Trim(), $"environment variable '{envVarName}'");
        }

        var fromConfiguration =
            configuration[$"{PurchasingOptions.SectionName}:OpenAiApiKey"]
            ?? configuration["OpenAI:ApiKey"]
            ?? configuration["OPENAI_API_KEY"]
            ?? settings.OpenAiApiKey;

        var value = (fromConfiguration ?? string.Empty).Trim();
        return (value, $"{PurchasingOptions.SectionName}:OpenAiApiKey");
    }

    private static PurchaseOcrExtractionResult MapToExtractionResult(JsonElement payloadRoot, string outputText)
    {
        var lines = ParseLines(payloadRoot);
        var subtotal = TryReadDecimal(payloadRoot, "subtotal");
        var taxTotal = TryReadDecimal(payloadRoot, "tax_total", "tax");
        var grandTotal = TryReadDecimal(payloadRoot, "grand_total", "total");
        if (!grandTotal.HasValue && subtotal.HasValue)
        {
            grandTotal = Math.Round(subtotal.Value + (taxTotal ?? 0m), 2, MidpointRounding.AwayFromZero);
        }

        decimal? overallConfidence = TryReadConfidence(payloadRoot, "overall_confidence", "confidence");
        if (!overallConfidence.HasValue)
        {
            var lineConfidences = lines
                .Where(x => x.Confidence.HasValue)
                .Select(x => x.Confidence!.Value)
                .ToArray();
            if (lineConfidences.Length > 0)
            {
                overallConfidence = Math.Round(
                    lineConfidences.Average(),
                    4,
                    MidpointRounding.AwayFromZero);
            }
        }

        return new PurchaseOcrExtractionResult
        {
            ProviderName = "openai",
            SupplierName = NormalizeOptional(TryReadString(payloadRoot, "supplier_name", "supplier", "vendor_name")),
            InvoiceNumber = NormalizeOptional(TryReadString(payloadRoot, "invoice_number", "invoice_no")),
            InvoiceDate = TryReadDate(payloadRoot, "invoice_date", "date"),
            Currency = NormalizeCurrency(TryReadString(payloadRoot, "currency", "currency_code")),
            Subtotal = subtotal,
            TaxTotal = taxTotal,
            GrandTotal = grandTotal,
            OverallConfidence = overallConfidence.HasValue
                ? Math.Clamp(overallConfidence.Value, 0m, 1m)
                : null,
            RawText = Truncate(outputText, MaxRawTextLength),
            Lines = lines
        };
    }

    private static List<PurchaseOcrExtractionLine> ParseLines(JsonElement root)
    {
        var result = new List<PurchaseOcrExtractionLine>();
        var linesArray = TryReadArray(root, "lines", "line_items", "items");
        if (linesArray is null)
        {
            return result;
        }

        var fallbackLineNumber = 1;
        foreach (var item in linesArray.Value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var itemName = NormalizeOptional(TryReadString(item, "item_name", "name", "description"));
            var rawText = NormalizeOptional(TryReadString(item, "raw_text", "text"));
            var quantity = TryReadDecimal(item, "quantity", "qty");
            var unitCost = TryReadDecimal(item, "unit_cost", "unit_price", "price");
            var lineTotal = TryReadDecimal(item, "line_total", "amount", "total");

            if (!lineTotal.HasValue && quantity.HasValue && unitCost.HasValue)
            {
                lineTotal = Math.Round(quantity.Value * unitCost.Value, 2, MidpointRounding.AwayFromZero);
            }

            if (!quantity.HasValue && unitCost.HasValue && lineTotal.HasValue && unitCost.Value > 0m)
            {
                quantity = Math.Round(lineTotal.Value / unitCost.Value, 3, MidpointRounding.AwayFromZero);
            }

            if (string.IsNullOrWhiteSpace(itemName) &&
                string.IsNullOrWhiteSpace(rawText) &&
                !quantity.HasValue &&
                !unitCost.HasValue &&
                !lineTotal.HasValue)
            {
                continue;
            }

            var lineNumber = TryReadInt(item, "line_no", "line_number") ?? fallbackLineNumber++;
            result.Add(new PurchaseOcrExtractionLine
            {
                LineNumber = lineNumber,
                RawText = rawText,
                ItemName = itemName,
                Quantity = quantity.HasValue
                    ? Math.Round(Math.Max(0m, quantity.Value), 3, MidpointRounding.AwayFromZero)
                    : null,
                UnitCost = unitCost.HasValue
                    ? Math.Round(Math.Max(0m, unitCost.Value), 2, MidpointRounding.AwayFromZero)
                    : null,
                LineTotal = lineTotal.HasValue
                    ? Math.Round(Math.Max(0m, lineTotal.Value), 2, MidpointRounding.AwayFromZero)
                    : null,
                Confidence = TryReadConfidence(item, "confidence", "line_confidence")
            });
        }

        return result;
    }

    private static PurchaseOcrExtractionResult MergeWithFallback(
        PurchaseOcrExtractionResult primary,
        PurchaseOcrExtractionResult? fallback)
    {
        if (fallback is null)
        {
            return primary;
        }

        primary.SupplierName ??= fallback.SupplierName;
        primary.InvoiceNumber ??= fallback.InvoiceNumber;
        primary.InvoiceDate ??= fallback.InvoiceDate;
        primary.Subtotal ??= fallback.Subtotal;
        primary.TaxTotal ??= fallback.TaxTotal;
        primary.GrandTotal ??= fallback.GrandTotal;
        primary.OverallConfidence ??= fallback.OverallConfidence;
        if (string.IsNullOrWhiteSpace(primary.Currency))
        {
            primary.Currency = string.IsNullOrWhiteSpace(fallback.Currency) ? "LKR" : fallback.Currency;
        }

        if (primary.Lines.Count == 0 && fallback.Lines.Count > 0)
        {
            primary.Lines = fallback.Lines
                .Select(line => new PurchaseOcrExtractionLine
                {
                    LineNumber = line.LineNumber,
                    RawText = line.RawText,
                    ItemName = line.ItemName,
                    Quantity = line.Quantity,
                    UnitCost = line.UnitCost,
                    LineTotal = line.LineTotal,
                    Confidence = line.Confidence
                })
                .ToList();
        }

        return primary;
    }

    private static JsonElement ParseOutputJsonPayload(string outputText)
    {
        var candidate = outputText.Trim();
        if (candidate.StartsWith("```", StringComparison.Ordinal))
        {
            candidate = StripCodeFence(candidate);
        }

        if (TryParseJson(candidate, out var parsed))
        {
            return parsed;
        }

        var start = candidate.IndexOf('{');
        var end = candidate.LastIndexOf('}');
        if (start >= 0 && end > start)
        {
            var sliced = candidate[start..(end + 1)];
            if (TryParseJson(sliced, out parsed))
            {
                return parsed;
            }
        }

        throw new JsonException("Could not parse JSON payload.");
    }

    private static bool TryParseJson(string input, out JsonElement root)
    {
        root = default;
        try
        {
            using var doc = JsonDocument.Parse(input);
            root = doc.RootElement.Clone();
            return root.ValueKind == JsonValueKind.Object;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string StripCodeFence(string input)
    {
        var trimmed = input.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            return trimmed;
        }

        var firstNewLine = trimmed.IndexOf('\n');
        if (firstNewLine < 0)
        {
            return trimmed;
        }

        var body = trimmed[(firstNewLine + 1)..];
        var closingFenceIndex = body.LastIndexOf("```", StringComparison.Ordinal);
        return closingFenceIndex >= 0
            ? body[..closingFenceIndex].Trim()
            : body.Trim();
    }

    private static string? ExtractOutputTextFromRawResponse(string rawResponse)
    {
        if (string.IsNullOrWhiteSpace(rawResponse))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(rawResponse);
            var root = document.RootElement;

            if (TryGetProperty(root, "output_text", out var outputTextElement) &&
                outputTextElement.ValueKind == JsonValueKind.String)
            {
                return outputTextElement.GetString()?.Trim();
            }

            if (TryGetProperty(root, "output", out var outputElement) &&
                outputElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var outputItem in outputElement.EnumerateArray())
                {
                    if (!TryGetProperty(outputItem, "content", out var contentElement) ||
                        contentElement.ValueKind != JsonValueKind.Array)
                    {
                        continue;
                    }

                    foreach (var contentItem in contentElement.EnumerateArray())
                    {
                        if (TryGetProperty(contentItem, "text", out var textElement) &&
                            textElement.ValueKind == JsonValueKind.String)
                        {
                            return textElement.GetString()?.Trim();
                        }
                    }
                }
            }
        }
        catch (JsonException)
        {
            return null;
        }

        return null;
    }

    private static JsonElement? TryReadArray(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (TryGetProperty(root, name, out var element) && element.ValueKind == JsonValueKind.Array)
            {
                return element;
            }
        }

        return null;
    }

    private static string? TryReadString(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!TryGetProperty(root, name, out var element))
            {
                continue;
            }

            if (element.ValueKind == JsonValueKind.String)
            {
                var value = element.GetString()?.Trim();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    return value;
                }

                continue;
            }

            if (element.ValueKind == JsonValueKind.Number ||
                element.ValueKind == JsonValueKind.True ||
                element.ValueKind == JsonValueKind.False)
            {
                var serialized = element.ToString()?.Trim();
                if (!string.IsNullOrWhiteSpace(serialized))
                {
                    return serialized;
                }
            }
        }

        return null;
    }

    private static decimal? TryReadDecimal(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!TryGetProperty(root, name, out var element))
            {
                continue;
            }

            if (element.ValueKind == JsonValueKind.Number && element.TryGetDecimal(out var numeric))
            {
                return numeric;
            }

            if (element.ValueKind == JsonValueKind.String &&
                TryParseLooseDecimal(element.GetString(), out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static int? TryReadInt(JsonElement root, params string[] names)
    {
        foreach (var name in names)
        {
            if (!TryGetProperty(root, name, out var element))
            {
                continue;
            }

            if (element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out var intValue))
            {
                return intValue;
            }

            if (element.ValueKind == JsonValueKind.String &&
                int.TryParse(
                    element.GetString(),
                    NumberStyles.Integer,
                    CultureInfo.InvariantCulture,
                    out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private static decimal? TryReadConfidence(JsonElement root, params string[] names)
    {
        var parsed = TryReadDecimal(root, names);
        if (!parsed.HasValue)
        {
            return null;
        }

        return Math.Round(Math.Clamp(parsed.Value, 0m, 1m), 4, MidpointRounding.AwayFromZero);
    }

    private static DateTimeOffset? TryReadDate(JsonElement root, params string[] names)
    {
        var raw = TryReadString(root, names);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        if (DateTimeOffset.TryParse(
                raw,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.AssumeLocal,
                out var dto))
        {
            return dto;
        }

        if (DateTime.TryParse(
                raw,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces,
                out var dateOnly))
        {
            return new DateTimeOffset(dateOnly);
        }

        return null;
    }

    private static bool TryParseLooseDecimal(string? rawValue, out decimal parsed)
    {
        parsed = 0m;
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return false;
        }

        var value = rawValue.Trim().Replace('O', '0').Replace('o', '0');
        var filtered = new string(value
            .Where(ch => char.IsDigit(ch) || ch is '.' or ',' or '-' or '+')
            .ToArray());

        if (string.IsNullOrWhiteSpace(filtered))
        {
            return false;
        }

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
            var decimals = filtered.Length - commaIndex - 1;
            filtered = decimals <= 2
                ? filtered.Replace(',', '.')
                : filtered.Replace(",", string.Empty);
        }

        var dots = filtered.Count(ch => ch == '.');
        if (dots > 1)
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

    private static bool TryGetProperty(JsonElement element, string name, out JsonElement value)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    value = property.Value;
                    return true;
                }
            }
        }

        value = default;
        return false;
    }

    private static bool IsImageFile(BillFileData file)
    {
        if (SupportedImageContentTypes.Contains(file.ContentType))
        {
            return true;
        }

        var extension = Path.GetExtension(file.FileName);
        return SupportedImageExtensions.Contains(extension);
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

    private static string ResolveImageMimeType(BillFileData file)
    {
        if (SupportedImageContentTypes.Contains(file.ContentType))
        {
            return file.ContentType;
        }

        return Path.GetExtension(file.FileName).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            _ => "image/png"
        };
    }

    private static string BuildDataUrl(byte[] bytes, string contentType)
    {
        return $"data:{contentType};base64,{Convert.ToBase64String(bytes)}";
    }

    private static string NormalizeCurrency(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToUpperInvariant();
        return string.IsNullOrWhiteSpace(normalized) ? "LKR" : normalized;
    }

    private static string? NormalizeOptional(string? value)
    {
        var normalized = (value ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static string Truncate(string value, int maxLength)
    {
        return value.Length <= maxLength ? value : value[..maxLength];
    }

    private static string Preview(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return string.Empty;
        }

        var flattened = raw.ReplaceLineEndings(" ").Trim();
        return flattened.Length <= 320 ? flattened : $"{flattened[..320]}...";
    }
}
