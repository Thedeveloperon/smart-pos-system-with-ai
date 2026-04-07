using System.Diagnostics;
using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using UglyToad.PdfPig;

namespace SmartPos.Backend.Features.Purchases;

public sealed class OpenAiVisionOcrProvider(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    IOptions<PurchasingOptions> options,
    ILogger<OpenAiVisionOcrProvider> logger) : IOcrProviderCore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken)
    {
        var apiBaseUrl = ResolveApiBaseUrl(configuration, options.Value);
        if (string.IsNullOrWhiteSpace(apiBaseUrl))
        {
            throw new OcrProviderUnavailableException("OpenAI API base URL is not configured for purchase extraction.");
        }

        var (apiKey, apiKeyEnvironmentVariable) = ResolveOpenAiApiKey(configuration);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new OcrProviderUnavailableException(
                $"OpenAI API key is not configured. Set environment variable '{apiKeyEnvironmentVariable}'.");
        }

        var model = string.IsNullOrWhiteSpace(options.Value.OpenAiModel)
            ? "gpt-4.1-mini"
            : options.Value.OpenAiModel.Trim();

        var stopwatch = Stopwatch.StartNew();
        try
        {
            var userContent = BuildUserContent(file);
            var schema = BuildExtractionSchema();
            var requestBody = JsonSerializer.Serialize(new
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
                                text =
                                    "Extract supplier bill data into the required schema. Never hallucinate values. Keep unknown values as null. Return only schema-conformant JSON."
                            }
                        }
                    },
                    new
                    {
                        role = "user",
                        content = userContent
                    }
                },
                text = new
                {
                    format = new
                    {
                        type = "json_schema",
                        name = "supplier_bill_extraction",
                        strict = true,
                        schema
                    }
                },
                temperature = 0,
                max_output_tokens = Math.Clamp(options.Value.OpenAiMaxOutputTokens, 512, 4096)
            }, JsonOptions);

            using var message = new HttpRequestMessage(HttpMethod.Post, $"{apiBaseUrl.TrimEnd('/')}/responses")
            {
                Content = new StringContent(requestBody, Encoding.UTF8, "application/json")
            };
            message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromMilliseconds(Math.Clamp(options.Value.OcrTimeoutMs, 1000, 60000)));

            var client = httpClientFactory.CreateClient(nameof(OpenAiVisionOcrProvider));
            using var response = await client.SendAsync(message, timeoutCts.Token);
            var rawResponse = await response.Content.ReadAsStringAsync(timeoutCts.Token);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "OpenAI purchase extraction failed with status {StatusCode}. Body preview: {BodyPreview}",
                    (int)response.StatusCode,
                    rawResponse.Length <= 320 ? rawResponse : rawResponse[..320]);
                throw new OcrProviderUnavailableException(
                    $"OpenAI purchase extraction failed (HTTP {(int)response.StatusCode}).");
            }

            using var responseDocument = JsonDocument.Parse(rawResponse);
            var payloadText = ExtractOutputJsonText(responseDocument.RootElement);
            if (string.IsNullOrWhiteSpace(payloadText))
            {
                throw new OcrProviderUnavailableException(
                    "OpenAI purchase extraction returned no structured payload.");
            }

            using var payloadDocument = JsonDocument.Parse(payloadText);
            var extraction = MapExtractionPayload(payloadDocument.RootElement, model, payloadText);

            logger.LogInformation(
                "OpenAI purchase extraction succeeded. Model={Model} File={FileName} Lines={LineCount} Confidence={Confidence} DurationMs={DurationMs}",
                model,
                file.FileName,
                extraction.Lines.Count,
                extraction.OverallConfidence,
                stopwatch.ElapsedMilliseconds);

            return extraction;
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new OcrProviderUnavailableException("OpenAI purchase extraction timed out.", exception);
        }
        catch (OcrProviderUnavailableException)
        {
            throw;
        }
        catch (JsonException exception)
        {
            throw new OcrProviderUnavailableException("OpenAI purchase extraction returned invalid JSON.", exception);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "OpenAI purchase extraction failed unexpectedly for file {FileName}.", file.FileName);
            throw new OcrProviderUnavailableException(
                "OpenAI purchase extraction is currently unavailable. Switch this upload to manual review.",
                exception);
        }
    }

    private static object[] BuildUserContent(BillFileData file)
    {
        if (file.ContentType is "image/png" or "image/jpeg")
        {
            var dataUri = $"data:{file.ContentType};base64,{Convert.ToBase64String(file.Bytes)}";
            return
            [
                new
                {
                    type = "input_text",
                    text = "Identify supplier, invoice fields, and all line items from this bill image."
                },
                new
                {
                    type = "input_image",
                    image_url = dataUri
                }
            ];
        }

        if (file.ContentType == "application/pdf")
        {
            var text = TryExtractPdfText(file.Bytes);
            if (string.IsNullOrWhiteSpace(text))
            {
                throw new OcrProviderUnavailableException(
                    "PDF could not be parsed for text extraction. Upload a clear image (PNG/JPG) for OpenAI bill identification.");
            }

            return
            [
                new
                {
                    type = "input_text",
                    text = "Identify supplier, invoice fields, and all line items from this supplier bill text."
                },
                new
                {
                    type = "input_text",
                    text = text.Length > 24000 ? text[..24000] : text
                }
            ];
        }

        throw new OcrProviderUnavailableException($"Unsupported file content type '{file.ContentType}' for OpenAI extraction.");
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
                if (builder.Length >= 40_000)
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

    private static string? ExtractOutputJsonText(JsonElement root)
    {
        if (root.TryGetProperty("output_text", out var outputText) &&
            outputText.ValueKind == JsonValueKind.String)
        {
            return outputText.GetString()?.Trim();
        }

        if (root.TryGetProperty("output", out var output) &&
            output.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in output.EnumerateArray())
            {
                if (!item.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                foreach (var contentItem in content.EnumerateArray())
                {
                    if (contentItem.TryGetProperty("json", out var jsonPayload) &&
                        jsonPayload.ValueKind is JsonValueKind.Object or JsonValueKind.Array)
                    {
                        return jsonPayload.GetRawText();
                    }

                    if (contentItem.TryGetProperty("text", out var textPayload) &&
                        textPayload.ValueKind == JsonValueKind.String)
                    {
                        return textPayload.GetString()?.Trim();
                    }
                }
            }
        }

        return null;
    }

    private static PurchaseOcrExtractionResult MapExtractionPayload(
        JsonElement payload,
        string model,
        string rawPayload)
    {
        var result = new PurchaseOcrExtractionResult
        {
            ProviderName = "openai-vision",
            ProviderModel = model,
            RawText = rawPayload.Length > 24000 ? rawPayload[..24000] : rawPayload,
            SupplierName = GetString(payload, "supplier_name"),
            InvoiceNumber = GetString(payload, "invoice_number"),
            InvoiceDate = GetDate(payload, "invoice_date"),
            Currency = NormalizeCurrency(GetString(payload, "currency")),
            Subtotal = GetDecimal(payload, "subtotal"),
            TaxTotal = GetDecimal(payload, "tax_total"),
            GrandTotal = GetDecimal(payload, "grand_total"),
            OverallConfidence = GetClampedConfidence(payload, "confidence")
        };

        if (payload.TryGetProperty("warnings", out var warningsElement) && warningsElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var warning in warningsElement.EnumerateArray())
            {
                if (warning.ValueKind == JsonValueKind.String)
                {
                    var normalized = warning.GetString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(normalized))
                    {
                        result.Warnings.Add(normalized);
                    }
                }
            }
        }

        if (payload.TryGetProperty("lines", out var linesElement) && linesElement.ValueKind == JsonValueKind.Array)
        {
            var nextLine = 1;
            foreach (var line in linesElement.EnumerateArray())
            {
                if (line.ValueKind != JsonValueKind.Object)
                {
                    continue;
                }

                var itemName = GetString(line, "item_name");
                var rawText = GetString(line, "raw_text");
                var quantity = GetDecimal(line, "quantity");
                var unitCost = GetDecimal(line, "unit_cost");
                var lineTotal = GetDecimal(line, "line_total");

                if (!lineTotal.HasValue && quantity.HasValue && unitCost.HasValue)
                {
                    lineTotal = RoundMoney(quantity.Value * unitCost.Value);
                }

                if (string.IsNullOrWhiteSpace(itemName) &&
                    string.IsNullOrWhiteSpace(rawText) &&
                    !quantity.HasValue &&
                    !unitCost.HasValue &&
                    !lineTotal.HasValue)
                {
                    continue;
                }

                var lineNumber = GetInt(line, "line_no") ?? nextLine;
                if (lineNumber <= 0)
                {
                    lineNumber = nextLine;
                }

                result.Lines.Add(new PurchaseOcrExtractionLine
                {
                    LineNumber = lineNumber,
                    ItemName = NormalizeOptional(itemName) ?? NormalizeOptional(rawText),
                    RawText = NormalizeOptional(rawText),
                    Quantity = quantity.HasValue ? RoundQuantity(quantity.Value) : null,
                    UnitCost = unitCost.HasValue ? RoundMoney(unitCost.Value) : null,
                    LineTotal = lineTotal.HasValue ? RoundMoney(lineTotal.Value) : null,
                    Confidence = GetClampedConfidence(line, "confidence")
                });
                nextLine++;
            }
        }

        if (!result.OverallConfidence.HasValue)
        {
            result.OverallConfidence = ComputeFallbackConfidence(result);
        }

        return result;
    }

    private static decimal ComputeFallbackConfidence(PurchaseOcrExtractionResult result)
    {
        var score = 0.3m;
        if (!string.IsNullOrWhiteSpace(result.SupplierName))
        {
            score += 0.1m;
        }

        if (!string.IsNullOrWhiteSpace(result.InvoiceNumber))
        {
            score += 0.1m;
        }

        if (result.GrandTotal.HasValue)
        {
            score += 0.1m;
        }

        if (result.Lines.Count > 0)
        {
            score += 0.25m;
            var completeLines = result.Lines.Count(x => x.Quantity.HasValue && x.UnitCost.HasValue && x.LineTotal.HasValue);
            if (completeLines > 0)
            {
                score += Math.Min(0.15m, completeLines / (decimal)result.Lines.Count * 0.15m);
            }
        }

        return decimal.Round(Math.Clamp(score, 0m, 0.95m), 4, MidpointRounding.AwayFromZero);
    }

    private static object BuildExtractionSchema()
    {
        return new
        {
            type = "object",
            additionalProperties = false,
            properties = new
            {
                supplier_name = new { type = new[] { "string", "null" } },
                invoice_number = new { type = new[] { "string", "null" } },
                invoice_date = new { type = new[] { "string", "null" } },
                currency = new { type = new[] { "string", "null" } },
                subtotal = new { type = new[] { "number", "null" } },
                tax_total = new { type = new[] { "number", "null" } },
                grand_total = new { type = new[] { "number", "null" } },
                confidence = new { type = new[] { "number", "null" } },
                warnings = new
                {
                    type = "array",
                    items = new { type = "string" }
                },
                lines = new
                {
                    type = "array",
                    items = new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            line_no = new { type = new[] { "integer", "null" } },
                            item_name = new { type = new[] { "string", "null" } },
                            raw_text = new { type = new[] { "string", "null" } },
                            quantity = new { type = new[] { "number", "null" } },
                            unit_cost = new { type = new[] { "number", "null" } },
                            line_total = new { type = new[] { "number", "null" } },
                            confidence = new { type = new[] { "number", "null" } }
                        },
                        required = new[] { "line_no", "item_name", "raw_text", "quantity", "unit_cost", "line_total", "confidence" }
                    }
                }
            },
            required = new[] { "supplier_name", "invoice_number", "invoice_date", "currency", "subtotal", "tax_total", "grand_total", "confidence", "warnings", "lines" }
        };
    }

    private static (string ApiKey, string EnvironmentVariableName) ResolveOpenAiApiKey(IConfiguration configuration)
    {
        var configuredEnvironmentVariable =
            configuration["AiInsights:OpenAiApiKeyEnvironmentVariable"] ??
            configuration["AiSuggestions:OpenAiApiKeyEnvironmentVariable"] ??
            "OPENAI_API_KEY";
        var environmentVariableName = string.IsNullOrWhiteSpace(configuredEnvironmentVariable)
            ? "OPENAI_API_KEY"
            : configuredEnvironmentVariable.Trim();

        var apiKeyFromEnvironment = Environment.GetEnvironmentVariable(environmentVariableName);
        if (!string.IsNullOrWhiteSpace(apiKeyFromEnvironment))
        {
            return (apiKeyFromEnvironment.Trim(), environmentVariableName);
        }

        var apiKeyFromConfiguration = configuration["OpenAI:ApiKey"] ??
                                      configuration["OPENAI_API_KEY"] ??
                                      configuration["AiInsights:OpenAiApiKey"] ??
                                      configuration["AiSuggestions:OpenAiApiKey"] ??
                                      string.Empty;
        return (apiKeyFromConfiguration.Trim(), environmentVariableName);
    }

    private static string ResolveApiBaseUrl(IConfiguration configuration, PurchasingOptions purchasingOptions)
    {
        var configured = (purchasingOptions.OpenAiApiBaseUrl ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }

        return (configuration["AiInsights:ApiBaseUrl"] ??
                configuration["AiSuggestions:ApiBaseUrl"] ??
                "https://api.openai.com/v1").Trim();
    }

    private static string? GetString(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var element))
        {
            return null;
        }

        return element.ValueKind == JsonValueKind.String
            ? NormalizeOptional(element.GetString())
            : null;
    }

    private static decimal? GetDecimal(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var element))
        {
            return null;
        }

        if (element.ValueKind == JsonValueKind.Number && element.TryGetDecimal(out var number))
        {
            return number;
        }

        if (element.ValueKind == JsonValueKind.String &&
            decimal.TryParse(element.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static int? GetInt(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var element))
        {
            return null;
        }

        if (element.ValueKind == JsonValueKind.Number && element.TryGetInt32(out var number))
        {
            return number;
        }

        if (element.ValueKind == JsonValueKind.String &&
            int.TryParse(element.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static decimal? GetClampedConfidence(JsonElement root, string propertyName)
    {
        var confidence = GetDecimal(root, propertyName);
        if (!confidence.HasValue)
        {
            return null;
        }

        return decimal.Round(
            Math.Clamp(confidence.Value, 0m, 1m),
            4,
            MidpointRounding.AwayFromZero);
    }

    private static DateTimeOffset? GetDate(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var element) || element.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var value = element.GetString();
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (DateTimeOffset.TryParse(value, out var parsed))
        {
            return parsed;
        }

        if (DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var dateOnly))
        {
            return new DateTimeOffset(dateOnly.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        }

        return null;
    }

    private static string NormalizeCurrency(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "LKR";
        }

        var normalized = new string(value.Trim().ToUpperInvariant().Where(char.IsLetter).ToArray());
        return normalized.Length == 3 ? normalized : "LKR";
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

    private static decimal RoundMoney(decimal value) =>
        decimal.Round(value, 2, MidpointRounding.AwayFromZero);

    private static decimal RoundQuantity(decimal value) =>
        decimal.Round(value, 3, MidpointRounding.AwayFromZero);
}
