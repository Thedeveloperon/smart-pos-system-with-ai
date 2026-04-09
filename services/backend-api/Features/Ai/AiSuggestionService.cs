using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace SmartPos.Backend.Features.Ai;

public sealed class AiSuggestionService(
    HttpClient httpClient,
    IConfiguration configuration,
    IOptions<AiSuggestionOptions> options,
    ILogger<AiSuggestionService> logger)
{
    private const string ProviderOpenAi = "openai";
    private const string ProviderCustom = "custom";
    private const string ProviderLocal = "local";
    private static readonly HashSet<string> GenericImageTokens = new(StringComparer.OrdinalIgnoreCase)
    {
        "img",
        "image",
        "images",
        "photo",
        "picture",
        "pic",
        "picsum",
        "seed",
        "capture",
        "camera",
        "upload",
        "file",
        "new",
        "item",
        "jpg",
        "jpeg",
        "png",
        "webp",
        "gif",
        "heic",
        "heif",
        "thumb",
        "thumbnail",
        "small",
        "medium",
        "large",
        "original",
        "photoid",
        "http",
        "https",
        "www",
        "com",
        "net",
        "org",
        "cdn",
        "content",
        "uploads",
        "assets",
        "static",
        "imageservice",
        "unsplash"
    };
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<ProductSuggestionResponse> GenerateProductSuggestionAsync(
        ProductSuggestionRequest request,
        CancellationToken cancellationToken)
    {
        var target = NormalizeTarget(request.Target);
        var aiOptions = options.Value;

        if (!aiOptions.Enabled)
        {
            throw new InvalidOperationException("AI suggestions are disabled.");
        }

        var provider = NormalizeProvider(aiOptions.Provider);
        var userPrompt = BuildUserPrompt(target, request);
        var systemPrompt = BuildSystemPrompt(target);

        var providerResult = provider switch
        {
            ProviderOpenAi => await GenerateWithOpenAiAsync(
                aiOptions,
                userPrompt,
                systemPrompt,
                cancellationToken),
            ProviderCustom => await GenerateWithCustomProviderOrFallbackAsync(
                target,
                request,
                aiOptions,
                userPrompt,
                systemPrompt,
                cancellationToken),
            ProviderLocal => GenerateWithLocalProvider(target, request, aiOptions),
            _ => throw new InvalidOperationException("Unsupported AI provider.")
        };

        var normalizedSuggestion = NormalizeSuggestion(
            target,
            providerResult.Suggestion,
            request.CategoryOptions ?? []);
        if (string.IsNullOrWhiteSpace(normalizedSuggestion))
        {
            throw new InvalidOperationException("AI suggestion could not be normalized.");
        }

        return new ProductSuggestionResponse
        {
            Target = target,
            Suggestion = normalizedSuggestion,
            Model = providerResult.Model,
            Source = providerResult.Source
        };
    }

    public async Task<ProductFromImageResponse> GenerateProductFromImageAsync(
        ProductFromImageRequest request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            throw new InvalidOperationException("Request payload is required.");
        }

        var imageUrl = (request.ImageUrl ?? string.Empty).Trim();
        var imageHint = (request.ImageHint ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(imageUrl) && string.IsNullOrWhiteSpace(imageHint))
        {
            throw new InvalidOperationException("Image URL or image hint is required.");
        }

        var aiOptions = options.Value;
        if (!aiOptions.Enabled)
        {
            throw new InvalidOperationException("AI suggestions are disabled.");
        }

        var provider = NormalizeProvider(aiOptions.Provider);
        if (provider == ProviderCustom)
        {
            var customResult = await TryGenerateProductFromImageWithCustomProviderAsync(
                request,
                aiOptions,
                cancellationToken);
            if (customResult is not null)
            {
                return customResult;
            }
        }

        var baseRequest = BuildBaseSuggestionRequest(
            request,
            imageUrl,
            imageHint);

        var details = new List<ProductSuggestionResponse>();

        var nameSuggestion = await GenerateProductSuggestionAsync(
            BuildTargetRequest(baseRequest, AiSuggestionTargets.Name),
            cancellationToken);
        details.Add(nameSuggestion);

        var resolvedName = !string.IsNullOrWhiteSpace(nameSuggestion.Suggestion)
            ? nameSuggestion.Suggestion
            : baseRequest.Name;

        var categorySuggestion = await TryGenerateCategorySuggestionAsync(
            baseRequest,
            resolvedName,
            cancellationToken);
        if (categorySuggestion is not null)
        {
            details.Add(categorySuggestion);
        }

        var skuSuggestion = await GenerateProductSuggestionAsync(
            BuildTargetRequest(baseRequest, AiSuggestionTargets.Sku, resolvedName, categorySuggestion?.Suggestion),
            cancellationToken);
        details.Add(skuSuggestion);

        var barcodeSuggestion = await GenerateProductSuggestionAsync(
            BuildTargetRequest(baseRequest, AiSuggestionTargets.Barcode, resolvedName, categorySuggestion?.Suggestion),
            cancellationToken);
        details.Add(barcodeSuggestion);

        var distinctSources = details
            .Select(x => x.Source?.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var distinctModels = details
            .Select(x => x.Model?.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return new ProductFromImageResponse
        {
            Name = nameSuggestion.Suggestion,
            Sku = skuSuggestion.Suggestion,
            Barcode = barcodeSuggestion.Suggestion,
            Category = categorySuggestion?.Suggestion,
            Source = distinctSources.Length == 1 ? distinctSources[0]! : "mixed",
            Model = distinctModels.Length == 1 ? distinctModels[0]! : "mixed",
            Details = details
        };
    }

    private async Task<ProductFromImageResponse?> TryGenerateProductFromImageWithCustomProviderAsync(
        ProductFromImageRequest request,
        AiSuggestionOptions aiOptions,
        CancellationToken cancellationToken)
    {
        try
        {
            var endpoint = ResolveCustomEndpointUri(aiOptions);
            var configuredModel = ResolveModel(aiOptions, "custom");
            var categoryOptions = GetCleanCategoryOptions(request.CategoryOptions ?? []);

            using var message = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(new
                    {
                        target = "product_from_image",
                        model = configuredModel,
                        context = new
                        {
                            name = request.Name,
                            sku = request.Sku,
                            barcode = request.Barcode,
                            image_url = request.ImageUrl,
                            image_hint = request.ImageHint,
                            category_name = request.CategoryName,
                            category_options = categoryOptions,
                            unit_price = request.UnitPrice,
                            cost_price = request.CostPrice
                        }
                    }, JsonOptions),
                    Encoding.UTF8,
                    "application/json")
            };

            var customApiKey = ResolveCustomApiKey(configuration, aiOptions);
            ApplyCustomApiKeyHeader(message, customApiKey, aiOptions);

            var raw = await SendSuggestionRequestAsync(
                message,
                aiOptions.RequestTimeoutMs,
                "Custom AI",
                cancellationToken);

            using var document = JsonDocument.Parse(raw);
            var root = document.RootElement;

            var normalizedName = NormalizeIfPresent(
                AiSuggestionTargets.Name,
                TryReadAnyJsonField(
                    root,
                    "name",
                    "result.name",
                    "fields.name",
                    "prediction.name",
                    "suggestion"),
                categoryOptions);

            var normalizedSku = NormalizeIfPresent(
                AiSuggestionTargets.Sku,
                TryReadAnyJsonField(
                    root,
                    "sku",
                    "result.sku",
                    "fields.sku",
                    "prediction.sku"),
                categoryOptions);

            var normalizedBarcode = NormalizeIfPresent(
                AiSuggestionTargets.Barcode,
                TryReadAnyJsonField(
                    root,
                    "barcode",
                    "result.barcode",
                    "fields.barcode",
                    "prediction.barcode"),
                categoryOptions);

            var normalizedCategory = NormalizeIfPresent(
                AiSuggestionTargets.Category,
                TryReadAnyJsonField(
                    root,
                    "category",
                    "result.category",
                    "fields.category",
                    "prediction.category"),
                categoryOptions);

            if (string.IsNullOrWhiteSpace(normalizedName) &&
                string.IsNullOrWhiteSpace(normalizedSku) &&
                string.IsNullOrWhiteSpace(normalizedBarcode) &&
                string.IsNullOrWhiteSpace(normalizedCategory))
            {
                return null;
            }

            var resolvedModel = ExtractCustomModel(raw, configuredModel);
            var details = new List<ProductSuggestionResponse>();
            if (!string.IsNullOrWhiteSpace(normalizedName))
            {
                details.Add(new ProductSuggestionResponse
                {
                    Target = AiSuggestionTargets.Name,
                    Suggestion = normalizedName,
                    Model = resolvedModel,
                    Source = "custom"
                });
            }

            if (!string.IsNullOrWhiteSpace(normalizedSku))
            {
                details.Add(new ProductSuggestionResponse
                {
                    Target = AiSuggestionTargets.Sku,
                    Suggestion = normalizedSku,
                    Model = resolvedModel,
                    Source = "custom"
                });
            }

            if (!string.IsNullOrWhiteSpace(normalizedBarcode))
            {
                details.Add(new ProductSuggestionResponse
                {
                    Target = AiSuggestionTargets.Barcode,
                    Suggestion = normalizedBarcode,
                    Model = resolvedModel,
                    Source = "custom"
                });
            }

            if (!string.IsNullOrWhiteSpace(normalizedCategory))
            {
                details.Add(new ProductSuggestionResponse
                {
                    Target = AiSuggestionTargets.Category,
                    Suggestion = normalizedCategory,
                    Model = resolvedModel,
                    Source = "custom"
                });
            }

            return new ProductFromImageResponse
            {
                Name = string.IsNullOrWhiteSpace(normalizedName) ? null : normalizedName,
                Sku = string.IsNullOrWhiteSpace(normalizedSku) ? null : normalizedSku,
                Barcode = string.IsNullOrWhiteSpace(normalizedBarcode) ? null : normalizedBarcode,
                Category = string.IsNullOrWhiteSpace(normalizedCategory) ? null : normalizedCategory,
                Source = "custom",
                Model = resolvedModel,
                Details = details
            };
        }
        catch (InvalidOperationException exception)
        {
            logger.LogWarning(exception, "Custom provider product-from-image call failed. Falling back.");
            return null;
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Custom provider product-from-image endpoint is unavailable. Falling back.");
            return null;
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(exception, "Custom provider product-from-image request timed out. Falling back.");
            return null;
        }
        catch (JsonException exception)
        {
            logger.LogWarning(exception, "Custom provider product-from-image response was not valid JSON.");
            return null;
        }
    }

    private static string NormalizeIfPresent(
        string target,
        string? candidate,
        IReadOnlyCollection<string> categoryOptions)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return string.Empty;
        }

        return NormalizeSuggestion(target, candidate, categoryOptions);
    }

    private static string? TryReadAnyJsonField(JsonElement root, params string[] candidatePaths)
    {
        foreach (var path in candidatePaths)
        {
            if (TryReadJsonFieldAsString(root, path, out var value))
            {
                return value;
            }
        }

        return null;
    }

    private async Task<(string Suggestion, string Model, string Source)> GenerateWithCustomProviderOrFallbackAsync(
        string target,
        ProductSuggestionRequest request,
        AiSuggestionOptions aiOptions,
        string userPrompt,
        string systemPrompt,
        CancellationToken cancellationToken)
    {
        try
        {
            return await GenerateWithCustomProviderAsync(
                target,
                request,
                aiOptions,
                userPrompt,
                systemPrompt,
                cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Custom provider endpoint is unavailable. Falling back to local provider.");
            return GenerateWithLocalProvider(target, request, aiOptions);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(exception, "Custom provider request timed out. Falling back to local provider.");
            return GenerateWithLocalProvider(target, request, aiOptions);
        }
        catch (InvalidOperationException exception)
        {
            logger.LogWarning(exception, "Custom provider request failed. Falling back to local provider.");
            return GenerateWithLocalProvider(target, request, aiOptions);
        }
    }

    private static ProductSuggestionRequest BuildBaseSuggestionRequest(
        ProductFromImageRequest request,
        string imageUrl,
        string imageHint)
    {
        return new ProductSuggestionRequest
        {
            Name = request.Name,
            Sku = request.Sku,
            Barcode = request.Barcode,
            ImageUrl = string.IsNullOrWhiteSpace(imageUrl) ? null : imageUrl,
            ImageHint = string.IsNullOrWhiteSpace(imageHint) ? null : imageHint,
            CategoryName = request.CategoryName,
            CategoryOptions = request.CategoryOptions ?? [],
            UnitPrice = request.UnitPrice,
            CostPrice = request.CostPrice
        };
    }

    private static ProductSuggestionRequest BuildTargetRequest(
        ProductSuggestionRequest baseRequest,
        string target,
        string? nameOverride = null,
        string? categoryNameOverride = null)
    {
        return new ProductSuggestionRequest
        {
            Target = target,
            Name = string.IsNullOrWhiteSpace(nameOverride) ? baseRequest.Name : nameOverride,
            Sku = baseRequest.Sku,
            Barcode = baseRequest.Barcode,
            ImageUrl = baseRequest.ImageUrl,
            ImageHint = baseRequest.ImageHint,
            CategoryName = string.IsNullOrWhiteSpace(categoryNameOverride) ? baseRequest.CategoryName : categoryNameOverride,
            CategoryOptions = baseRequest.CategoryOptions ?? [],
            UnitPrice = baseRequest.UnitPrice,
            CostPrice = baseRequest.CostPrice
        };
    }

    private async Task<ProductSuggestionResponse?> TryGenerateCategorySuggestionAsync(
        ProductSuggestionRequest baseRequest,
        string? resolvedName,
        CancellationToken cancellationToken)
    {
        var hasCategoryOptions = (baseRequest.CategoryOptions ?? []).Any(x => !string.IsNullOrWhiteSpace(x));
        if (!hasCategoryOptions)
        {
            return null;
        }

        try
        {
            return await GenerateProductSuggestionAsync(
                BuildTargetRequest(baseRequest, AiSuggestionTargets.Category, resolvedName),
                cancellationToken);
        }
        catch (InvalidOperationException exception)
        {
            logger.LogWarning(exception, "Category suggestion from image failed.");
            return null;
        }
    }

    private async Task<(string Suggestion, string Model, string Source)> GenerateWithOpenAiAsync(
        AiSuggestionOptions aiOptions,
        string userPrompt,
        string systemPrompt,
        CancellationToken cancellationToken)
    {
        var apiBaseUrl = (aiOptions.ApiBaseUrl ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(apiBaseUrl))
        {
            throw new InvalidOperationException("AiSuggestions:ApiBaseUrl is not configured.");
        }

        var apiKey = ResolveOpenAiApiKey(configuration);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("OPENAI_API_KEY is not configured.");
        }

        var model = ResolveModel(aiOptions, "gpt-5.4-mini");

        using var message = new HttpRequestMessage(HttpMethod.Post, $"{apiBaseUrl.TrimEnd('/')}/responses")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new
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
                                    text = systemPrompt
                                }
                            }
                        },
                        new
                        {
                            role = "user",
                            content = new object[]
                            {
                                new
                                {
                                    type = "input_text",
                                    text = userPrompt
                                }
                            }
                        }
                    },
                    temperature = 0.2,
                    max_output_tokens = 120
                }, JsonOptions),
                Encoding.UTF8,
                "application/json")
        };

        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        var raw = await SendSuggestionRequestAsync(message, aiOptions.RequestTimeoutMs, "OpenAI", cancellationToken);
        var outputText = ExtractOutputTextFromRawResponse(raw);
        if (string.IsNullOrWhiteSpace(outputText))
        {
            throw new InvalidOperationException("AI suggestion response was empty.");
        }

        return (outputText, model, "openai");
    }

    private async Task<(string Suggestion, string Model, string Source)> GenerateWithCustomProviderAsync(
        string target,
        ProductSuggestionRequest request,
        AiSuggestionOptions aiOptions,
        string userPrompt,
        string systemPrompt,
        CancellationToken cancellationToken)
    {
        var endpoint = ResolveCustomEndpointUri(aiOptions);
        var configuredModel = ResolveModel(aiOptions, "custom");
        var categoryOptions = GetCleanCategoryOptions(request.CategoryOptions ?? []);

        using var message = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new
                {
                    target,
                    model = configuredModel,
                    system_prompt = systemPrompt,
                    user_prompt = userPrompt,
                    context = new
                    {
                        name = request.Name,
                        sku = request.Sku,
                        barcode = request.Barcode,
                        image_url = request.ImageUrl,
                        image_hint = request.ImageHint,
                        category_name = request.CategoryName,
                        category_options = categoryOptions,
                        unit_price = request.UnitPrice,
                        cost_price = request.CostPrice
                    }
                }, JsonOptions),
                Encoding.UTF8,
                "application/json")
        };

        var customApiKey = ResolveCustomApiKey(configuration, aiOptions);
        ApplyCustomApiKeyHeader(message, customApiKey, aiOptions);

        var raw = await SendSuggestionRequestAsync(message, aiOptions.RequestTimeoutMs, "Custom AI", cancellationToken);
        var suggestion = ExtractCustomSuggestion(raw, aiOptions.CustomSuggestionField);
        if (string.IsNullOrWhiteSpace(suggestion))
        {
            throw new InvalidOperationException(
                "Custom AI suggestion response did not include a valid suggestion.");
        }

        var model = ExtractCustomModel(raw, configuredModel);
        return (suggestion, model, "custom");
    }

    private async Task<string> SendSuggestionRequestAsync(
        HttpRequestMessage message,
        int timeoutMs,
        string providerName,
        CancellationToken cancellationToken)
    {
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromMilliseconds(Math.Clamp(timeoutMs, 1000, 60000)));

        using var response = await httpClient.SendAsync(message, timeoutCts.Token);
        var raw = await response.Content.ReadAsStringAsync(timeoutCts.Token);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning(
                "{Provider} suggestion request failed with status {StatusCode}. Body preview: {BodyPreview}",
                providerName,
                (int)response.StatusCode,
                raw.Length <= 320 ? raw : raw[..320]);
            throw new InvalidOperationException("AI suggestion request failed.");
        }

        return raw;
    }

    private static Uri ResolveCustomEndpointUri(AiSuggestionOptions aiOptions)
    {
        var configured = (aiOptions.CustomEndpointUrl ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(configured))
        {
            throw new InvalidOperationException(
                "AiSuggestions:CustomEndpointUrl is required when Provider is 'Custom'.");
        }

        if (!Uri.TryCreate(configured, UriKind.Absolute, out var endpoint) ||
            (endpoint.Scheme != Uri.UriSchemeHttp && endpoint.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException(
                "AiSuggestions:CustomEndpointUrl must be an absolute http/https URL.");
        }

        return endpoint;
    }

    private static void ApplyCustomApiKeyHeader(
        HttpRequestMessage message,
        string apiKey,
        AiSuggestionOptions aiOptions)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return;
        }

        var headerName = (aiOptions.CustomApiKeyHeader ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(headerName))
        {
            return;
        }

        var prefix = (aiOptions.CustomApiKeyPrefix ?? string.Empty).Trim();
        var headerValue = string.IsNullOrWhiteSpace(prefix)
            ? apiKey
            : $"{prefix} {apiKey}";

        message.Headers.Remove(headerName);
        message.Headers.TryAddWithoutValidation(headerName, headerValue);
    }

    private static string ResolveOpenAiApiKey(IConfiguration configuration)
    {
        return configuration["OPENAI_API_KEY"]
               ?? configuration["OpenAI:ApiKey"]
               ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY")
               ?? string.Empty;
    }

    private static string ResolveCustomApiKey(IConfiguration configuration, AiSuggestionOptions aiOptions)
    {
        return configuration["CUSTOM_AI_API_KEY"]
               ?? configuration["CustomAi:ApiKey"]
               ?? configuration[$"{AiSuggestionOptions.SectionName}:CustomApiKey"]
               ?? Environment.GetEnvironmentVariable("CUSTOM_AI_API_KEY")
               ?? aiOptions.CustomApiKey
               ?? string.Empty;
    }

    private static string ResolveModel(AiSuggestionOptions aiOptions, string fallback)
    {
        var configured = (aiOptions.Model ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(configured) ? fallback : configured;
    }

    private static (string Suggestion, string Model, string Source) GenerateWithLocalProvider(
        string target,
        ProductSuggestionRequest request,
        AiSuggestionOptions aiOptions)
    {
        var baseName = BuildBaseName(request);
        var suggestion = target switch
        {
            AiSuggestionTargets.Name => SuggestName(baseName),
            AiSuggestionTargets.Sku => BuildLocalSku(baseName),
            AiSuggestionTargets.Barcode => BuildLocalBarcode(baseName),
            AiSuggestionTargets.ImageUrl => BuildLocalImageUrl(baseName),
            AiSuggestionTargets.Category => SuggestCategoryFromName(baseName, request.CategoryOptions ?? []),
            _ => string.Empty
        };

        if (string.IsNullOrWhiteSpace(suggestion))
        {
            throw new InvalidOperationException("Local suggestion could not be generated.");
        }

        var configuredModel = (aiOptions.Model ?? string.Empty).Trim();
        var localModel = string.IsNullOrWhiteSpace(configuredModel) ||
                         string.Equals(configuredModel, "gpt-5.4-mini", StringComparison.OrdinalIgnoreCase)
            ? "local-name-suggester-v1"
            : configuredModel;

        return (
            suggestion,
            localModel,
            "local");
    }

    private static string NormalizeProvider(string provider)
    {
        var normalized = (provider ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return ProviderLocal;
        }

        return normalized switch
        {
            ProviderOpenAi => ProviderOpenAi,
            ProviderCustom => ProviderCustom,
            ProviderLocal => ProviderLocal,
            _ => throw new InvalidOperationException(
                "Unsupported AI provider. Use 'Local', 'OpenAI', or 'Custom'.")
        };
    }

    private static string NormalizeTarget(string target)
    {
        var normalized = (target ?? string.Empty).Trim().ToLowerInvariant();
        if (!AiSuggestionTargets.All.Contains(normalized))
        {
            throw new InvalidOperationException("Unsupported AI suggestion target.");
        }

        return normalized;
    }

    private static string BuildSystemPrompt(string target)
    {
        return target switch
        {
            AiSuggestionTargets.Name =>
                "You suggest retail product names. Return only one concise product name. No punctuation wrappers, no explanation.",
            AiSuggestionTargets.Sku =>
                "You suggest SKU codes. Return only one SKU in uppercase letters, numbers, and hyphens. Max 24 chars. No explanation.",
            AiSuggestionTargets.Barcode =>
                "You suggest barcodes. Return only one EAN-13 code (13 digits). No spaces, no explanation.",
            AiSuggestionTargets.ImageUrl =>
                "You suggest image URLs. Return only one HTTPS image URL appropriate for product preview. No explanation.",
            AiSuggestionTargets.Category =>
                "You classify products into categories. Return only one category name from the provided options exactly. No explanation.",
            _ =>
                "Return only the requested suggestion text."
        };
    }

    private static string BuildUserPrompt(string target, ProductSuggestionRequest request)
    {
        var payload = JsonSerializer.Serialize(new
        {
            target,
            current_values = new
            {
                name = request.Name,
                sku = request.Sku,
                barcode = request.Barcode,
                image_url = request.ImageUrl,
                image_hint = request.ImageHint,
                category_name = request.CategoryName,
                unit_price = request.UnitPrice,
                cost_price = request.CostPrice
            },
            available_category_options = GetCleanCategoryOptions(request.CategoryOptions ?? [])
        }, JsonOptions);

        return $"Generate one best suggestion for this product context:\n{payload}";
    }

    private static string[] GetCleanCategoryOptions(IReadOnlyCollection<string> categoryOptions)
    {
        return categoryOptions
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(20)
            .ToArray();
    }

    private static string? ExtractOutputTextFromRawResponse(string rawResponse)
    {
        try
        {
            using var document = JsonDocument.Parse(rawResponse);
            return ExtractOutputTextFromRoot(document.RootElement);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? ExtractCustomSuggestion(string rawResponse, string configuredSuggestionField)
    {
        if (string.IsNullOrWhiteSpace(rawResponse))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(rawResponse);
            var root = document.RootElement;

            if (root.ValueKind == JsonValueKind.String)
            {
                return root.GetString()?.Trim();
            }

            if (TryReadJsonFieldAsString(root, configuredSuggestionField, out var configuredSuggestion))
            {
                return configuredSuggestion;
            }

            var fallbackFields = new[] { "suggestion", "text", "output_text", "result", "response" };
            foreach (var field in fallbackFields)
            {
                if (TryReadJsonFieldAsString(root, field, out var value))
                {
                    return value;
                }
            }

            var openAiStyle = ExtractOutputTextFromRoot(root);
            if (!string.IsNullOrWhiteSpace(openAiStyle))
            {
                return openAiStyle;
            }

            return null;
        }
        catch (JsonException)
        {
            return rawResponse.Trim();
        }
    }

    private static string ExtractCustomModel(string rawResponse, string fallbackModel)
    {
        try
        {
            using var document = JsonDocument.Parse(rawResponse);
            if (TryReadJsonFieldAsString(document.RootElement, "model", out var model))
            {
                return model;
            }
        }
        catch (JsonException)
        {
            // Ignore parse errors and use fallback model.
        }

        return fallbackModel;
    }

    private static bool TryReadJsonFieldAsString(JsonElement root, string path, out string value)
    {
        value = string.Empty;

        var normalizedPath = (path ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedPath))
        {
            return false;
        }

        var current = root;
        var segments = normalizedPath.Split(
            '.',
            StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

        foreach (var segment in segments)
        {
            if (current.ValueKind == JsonValueKind.Object)
            {
                if (!current.TryGetProperty(segment, out current))
                {
                    return false;
                }

                continue;
            }

            if (current.ValueKind == JsonValueKind.Array && int.TryParse(segment, out var index))
            {
                if (index < 0 || index >= current.GetArrayLength())
                {
                    return false;
                }

                current = current[index];
                continue;
            }

            return false;
        }

        if (current.ValueKind == JsonValueKind.String)
        {
            value = current.GetString()?.Trim() ?? string.Empty;
            return !string.IsNullOrWhiteSpace(value);
        }

        var serializedValue = current.ToString()?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(serializedValue))
        {
            return false;
        }

        value = serializedValue;
        return true;
    }

    private static string? ExtractOutputTextFromRoot(JsonElement root)
    {
        if (root.TryGetProperty("output_text", out var outputTextElement) &&
            outputTextElement.ValueKind == JsonValueKind.String)
        {
            return outputTextElement.GetString()?.Trim();
        }

        if (root.TryGetProperty("output", out var outputElement) &&
            outputElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var outputItem in outputElement.EnumerateArray())
            {
                if (!outputItem.TryGetProperty("content", out var contentElement) ||
                    contentElement.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                foreach (var contentItem in contentElement.EnumerateArray())
                {
                    if (contentItem.TryGetProperty("text", out var textElement) &&
                        textElement.ValueKind == JsonValueKind.String)
                    {
                        return textElement.GetString()?.Trim();
                    }
                }
            }
        }

        return null;
    }

    private static string NormalizeSuggestion(string target, string value, IReadOnlyCollection<string> categoryOptions)
    {
        var suggestion = value
            .Trim()
            .Trim('"')
            .Trim('`')
            .Trim();

        if (target == AiSuggestionTargets.Name)
        {
            return suggestion.Length > 80 ? suggestion[..80].Trim() : suggestion;
        }

        if (target == AiSuggestionTargets.Sku)
        {
            var normalizedSku = new string(
                suggestion
                    .ToUpperInvariant()
                    .Where(ch => char.IsLetterOrDigit(ch) || ch == '-')
                    .ToArray());
            return normalizedSku.Length > 24 ? normalizedSku[..24] : normalizedSku;
        }

        if (target == AiSuggestionTargets.Barcode)
        {
            var digits = new string(suggestion.Where(char.IsDigit).ToArray());
            if (digits.Length >= 13)
            {
                return digits[..13];
            }

            return BuildEan13(digits);
        }

        if (target == AiSuggestionTargets.ImageUrl)
        {
            if (Uri.TryCreate(suggestion, UriKind.Absolute, out var uri) &&
                (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp))
            {
                return suggestion;
            }

            var seed = "product";
            return $"https://picsum.photos/seed/{seed}/640/640";
        }

        if (target == AiSuggestionTargets.Category)
        {
            var cleanOptions = categoryOptions
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Select(x => x.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            if (cleanOptions.Length == 0)
            {
                return string.Empty;
            }

            if (string.IsNullOrWhiteSpace(suggestion))
            {
                return string.Empty;
            }

            var exact = cleanOptions.FirstOrDefault(
                option => string.Equals(option, suggestion, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(exact))
            {
                return exact;
            }

            var partial = cleanOptions.FirstOrDefault(
                option => option.Contains(suggestion, StringComparison.OrdinalIgnoreCase) ||
                          suggestion.Contains(option, StringComparison.OrdinalIgnoreCase));

            return partial ?? string.Empty;
        }

        return suggestion;
    }

    private static string BuildEan13(string seedDigits)
    {
        var baseDigits = (seedDigits ?? string.Empty).Trim();
        var normalized = new string(baseDigits.Where(char.IsDigit).ToArray());
        var firstTwelve = normalized.Length >= 12
            ? normalized[..12]
            : normalized.PadLeft(12, '0');

        var checksum = 0;
        for (var i = 0; i < firstTwelve.Length; i++)
        {
            var digit = firstTwelve[i] - '0';
            checksum += i % 2 == 0 ? digit : digit * 3;
        }

        var checkDigit = (10 - (checksum % 10)) % 10;
        return $"{firstTwelve}{checkDigit}";
    }

    private static string BuildBaseName(ProductSuggestionRequest request)
    {
        var rawName = (request.Name ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(rawName))
        {
            return CollapseWhitespace(rawName);
        }

        var imageHint = BuildNameFromImageHints(request);
        if (!string.IsNullOrWhiteSpace(imageHint))
        {
            return imageHint;
        }

        var skuHint = (request.Sku ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(skuHint))
        {
            return CollapseWhitespace(skuHint.Replace('-', ' '));
        }

        var barcodeHint = (request.Barcode ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(barcodeHint))
        {
            return $"Item {barcodeHint}";
        }

        return "New Item";
    }

    private static string BuildNameFromImageHints(ProductSuggestionRequest request)
    {
        var tokens = new List<string>();
        tokens.AddRange(Tokenize(request.ImageHint ?? string.Empty));
        tokens.AddRange(ExtractImageUrlTokens(request.ImageUrl));

        var filtered = tokens
            .Where(token => !GenericImageTokens.Contains(token))
            .Where(token => token.Any(char.IsLetter))
            .Where(token => !IsCameraLikeToken(token))
            .Where(token => !IsHashLikeToken(token))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(4)
            .ToArray();

        if (filtered.Length == 0)
        {
            return string.Empty;
        }

        var titledTokens = filtered.Select(ToDisplayToken);
        return string.Join(' ', titledTokens);
    }

    private static IEnumerable<string> ExtractImageUrlTokens(string? imageUrl)
    {
        if (string.IsNullOrWhiteSpace(imageUrl))
        {
            return [];
        }

        var raw = imageUrl.Trim();
        if (raw.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            return [];
        }

        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri))
        {
            return Tokenize(raw).ToArray();
        }

        var queryDecoded = Uri.UnescapeDataString(uri.Query.Replace('=', ' ').Replace('&', ' '));
        var pathDecoded = Uri.UnescapeDataString(uri.AbsolutePath);
        var combined = $"{uri.Host} {pathDecoded} {queryDecoded}";
        return Tokenize(combined).ToArray();
    }

    private static string ToDisplayToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return string.Empty;
        }

        if (token.All(char.IsDigit))
        {
            return token;
        }

        if (token.Any(char.IsDigit) && token.Length <= 4)
        {
            return token.ToUpperInvariant();
        }

        return char.ToUpperInvariant(token[0]) + token[1..];
    }

    private static string SuggestName(string baseName)
    {
        var clean = CollapseWhitespace(baseName);
        if (string.IsNullOrWhiteSpace(clean))
        {
            return "New Item";
        }

        if (clean.Length > 80)
        {
            clean = clean[..80].Trim();
        }

        return clean;
    }

    private static string BuildLocalSku(string baseName)
    {
        var tokens = Tokenize(baseName).ToArray();
        if (tokens.Length == 0)
        {
            return "ITEM-001";
        }

        var skuTokens = new List<string>();
        foreach (var token in tokens)
        {
            if (skuTokens.Count >= 3)
            {
                break;
            }

            var upper = token.ToUpperInvariant();
            if (upper.Length > 8)
            {
                upper = upper[..8];
            }

            skuTokens.Add(upper);
        }

        if (skuTokens.Count == 0)
        {
            return "ITEM-001";
        }

        var combined = string.Join('-', skuTokens);
        return combined.Length > 24 ? combined[..24].TrimEnd('-') : combined;
    }

    private static string BuildLocalBarcode(string baseName)
    {
        var normalized = new string(
            baseName
                .Trim()
                .ToUpperInvariant()
                .Where(char.IsLetterOrDigit)
                .ToArray());

        if (string.IsNullOrWhiteSpace(normalized))
        {
            normalized = "NEWITEM";
        }

        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(normalized));

        var digits = new StringBuilder(12);
        foreach (var b in hash)
        {
            digits.Append((b % 10).ToString());
            if (digits.Length >= 12)
            {
                break;
            }
        }

        while (digits.Length < 12)
        {
            digits.Append('0');
        }

        return BuildEan13(digits.ToString());
    }

    private static string BuildLocalImageUrl(string baseName)
    {
        var seed = Slugify(baseName);
        if (string.IsNullOrWhiteSpace(seed))
        {
            seed = "product";
        }

        return $"https://picsum.photos/seed/{Uri.EscapeDataString(seed)}/640/640";
    }

    private static string SuggestCategoryFromName(string baseName, IReadOnlyCollection<string> categoryOptions)
    {
        var cleanOptions = categoryOptions
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (cleanOptions.Length == 0)
        {
            return string.Empty;
        }

        var nameTokens = Tokenize(baseName).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (nameTokens.Count == 0)
        {
            return string.Empty;
        }

        var best = cleanOptions
            .Select(option =>
            {
                var optionTokens = Tokenize(option).ToArray();
                var score = 0;

                if (baseName.Contains(option, StringComparison.OrdinalIgnoreCase))
                {
                    score += 8;
                }

                foreach (var token in optionTokens)
                {
                    if (nameTokens.Contains(token))
                    {
                        score += 4;
                    }
                }

                score += ScoreCategoryKeywords(option, nameTokens);
                return new { option, score };
            })
            .OrderByDescending(item => item.score)
            .First();

        return best.score > 0 ? best.option : string.Empty;
    }

    private static int ScoreCategoryKeywords(string option, IReadOnlySet<string> nameTokens)
    {
        var optionLower = option.ToLowerInvariant();

        if (ContainsAny(optionLower, "beverage", "drink", "tea", "coffee", "juice") &&
            ContainsAny(
                nameTokens,
                "tea",
                "coffee",
                "juice",
                "drink",
                "water",
                "cola",
                "milk",
                "pepsi",
                "coke",
                "cocacola",
                "sprite",
                "fanta",
                "sevenup",
                "7up"))
        {
            return 6;
        }

        if (ContainsAny(optionLower, "grocery", "food", "dry") &&
            ContainsAny(nameTokens, "rice", "sugar", "flour", "dhal", "salt", "biscuit", "noodle"))
        {
            return 6;
        }

        if (ContainsAny(optionLower, "personal", "care", "beauty", "hygiene") &&
            ContainsAny(nameTokens, "soap", "shampoo", "toothpaste", "lotion", "cream"))
        {
            return 6;
        }

        if (ContainsAny(optionLower, "stationery", "book", "office") &&
            ContainsAny(nameTokens, "book", "pen", "pencil", "notebook", "paper"))
        {
            return 6;
        }

        if (ContainsAny(optionLower, "clean", "household", "home") &&
            ContainsAny(nameTokens, "detergent", "cleaner", "bleach", "soap", "dishwash"))
        {
            return 6;
        }

        return 0;
    }

    private static bool ContainsAny(string value, params string[] candidates)
    {
        return candidates.Any(candidate => value.Contains(candidate, StringComparison.OrdinalIgnoreCase));
    }

    private static bool ContainsAny(IReadOnlySet<string> values, params string[] candidates)
    {
        return candidates.Any(candidate => values.Contains(candidate));
    }

    private static bool IsHashLikeToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return true;
        }

        if (token.Length > 24)
        {
            return true;
        }

        if (Regex.IsMatch(token, @"^\d+x\d+(q\d+)?$", RegexOptions.IgnoreCase))
        {
            return true;
        }

        var digitCount = token.Count(char.IsDigit);
        var letterCount = token.Count(char.IsLetter);

        if (token.Length >= 16 && digitCount >= 4 && letterCount >= 4)
        {
            return true;
        }

        if (token.Length >= 12 && digitCount > letterCount)
        {
            return true;
        }

        return false;
    }

    private static bool IsCameraLikeToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return true;
        }

        return Regex.IsMatch(
            token,
            @"^(pic|img|dsc|pxl|photo)\d+$",
            RegexOptions.IgnoreCase);
    }

    private static IEnumerable<string> Tokenize(string value)
    {
        return (value ?? string.Empty)
            .ToLowerInvariant()
            .Split(new[] { ' ', '-', '_', '/', '\\', '.', ',', '(', ')', '[', ']', '{', '}', '+' },
                StringSplitOptions.RemoveEmptyEntries)
            .Select(token => new string(token.Where(char.IsLetterOrDigit).ToArray()))
            .Where(token => token.Length > 1);
    }

    private static string CollapseWhitespace(string value)
    {
        var parts = (value ?? string.Empty)
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        return string.Join(' ', parts);
    }

    private static string Slugify(string value)
    {
        var token = new string(
            (value ?? string.Empty)
                .Trim()
                .ToLowerInvariant()
                .Select(ch => char.IsLetterOrDigit(ch) ? ch : '-')
                .ToArray());

        while (token.Contains("--", StringComparison.Ordinal))
        {
            token = token.Replace("--", "-", StringComparison.Ordinal);
        }

        return token.Trim('-');
    }
}
