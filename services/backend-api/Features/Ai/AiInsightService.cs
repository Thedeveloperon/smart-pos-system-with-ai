using System.Diagnostics;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Ai;

public sealed class AiInsightService(
    HttpClient httpClient,
    SmartPosDbContext dbContext,
    AiCreditBillingService creditBillingService,
    AiPrivacyGovernanceService aiPrivacyGovernanceService,
    IConfiguration configuration,
    IOptions<AiInsightOptions> options,
    ILogger<AiInsightService> logger)
{
    private const string ProviderOpenAi = "openai";
    private const string ProviderLocal = "local";
    private const string UsageTypeQuickInsights = "quick_insights";
    private const string UsageTypeAdvancedAnalysis = "advanced_analysis";
    private const string UsageTypeSmartReports = "smart_reports";
    private const string OutputLanguageEnglish = "english";
    private const string OutputLanguageSinhala = "sinhala";
    private const string OutputLanguageTamil = "tamil";
    private const int GroundingContextReserveTokenBuffer = 300;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly JsonSerializerOptions CaseInsensitiveJsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };
    private static readonly object StructuredInsightJsonSchema = new
    {
        type = "object",
        additionalProperties = false,
        required = new[]
        {
            "summary",
            "recommended_actions",
            "risks",
            "missing_data",
            "insufficient_data",
            "confidence"
        },
        properties = new
        {
            summary = new
            {
                type = "string",
                minLength = 1,
                maxLength = 380
            },
            recommended_actions = new
            {
                type = "array",
                minItems = 1,
                maxItems = 5,
                items = new
                {
                    type = "string",
                    minLength = 1,
                    maxLength = 220
                }
            },
            risks = new
            {
                type = "array",
                minItems = 0,
                maxItems = 5,
                items = new
                {
                    type = "string",
                    minLength = 1,
                    maxLength = 220
                }
            },
            missing_data = new
            {
                type = "array",
                minItems = 0,
                maxItems = 8,
                items = new
                {
                    type = "string",
                    minLength = 1,
                    maxLength = 220
                }
            },
            insufficient_data = new
            {
                type = "boolean"
            },
            confidence = new
            {
                type = "string",
                @enum = new[] { "low", "medium", "high" }
            }
        }
    };

    public async Task<AiInsightEstimateResponse> EstimateInsightAsync(
        Guid userId,
        string prompt,
        string? usageType,
        CancellationToken cancellationToken)
    {
        var aiOptions = options.Value;
        if (!aiOptions.Enabled)
        {
            throw new InvalidOperationException("AI insights are disabled.");
        }

        var normalizedPrompt = NormalizePrompt(prompt);
        await ValidatePromptGuardrailsAsync(
            normalizedPrompt,
            aiOptions,
            runModeration: false,
            cancellationToken);

        var usagePolicy = ResolveUsagePolicy(usageType, aiOptions);
        var estimate = BuildInsightEstimate(normalizedPrompt, aiOptions, usagePolicy);
        var wallet = await creditBillingService.GetWalletAsync(userId, cancellationToken);
        var dailyRemainingCredits = await GetDailyRemainingCreditsAsync(userId, aiOptions, cancellationToken);
        var canAffordByBalance = wallet.AvailableCredits >= estimate.ReserveCredits;
        var canAffordByDailyLimit = dailyRemainingCredits < 0m || dailyRemainingCredits >= estimate.EstimatedChargeCredits;

        return new AiInsightEstimateResponse
        {
            EstimatedInputTokens = estimate.EstimatedInputTokens,
            EstimatedOutputTokens = estimate.EstimatedOutputTokens,
            EstimatedChargeCredits = estimate.EstimatedChargeCredits,
            ReserveCredits = estimate.ReserveCredits,
            AvailableCredits = wallet.AvailableCredits,
            DailyRemainingCredits = dailyRemainingCredits,
            CanAfford = canAffordByBalance && canAffordByDailyLimit,
            PricingRulesVersion = ResolvePricingRulesVersion(aiOptions),
            UsageType = usagePolicy.ApiValue
        };
    }

    public async Task<AiInsightHistoryResponse> GetHistoryAsync(
        Guid userId,
        int take,
        CancellationToken cancellationToken)
    {
        var normalizedTake = Math.Clamp(take, 1, 100);
        var pricingRulesVersion = ResolvePricingRulesVersion(options.Value);
        List<AiInsightRequest> requests;
        if (dbContext.Database.IsSqlite())
        {
            requests = (await dbContext.AiInsightRequests
                    .AsNoTracking()
                    .Where(x => x.UserId == userId)
                    .ToListAsync(cancellationToken))
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToList();
        }
        else
        {
            requests = await dbContext.AiInsightRequests
                .AsNoTracking()
                .Where(x => x.UserId == userId)
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(normalizedTake)
                .ToListAsync(cancellationToken);
        }

        return new AiInsightHistoryResponse
        {
            Items = requests
                .Select(x =>
                {
                    var refundedCredits = x.ReservedCredits > x.ChargedCredits
                        ? RoundCredits(x.ReservedCredits - x.ChargedCredits)
                        : 0m;

                    return new AiInsightHistoryItemResponse
                    {
                        RequestId = x.Id,
                        Status = MapRequestStatus(x.Status),
                        Provider = x.Provider,
                        Model = x.Model,
                        PricingRulesVersion = pricingRulesVersion,
                        InputTokens = x.InputTokens,
                        OutputTokens = x.OutputTokens,
                        ReservedCredits = x.ReservedCredits,
                        ChargedCredits = x.ChargedCredits,
                        RefundedCredits = refundedCredits,
                        UsageType = MapUsageType(x.UsageType),
                        CreatedAt = x.CreatedAtUtc,
                        CompletedAt = x.CompletedAtUtc,
                        ErrorMessage = x.ErrorMessage
                    };
                })
                .ToList()
        };
    }

    public async Task<AiInsightResponse> GenerateInsightAsync(
        Guid userId,
        string prompt,
        string idempotencyKey,
        string? usageType,
        CancellationToken cancellationToken,
        string? preferredOutputLanguageOverride = null)
    {
        var aiOptions = options.Value;
        if (!aiOptions.Enabled)
        {
            throw new InvalidOperationException("AI insights are disabled.");
        }

        var normalizedPrompt = NormalizePrompt(prompt);
        var sanitizedPromptForProvider = aiPrivacyGovernanceService.RedactForProvider(normalizedPrompt);
        var normalizedIdempotencyKey = NormalizeIdempotencyKey(idempotencyKey);

        var existingRequest = await dbContext.AiInsightRequests
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.UserId == userId &&
                     x.IdempotencyKey == normalizedIdempotencyKey,
                cancellationToken);

        if (existingRequest is not null)
        {
            return await BuildReplayResponseAsync(existingRequest, userId, cancellationToken);
        }

        await ValidatePromptGuardrailsAsync(
            normalizedPrompt,
            aiOptions,
            runModeration: true,
            cancellationToken);
        var usagePolicy = ResolveUsagePolicy(usageType, aiOptions);
        var estimate = BuildInsightEstimate(normalizedPrompt, aiOptions, usagePolicy);
        await EnforceUsageLimitsAsync(
            userId,
            estimate.EstimatedChargeCredits,
            aiOptions,
            cancellationToken);

        var provider = NormalizeProvider(aiOptions.Provider);
        var model = ResolveModelForUsageType(aiOptions, provider, usagePolicy);
        var requestRecord = new AiInsightRequest
        {
            UserId = userId,
            IdempotencyKey = normalizedIdempotencyKey,
            Status = AiInsightRequestStatus.Pending,
            Provider = provider,
            Model = model,
            UsageType = usagePolicy.UsageType,
            PromptHash = ComputePromptHash(sanitizedPromptForProvider),
            PromptCharCount = sanitizedPromptForProvider.Length,
            ReservedCredits = 0m,
            ChargedCredits = 0m,
            InputTokens = 0,
            OutputTokens = 0,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
            User = await ResolveUserAsync(userId, cancellationToken)
        };

        dbContext.AiInsightRequests.Add(requestRecord);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
        {
            for (var attempt = 0; attempt < 4; attempt++)
            {
                var conflicted = await dbContext.AiInsightRequests
                    .AsNoTracking()
                    .FirstOrDefaultAsync(
                        x => x.UserId == userId &&
                             x.IdempotencyKey == normalizedIdempotencyKey,
                        cancellationToken);
                if (conflicted is not null)
                {
                    return await BuildReplayResponseAsync(conflicted, userId, cancellationToken);
                }

                await Task.Delay(TimeSpan.FromMilliseconds(25 * (attempt + 1)), cancellationToken);
            }

            logger.LogWarning(
                exception,
                "AI insight request persistence failed without a recoverable replay. UserId={UserId}, IdempotencyKey={IdempotencyKey}.",
                userId,
                normalizedIdempotencyKey);
            throw new InvalidOperationException(
                "This request is still processing. Please retry shortly.",
                exception);
        }

        try
        {
            var reservation = await creditBillingService.ReserveCreditsAsync(
                userId,
                requestRecord.Id,
                estimate.ReserveCredits,
                cancellationToken);

            requestRecord.ReservedCredits = reservation.ReservedCredits;
            requestRecord.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);

            var posFacts = await BuildPosInsightFactsAsync(requestRecord.User, cancellationToken);
            var preferredOutputLanguage = ResolveOutputLanguageOverride(preferredOutputLanguageOverride)
                                          ?? await ResolvePreferredOutputLanguageAsync(cancellationToken);
            var preferredOutputLanguageLabel = MapOutputLanguageLabel(preferredOutputLanguage);
            var groundedPromptPayload = aiPrivacyGovernanceService.FilterProviderPayload(
                new Dictionary<string, string?>
                {
                    ["customer_question"] = sanitizedPromptForProvider,
                    ["verified_pos_facts_json"] = posFacts.ContextJson,
                    ["rules"] = "Use only verified facts from the JSON block. Do not invent values.",
                    ["output_language"] = preferredOutputLanguageLabel
                });
            var groundedPrompt = BuildGroundedPrompt(groundedPromptPayload);
            var providerStopwatch = Stopwatch.StartNew();

            AiProviderResult providerResult;
            var useLocalInsufficientDataFallback =
                posFacts.IsInsufficientData &&
                string.Equals(provider, ProviderLocal, StringComparison.OrdinalIgnoreCase);

            if (useLocalInsufficientDataFallback)
            {
                providerResult = BuildInsufficientDataFallback(
                    provider,
                    model,
                    sanitizedPromptForProvider,
                    groundedPrompt,
                    posFacts,
                    preferredOutputLanguage);
            }
            else
            {
                providerResult = await GenerateWithProviderAsync(
                    provider,
                    model,
                    groundedPrompt,
                    sanitizedPromptForProvider,
                    posFacts,
                    aiOptions,
                    usagePolicy.MaxOutputTokens,
                    preferredOutputLanguage,
                    preferredOutputLanguageLabel,
                    cancellationToken);
            }

            providerStopwatch.Stop();

            var normalizedInsight = NormalizeInsightText(
                providerResult.Insight,
                posFacts,
                sanitizedPromptForProvider,
                preferredOutputLanguage);
            await ValidateOutputGuardrailsAsync(normalizedInsight, aiOptions, cancellationToken);
            var persistedInsight = aiPrivacyGovernanceService.RedactForStorage(normalizedInsight);

            var chargedCredits = CalculateCredits(
                providerResult.InputTokens,
                providerResult.OutputTokens,
                aiOptions,
                usagePolicy.CreditMultiplier);

            var settled = await creditBillingService.SettleReservationAsync(
                userId,
                requestRecord.Id,
                requestRecord.ReservedCredits,
                chargedCredits,
                cancellationToken);

            requestRecord.Provider = providerResult.Provider;
            requestRecord.Model = providerResult.Model;
            requestRecord.Status = AiInsightRequestStatus.Succeeded;
            requestRecord.ChargedCredits = settled.ChargedCredits;
            requestRecord.InputTokens = providerResult.InputTokens;
            requestRecord.OutputTokens = providerResult.OutputTokens;
            requestRecord.ResponseText = persistedInsight;
            requestRecord.ErrorCode = null;
            requestRecord.ErrorMessage = null;
            requestRecord.UpdatedAtUtc = DateTimeOffset.UtcNow;
            requestRecord.CompletedAtUtc = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "AI insight request {RequestId} completed. Provider={Provider} Model={Model} LatencyMs={LatencyMs} InputTokens={InputTokens} OutputTokens={OutputTokens} ChargedCredits={ChargedCredits} RemainingCredits={RemainingCredits} InsufficientData={InsufficientData}",
                requestRecord.Id,
                requestRecord.Provider,
                requestRecord.Model,
                providerStopwatch.ElapsedMilliseconds,
                providerResult.InputTokens,
                providerResult.OutputTokens,
                settled.ChargedCredits,
                settled.RemainingCredits,
                posFacts.IsInsufficientData);

            return new AiInsightResponse
            {
                RequestId = requestRecord.Id,
                Status = "succeeded",
                Provider = requestRecord.Provider,
                Model = requestRecord.Model,
                PricingRulesVersion = ResolvePricingRulesVersion(aiOptions),
                Insight = persistedInsight,
                InputTokens = providerResult.InputTokens,
                OutputTokens = providerResult.OutputTokens,
                ReservedCredits = requestRecord.ReservedCredits,
                ChargedCredits = settled.ChargedCredits,
                RefundedCredits = settled.RefundedCredits,
                RemainingCredits = settled.RemainingCredits,
                UsageType = usagePolicy.ApiValue,
                CreatedAt = requestRecord.CreatedAtUtc,
                CompletedAt = requestRecord.CompletedAtUtc ?? DateTimeOffset.UtcNow
            };
        }
        catch (InvalidOperationException exception)
        {
            await FailAndRefundAsync(
                requestRecord,
                userId,
                "invalid_operation",
                aiPrivacyGovernanceService.RedactForStorage(NormalizeErrorMessageForPersistence(exception.Message)),
                cancellationToken);
            throw;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "AI insight request {RequestId} failed unexpectedly.", requestRecord.Id);
            await FailAndRefundAsync(
                requestRecord,
                userId,
                "unexpected_error",
                "AI insight request failed unexpectedly.",
                cancellationToken);
            throw new InvalidOperationException("AI insight request failed. Reserved credits were refunded.");
        }
    }

    public async Task<AiInsightResponse> GenerateInsightStreamAsync(
        Guid userId,
        string prompt,
        string idempotencyKey,
        string? usageType,
        Func<string, CancellationToken, Task> onDelta,
        CancellationToken cancellationToken,
        string? preferredOutputLanguageOverride = null)
    {
        var aiOptions = options.Value;
        if (!aiOptions.Enabled)
        {
            throw new InvalidOperationException("AI insights are disabled.");
        }

        ArgumentNullException.ThrowIfNull(onDelta);

        var normalizedPrompt = NormalizePrompt(prompt);
        var sanitizedPromptForProvider = aiPrivacyGovernanceService.RedactForProvider(normalizedPrompt);
        var normalizedIdempotencyKey = NormalizeIdempotencyKey(idempotencyKey);
        var provider = NormalizeProvider(aiOptions.Provider);

        if (!string.Equals(provider, ProviderOpenAi, StringComparison.OrdinalIgnoreCase))
        {
            var fallbackResponse = await GenerateInsightAsync(
                userId,
                prompt,
                idempotencyKey,
                usageType,
                cancellationToken,
                preferredOutputLanguageOverride);
            await StreamTextInChunksAsync(fallbackResponse.Insight, onDelta, cancellationToken);
            return fallbackResponse;
        }

        var existingRequest = await dbContext.AiInsightRequests
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.UserId == userId &&
                     x.IdempotencyKey == normalizedIdempotencyKey,
                cancellationToken);

        if (existingRequest is not null)
        {
            var replay = await BuildReplayResponseAsync(existingRequest, userId, cancellationToken);
            await StreamTextInChunksAsync(replay.Insight, onDelta, cancellationToken);
            return replay;
        }

        await ValidatePromptGuardrailsAsync(
            normalizedPrompt,
            aiOptions,
            runModeration: true,
            cancellationToken);
        var usagePolicy = ResolveUsagePolicy(usageType, aiOptions);
        var estimate = BuildInsightEstimate(normalizedPrompt, aiOptions, usagePolicy);
        await EnforceUsageLimitsAsync(
            userId,
            estimate.EstimatedChargeCredits,
            aiOptions,
            cancellationToken);

        var model = ResolveModelForUsageType(aiOptions, provider, usagePolicy);
        var requestRecord = new AiInsightRequest
        {
            UserId = userId,
            IdempotencyKey = normalizedIdempotencyKey,
            Status = AiInsightRequestStatus.Pending,
            Provider = provider,
            Model = model,
            UsageType = usagePolicy.UsageType,
            PromptHash = ComputePromptHash(sanitizedPromptForProvider),
            PromptCharCount = sanitizedPromptForProvider.Length,
            ReservedCredits = 0m,
            ChargedCredits = 0m,
            InputTokens = 0,
            OutputTokens = 0,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow,
            User = await ResolveUserAsync(userId, cancellationToken)
        };

        dbContext.AiInsightRequests.Add(requestRecord);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
        {
            for (var attempt = 0; attempt < 4; attempt++)
            {
                var conflicted = await dbContext.AiInsightRequests
                    .AsNoTracking()
                    .FirstOrDefaultAsync(
                        x => x.UserId == userId &&
                             x.IdempotencyKey == normalizedIdempotencyKey,
                        cancellationToken);
                if (conflicted is not null)
                {
                    var replay = await BuildReplayResponseAsync(conflicted, userId, cancellationToken);
                    await StreamTextInChunksAsync(replay.Insight, onDelta, cancellationToken);
                    return replay;
                }

                await Task.Delay(TimeSpan.FromMilliseconds(25 * (attempt + 1)), cancellationToken);
            }

            logger.LogWarning(
                exception,
                "AI insight stream persistence failed without a recoverable replay. UserId={UserId}, IdempotencyKey={IdempotencyKey}.",
                userId,
                normalizedIdempotencyKey);
            throw new InvalidOperationException(
                "This request is still processing. Please retry shortly.",
                exception);
        }

        try
        {
            var reservation = await creditBillingService.ReserveCreditsAsync(
                userId,
                requestRecord.Id,
                estimate.ReserveCredits,
                cancellationToken);

            requestRecord.ReservedCredits = reservation.ReservedCredits;
            requestRecord.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);

            var posFacts = await BuildPosInsightFactsAsync(requestRecord.User, cancellationToken);
            var preferredOutputLanguage = ResolveOutputLanguageOverride(preferredOutputLanguageOverride)
                                          ?? await ResolvePreferredOutputLanguageAsync(cancellationToken);
            var preferredOutputLanguageLabel = MapOutputLanguageLabel(preferredOutputLanguage);
            var groundedPromptPayload = aiPrivacyGovernanceService.FilterProviderPayload(
                new Dictionary<string, string?>
                {
                    ["customer_question"] = sanitizedPromptForProvider,
                    ["verified_pos_facts_json"] = posFacts.ContextJson,
                    ["rules"] = "Use only verified facts from the JSON block. Do not invent values.",
                    ["output_language"] = preferredOutputLanguageLabel
                });
            var groundedPrompt = BuildGroundedPrompt(groundedPromptPayload);
            var providerStopwatch = Stopwatch.StartNew();

            var providerResult = await GenerateWithOpenAiStreamAsync(
                model,
                groundedPrompt,
                aiOptions,
                usagePolicy.MaxOutputTokens,
                preferredOutputLanguageLabel,
                onDelta,
                cancellationToken);

            providerStopwatch.Stop();

            var normalizedInsight = NormalizeInsightText(
                providerResult.Insight,
                posFacts,
                sanitizedPromptForProvider,
                preferredOutputLanguage);
            await ValidateOutputGuardrailsAsync(normalizedInsight, aiOptions, cancellationToken);
            var persistedInsight = aiPrivacyGovernanceService.RedactForStorage(normalizedInsight);

            var chargedCredits = CalculateCredits(
                providerResult.InputTokens,
                providerResult.OutputTokens,
                aiOptions,
                usagePolicy.CreditMultiplier);

            var settled = await creditBillingService.SettleReservationAsync(
                userId,
                requestRecord.Id,
                requestRecord.ReservedCredits,
                chargedCredits,
                cancellationToken);

            requestRecord.Provider = providerResult.Provider;
            requestRecord.Model = providerResult.Model;
            requestRecord.Status = AiInsightRequestStatus.Succeeded;
            requestRecord.ChargedCredits = settled.ChargedCredits;
            requestRecord.InputTokens = providerResult.InputTokens;
            requestRecord.OutputTokens = providerResult.OutputTokens;
            requestRecord.ResponseText = persistedInsight;
            requestRecord.ErrorCode = null;
            requestRecord.ErrorMessage = null;
            requestRecord.UpdatedAtUtc = DateTimeOffset.UtcNow;
            requestRecord.CompletedAtUtc = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "AI insight stream request {RequestId} completed. Provider={Provider} Model={Model} LatencyMs={LatencyMs} InputTokens={InputTokens} OutputTokens={OutputTokens} ChargedCredits={ChargedCredits} RemainingCredits={RemainingCredits}",
                requestRecord.Id,
                requestRecord.Provider,
                requestRecord.Model,
                providerStopwatch.ElapsedMilliseconds,
                providerResult.InputTokens,
                providerResult.OutputTokens,
                settled.ChargedCredits,
                settled.RemainingCredits);

            return new AiInsightResponse
            {
                RequestId = requestRecord.Id,
                Status = "succeeded",
                Provider = requestRecord.Provider,
                Model = requestRecord.Model,
                PricingRulesVersion = ResolvePricingRulesVersion(aiOptions),
                Insight = persistedInsight,
                InputTokens = providerResult.InputTokens,
                OutputTokens = providerResult.OutputTokens,
                ReservedCredits = requestRecord.ReservedCredits,
                ChargedCredits = settled.ChargedCredits,
                RefundedCredits = settled.RefundedCredits,
                RemainingCredits = settled.RemainingCredits,
                UsageType = usagePolicy.ApiValue,
                CreatedAt = requestRecord.CreatedAtUtc,
                CompletedAt = requestRecord.CompletedAtUtc ?? DateTimeOffset.UtcNow
            };
        }
        catch (InvalidOperationException exception)
        {
            await FailAndRefundAsync(
                requestRecord,
                userId,
                "invalid_operation",
                aiPrivacyGovernanceService.RedactForStorage(NormalizeErrorMessageForPersistence(exception.Message)),
                cancellationToken);
            throw;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "AI insight stream request {RequestId} failed unexpectedly.", requestRecord.Id);
            await FailAndRefundAsync(
                requestRecord,
                userId,
                "unexpected_error",
                "AI insight request failed unexpectedly.",
                cancellationToken);
            throw new InvalidOperationException("AI insight request failed. Reserved credits were refunded.");
        }
    }

    private async Task FailAndRefundAsync(
        AiInsightRequest requestRecord,
        Guid userId,
        string errorCode,
        string errorMessage,
        CancellationToken cancellationToken)
    {
        try
        {
            if (requestRecord.ReservedCredits > 0m)
            {
                await creditBillingService.RefundReservationAsync(
                    userId,
                    requestRecord.Id,
                    requestRecord.ReservedCredits,
                    "ai_request_failed_refund",
                    cancellationToken);
            }
        }
        catch (Exception refundException)
        {
            logger.LogError(refundException, "Failed refund for AI request {RequestId}.", requestRecord.Id);
        }

        requestRecord.Status = AiInsightRequestStatus.Failed;
        requestRecord.ErrorCode = errorCode;
        requestRecord.ErrorMessage = errorMessage;
        requestRecord.UpdatedAtUtc = DateTimeOffset.UtcNow;
        requestRecord.CompletedAtUtc = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<AiInsightResponse> BuildReplayResponseAsync(
        AiInsightRequest existingRequest,
        Guid userId,
        CancellationToken cancellationToken)
    {
        if (existingRequest.Status == AiInsightRequestStatus.Pending)
        {
            throw new InvalidOperationException("This request is still processing. Please retry shortly.");
        }

        if (existingRequest.Status == AiInsightRequestStatus.Failed)
        {
            throw new InvalidOperationException(existingRequest.ErrorMessage ?? "The previous request failed.");
        }

        var wallet = await creditBillingService.GetWalletAsync(userId, cancellationToken);
        var refundedCredits = existingRequest.ReservedCredits > existingRequest.ChargedCredits
            ? RoundCredits(existingRequest.ReservedCredits - existingRequest.ChargedCredits)
            : 0m;
        var replayInsight = string.IsNullOrWhiteSpace(existingRequest.ResponseText)
            ? "Insight payload is no longer available due to retention policy."
            : existingRequest.ResponseText;

        return new AiInsightResponse
        {
            RequestId = existingRequest.Id,
            Status = "succeeded",
            Provider = existingRequest.Provider,
            Model = existingRequest.Model,
            PricingRulesVersion = ResolvePricingRulesVersion(options.Value),
            Insight = replayInsight,
            InputTokens = existingRequest.InputTokens,
            OutputTokens = existingRequest.OutputTokens,
            ReservedCredits = existingRequest.ReservedCredits,
            ChargedCredits = existingRequest.ChargedCredits,
            RefundedCredits = refundedCredits,
            RemainingCredits = wallet.AvailableCredits,
            UsageType = MapUsageType(existingRequest.UsageType),
            CreatedAt = existingRequest.CreatedAtUtc,
            CompletedAt = existingRequest.CompletedAtUtc ?? existingRequest.UpdatedAtUtc ?? existingRequest.CreatedAtUtc
        };
    }

    private async Task<AiProviderResult> GenerateWithProviderAsync(
        string provider,
        string model,
        string groundedPrompt,
        string originalPrompt,
        PosInsightFacts posFacts,
        AiInsightOptions aiOptions,
        int maxOutputTokens,
        string outputLanguage,
        string outputLanguageLabel,
        CancellationToken cancellationToken)
    {
        return provider switch
        {
            ProviderOpenAi => await GenerateWithOpenAiAsync(
                model,
                groundedPrompt,
                aiOptions,
                maxOutputTokens,
                outputLanguageLabel,
                cancellationToken),
            ProviderLocal => GenerateWithLocalProvider(model, originalPrompt, posFacts, outputLanguage),
            _ => throw new InvalidOperationException("Unsupported AI provider.")
        };
    }

    private async Task<AiProviderResult> GenerateWithOpenAiAsync(
        string model,
        string groundedPrompt,
        AiInsightOptions aiOptions,
        int maxOutputTokens,
        string outputLanguageLabel,
        CancellationToken cancellationToken)
    {
        var apiBaseUrl = (aiOptions.ApiBaseUrl ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(apiBaseUrl))
        {
            throw new InvalidOperationException("AiInsights:ApiBaseUrl is not configured.");
        }

        var (apiKey, apiKeyEnvironmentVariable) = ResolveOpenAiApiKey(configuration, aiOptions);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                $"OpenAI API key is not configured. Set environment variable '{apiKeyEnvironmentVariable}'.");
        }

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
                                    text = $"You are a retail POS analyst. Use only verified facts provided by the system. Return strictly valid JSON with fields: summary, recommended_actions, risks, missing_data, insufficient_data, confidence. Write all text fields in {outputLanguageLabel}."
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
                                    text = groundedPrompt
                                }
                            }
                        }
                    },
                    text = new
                    {
                        format = new
                        {
                            type = "json_schema",
                            name = "smartpos_insight_payload_v1",
                            schema = StructuredInsightJsonSchema,
                            strict = true
                        }
                    },
                    max_output_tokens = Math.Clamp(maxOutputTokens, 128, 2000)
                }, JsonOptions),
                Encoding.UTF8,
                "application/json")
        };

        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromMilliseconds(Math.Clamp(aiOptions.RequestTimeoutMs, 1000, 60000)));

        using var response = await httpClient.SendAsync(message, timeoutCts.Token);
        var raw = await response.Content.ReadAsStringAsync(timeoutCts.Token);

        if (!response.IsSuccessStatusCode)
        {
            var statusCode = (int)response.StatusCode;
            var errorMessage = aiPrivacyGovernanceService.RedactForStorage(BuildOpenAiFailureMessage(statusCode, raw));
            logger.LogWarning(
                "OpenAI insight request failed with status {StatusCode}. Body preview: {BodyPreview}",
                statusCode,
                aiPrivacyGovernanceService.RedactForLogPreview(raw));
            throw new InvalidOperationException(errorMessage);
        }

        using var document = JsonDocument.Parse(raw);
        var root = document.RootElement;
        var outputText = ExtractOutputTextFromRoot(root);
        if (string.IsNullOrWhiteSpace(outputText))
        {
            throw new InvalidOperationException("AI insight response was empty.");
        }

        var inputTokens = ExtractUsageToken(root, "input_tokens");
        var outputTokens = ExtractUsageToken(root, "output_tokens");

        if (inputTokens <= 0)
        {
            inputTokens = EstimateTokenCount(groundedPrompt);
        }

        if (outputTokens <= 0)
        {
            outputTokens = EstimateTokenCount(outputText);
        }

        var responseModel = root.TryGetProperty("model", out var modelElement) &&
                            modelElement.ValueKind == JsonValueKind.String
            ? modelElement.GetString() ?? model
            : model;

        return new AiProviderResult(
            outputText.Trim(),
            Math.Max(1, inputTokens),
            Math.Max(1, outputTokens),
            ProviderOpenAi,
            responseModel);
    }

    private async Task<AiProviderResult> GenerateWithOpenAiStreamAsync(
        string model,
        string groundedPrompt,
        AiInsightOptions aiOptions,
        int maxOutputTokens,
        string outputLanguageLabel,
        Func<string, CancellationToken, Task> onDelta,
        CancellationToken cancellationToken)
    {
        var apiBaseUrl = (aiOptions.ApiBaseUrl ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(apiBaseUrl))
        {
            throw new InvalidOperationException("AiInsights:ApiBaseUrl is not configured.");
        }

        var (apiKey, apiKeyEnvironmentVariable) = ResolveOpenAiApiKey(configuration, aiOptions);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                $"OpenAI API key is not configured. Set environment variable '{apiKeyEnvironmentVariable}'.");
        }

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
                                    text = $"You are a retail POS analyst. Use only verified facts provided by the system. Write all text in {outputLanguageLabel}. Keep the answer practical, concise, and focused on POS operations."
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
                                    text = groundedPrompt
                                }
                            }
                        }
                    },
                    text = new
                    {
                        format = new
                        {
                            type = "text"
                        }
                    },
                    max_output_tokens = Math.Clamp(maxOutputTokens, 128, 2000),
                    stream = true
                }, JsonOptions),
                Encoding.UTF8,
                "application/json")
        };

        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromMilliseconds(Math.Clamp(aiOptions.RequestTimeoutMs, 1000, 60000)));

        using var response = await httpClient.SendAsync(
            message,
            HttpCompletionOption.ResponseHeadersRead,
            timeoutCts.Token);

        if (!response.IsSuccessStatusCode)
        {
            var rawError = await response.Content.ReadAsStringAsync(timeoutCts.Token);
            var statusCode = (int)response.StatusCode;
            var errorMessage = aiPrivacyGovernanceService.RedactForStorage(BuildOpenAiFailureMessage(statusCode, rawError));
            logger.LogWarning(
                "OpenAI streaming insight request failed with status {StatusCode}. Body preview: {BodyPreview}",
                statusCode,
                aiPrivacyGovernanceService.RedactForLogPreview(rawError));
            throw new InvalidOperationException(errorMessage);
        }

        await using var responseStream = await response.Content.ReadAsStreamAsync(timeoutCts.Token);
        using var reader = new StreamReader(responseStream);

        var streamedText = new StringBuilder();
        string? completedText = null;
        var inputTokens = 0;
        var outputTokens = 0;
        var responseModel = model;
        string? eventName = null;
        var dataBuilder = new StringBuilder();

        async Task ProcessEventAsync(string? currentEventName, string rawData)
        {
            if (string.IsNullOrWhiteSpace(rawData) || string.Equals(rawData, "[DONE]", StringComparison.Ordinal))
            {
                return;
            }

            using var document = JsonDocument.Parse(rawData);
            var root = document.RootElement;
            var effectiveEvent = !string.IsNullOrWhiteSpace(currentEventName)
                ? currentEventName
                : root.TryGetProperty("type", out var typeElement) && typeElement.ValueKind == JsonValueKind.String
                    ? typeElement.GetString()
                    : null;

            if (string.Equals(effectiveEvent, "response.output_text.delta", StringComparison.Ordinal))
            {
                if (root.TryGetProperty("delta", out var deltaElement) &&
                    deltaElement.ValueKind == JsonValueKind.String)
                {
                    var delta = deltaElement.GetString() ?? string.Empty;
                    if (!string.IsNullOrEmpty(delta))
                    {
                        streamedText.Append(delta);
                        await onDelta(delta, cancellationToken);
                    }
                }

                return;
            }

            if (string.Equals(effectiveEvent, "response.output_text.done", StringComparison.Ordinal))
            {
                if (root.TryGetProperty("text", out var textElement) &&
                    textElement.ValueKind == JsonValueKind.String)
                {
                    completedText = textElement.GetString();
                }

                return;
            }

            if (string.Equals(effectiveEvent, "response.completed", StringComparison.Ordinal))
            {
                if (root.TryGetProperty("response", out var responseElement) &&
                    responseElement.ValueKind == JsonValueKind.Object)
                {
                    completedText = ExtractOutputTextFromRoot(responseElement);
                    inputTokens = ExtractUsageToken(responseElement, "input_tokens");
                    outputTokens = ExtractUsageToken(responseElement, "output_tokens");
                    if (responseElement.TryGetProperty("model", out var modelElement) &&
                        modelElement.ValueKind == JsonValueKind.String)
                    {
                        responseModel = modelElement.GetString() ?? model;
                    }
                }

                return;
            }

            if (string.Equals(effectiveEvent, "error", StringComparison.Ordinal) ||
                string.Equals(effectiveEvent, "response.failed", StringComparison.Ordinal) ||
                string.Equals(effectiveEvent, "response.incomplete", StringComparison.Ordinal))
            {
                throw new InvalidOperationException(TryResolveStreamingErrorMessage(root) ?? "AI insight stream failed.");
            }
        }

        while (true)
        {
            var line = await reader.ReadLineAsync(timeoutCts.Token);
            if (line is null)
            {
                break;
            }

            if (line.Length == 0)
            {
                if (dataBuilder.Length > 0)
                {
                    await ProcessEventAsync(eventName, dataBuilder.ToString());
                    eventName = null;
                    dataBuilder.Clear();
                }

                continue;
            }

            if (line.StartsWith("event:", StringComparison.Ordinal))
            {
                eventName = line[6..].Trim();
                continue;
            }

            if (line.StartsWith("data:", StringComparison.Ordinal))
            {
                if (dataBuilder.Length > 0)
                {
                    dataBuilder.Append('\n');
                }

                dataBuilder.Append(line[5..].TrimStart());
            }
        }

        if (dataBuilder.Length > 0)
        {
            await ProcessEventAsync(eventName, dataBuilder.ToString());
        }

        var outputText = string.IsNullOrWhiteSpace(completedText)
            ? streamedText.ToString()
            : completedText;
        if (string.IsNullOrWhiteSpace(outputText))
        {
            throw new InvalidOperationException("AI insight response was empty.");
        }

        if (inputTokens <= 0)
        {
            inputTokens = EstimateTokenCount(groundedPrompt);
        }

        if (outputTokens <= 0)
        {
            outputTokens = EstimateTokenCount(outputText);
        }

        return new AiProviderResult(
            outputText.Trim(),
            Math.Max(1, inputTokens),
            Math.Max(1, outputTokens),
            ProviderOpenAi,
            responseModel);
    }

    private static AiProviderResult GenerateWithLocalProvider(
        string model,
        string prompt,
        PosInsightFacts posFacts,
        string outputLanguage)
    {
        var structured = BuildLocalStructuredInsight(prompt, posFacts, outputLanguage);
        var rawResponse = JsonSerializer.Serialize(structured, JsonOptions);

        return new AiProviderResult(
            rawResponse,
            Math.Max(1, EstimateTokenCount(prompt) + EstimateTokenCount(posFacts.ContextJson)),
            Math.Max(1, EstimateTokenCount(rawResponse)),
            ProviderLocal,
            model);
    }

    private static AiProviderResult BuildInsufficientDataFallback(
        string provider,
        string model,
        string prompt,
        string groundedPrompt,
        PosInsightFacts posFacts,
        string outputLanguage)
    {
        var structured = BuildInsufficientDataStructuredInsight(prompt, posFacts, outputLanguage);
        var rawResponse = JsonSerializer.Serialize(structured, JsonOptions);
        var fallbackModel = $"{model}-fallback";

        return new AiProviderResult(
            rawResponse,
            Math.Max(1, EstimateTokenCount(groundedPrompt)),
            Math.Max(1, EstimateTokenCount(rawResponse)),
            provider,
            fallbackModel);
    }

    private static async Task StreamTextInChunksAsync(
        string text,
        Func<string, CancellationToken, Task> onDelta,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        const int ChunkSize = 48;
        for (var index = 0; index < text.Length; index += ChunkSize)
        {
            var length = Math.Min(ChunkSize, text.Length - index);
            var chunk = text.Substring(index, length);
            if (!string.IsNullOrEmpty(chunk))
            {
                await onDelta(chunk, cancellationToken);
            }
        }
    }

    private async Task EnforceUsageLimitsAsync(
        Guid userId,
        decimal projectedChargeCredits,
        AiInsightOptions aiOptions,
        CancellationToken cancellationToken)
    {
        if (aiOptions.MaxRequestsPerMinute > 0)
        {
            var windowStart = DateTimeOffset.UtcNow.AddMinutes(-1);
            int recentCount;
            if (dbContext.Database.IsSqlite())
            {
                var recentRows = await dbContext.AiInsightRequests
                    .AsNoTracking()
                    .Where(x => x.UserId == userId)
                    .Select(x => x.CreatedAtUtc)
                    .ToListAsync(cancellationToken);
                recentCount = recentRows.Count(x => x >= windowStart);
            }
            else
            {
                recentCount = await dbContext.AiInsightRequests
                    .AsNoTracking()
                    .Where(x => x.UserId == userId && x.CreatedAtUtc >= windowStart)
                    .CountAsync(cancellationToken);
            }

            if (recentCount >= aiOptions.MaxRequestsPerMinute)
            {
                throw new InvalidOperationException("AI insight rate limit reached. Please retry in one minute.");
            }
        }

        if (aiOptions.DailyMaxChargeCredits > 0m)
        {
            var chargedToday = await GetDailyChargedCreditsAsync(userId, cancellationToken);
            var projectedTotal = RoundCredits(chargedToday + Math.Max(0m, RoundCredits(projectedChargeCredits)));
            var dailyLimit = RoundCredits(Math.Max(0m, aiOptions.DailyMaxChargeCredits));

            if (projectedTotal > dailyLimit)
            {
                throw new InvalidOperationException("Daily AI credit limit reached. Please try again tomorrow.");
            }
        }
    }

    private async Task<decimal> GetDailyChargedCreditsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var dayStart = new DateTimeOffset(DateTime.UtcNow.Date, TimeSpan.Zero);
        var dayEnd = dayStart.AddDays(1);

        if (dbContext.Database.IsSqlite())
        {
            var rows = await dbContext.AiInsightRequests
                .AsNoTracking()
                .Where(x => x.UserId == userId && x.Status == AiInsightRequestStatus.Succeeded)
                .Select(x => new { x.CreatedAtUtc, x.ChargedCredits })
                .ToListAsync(cancellationToken);
            var charged = rows
                .Where(x => x.CreatedAtUtc >= dayStart && x.CreatedAtUtc < dayEnd)
                .Sum(x => x.ChargedCredits);
            return RoundCredits(charged);
        }

        var serverCharged = await dbContext.AiInsightRequests
            .AsNoTracking()
            .Where(
                x => x.UserId == userId &&
                     x.Status == AiInsightRequestStatus.Succeeded &&
                     x.CreatedAtUtc >= dayStart &&
                     x.CreatedAtUtc < dayEnd)
            .SumAsync(x => (decimal?)x.ChargedCredits, cancellationToken);

        return RoundCredits(serverCharged ?? 0m);
    }

    private async Task<decimal> GetDailyRemainingCreditsAsync(
        Guid userId,
        AiInsightOptions aiOptions,
        CancellationToken cancellationToken)
    {
        if (aiOptions.DailyMaxChargeCredits <= 0m)
        {
            return -1m;
        }

        var dailyLimit = RoundCredits(Math.Max(0m, aiOptions.DailyMaxChargeCredits));
        var chargedToday = await GetDailyChargedCreditsAsync(userId, cancellationToken);
        var remaining = RoundCredits(dailyLimit - chargedToday);
        return remaining <= 0m ? 0m : remaining;
    }

    private async Task ValidatePromptGuardrailsAsync(
        string prompt,
        AiInsightOptions aiOptions,
        bool runModeration,
        CancellationToken cancellationToken)
    {
        if (!aiOptions.EnableSafetyChecks)
        {
            return;
        }

        await ValidateTextGuardrailsAsync(
            prompt,
            aiOptions.BlockedPromptTerms,
            "Prompt",
            aiOptions,
            runModeration,
            cancellationToken);
    }

    private async Task ValidateOutputGuardrailsAsync(
        string output,
        AiInsightOptions aiOptions,
        CancellationToken cancellationToken)
    {
        if (!aiOptions.EnableSafetyChecks)
        {
            return;
        }

        await ValidateTextGuardrailsAsync(
            output,
            aiOptions.BlockedOutputTerms,
            "AI response",
            aiOptions,
            aiOptions.EnableOpenAiModeration,
            cancellationToken);
    }

    private async Task ValidateTextGuardrailsAsync(
        string text,
        IEnumerable<string> blockedTerms,
        string contentLabel,
        AiInsightOptions aiOptions,
        bool runModeration,
        CancellationToken cancellationToken)
    {
        if (ContainsBlockedTerm(text, blockedTerms, out var matchedTerm))
        {
            logger.LogWarning(
                "{ContentLabel} blocked by safety term hash {TermHash}.",
                contentLabel,
                ComputePromptHash(matchedTerm));
            throw new InvalidOperationException($"{contentLabel} blocked by safety policy.");
        }

        if (!runModeration || !aiOptions.EnableOpenAiModeration)
        {
            return;
        }

        if (await IsModerationFlaggedAsync(text, aiOptions, cancellationToken))
        {
            logger.LogWarning(
                "{ContentLabel} blocked by moderation model {Model}.",
                contentLabel,
                aiOptions.ModerationModel);
            throw new InvalidOperationException($"{contentLabel} blocked by safety policy.");
        }
    }

    private static bool ContainsBlockedTerm(string text, IEnumerable<string> blockedTerms, out string matchedTerm)
    {
        foreach (var term in blockedTerms)
        {
            var normalizedTerm = (term ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(normalizedTerm))
            {
                continue;
            }

            if (text.Contains(normalizedTerm, StringComparison.OrdinalIgnoreCase))
            {
                matchedTerm = normalizedTerm;
                return true;
            }
        }

        matchedTerm = string.Empty;
        return false;
    }

    private async Task<bool> IsModerationFlaggedAsync(
        string text,
        AiInsightOptions aiOptions,
        CancellationToken cancellationToken)
    {
        try
        {
            var apiBaseUrl = (aiOptions.ApiBaseUrl ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(apiBaseUrl))
            {
                throw new InvalidOperationException("AiInsights:ApiBaseUrl is not configured for moderation checks.");
            }

            var (apiKey, apiKeyEnvironmentVariable) = ResolveOpenAiApiKey(configuration, aiOptions);
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new InvalidOperationException(
                    $"OpenAI API key is not configured for moderation checks. Set environment variable '{apiKeyEnvironmentVariable}'.");
            }

            using var message = new HttpRequestMessage(HttpMethod.Post, $"{apiBaseUrl.TrimEnd('/')}/moderations")
            {
                Content = new StringContent(
                    JsonSerializer.Serialize(new
                    {
                        model = string.IsNullOrWhiteSpace(aiOptions.ModerationModel)
                            ? "omni-moderation-latest"
                            : aiOptions.ModerationModel.Trim(),
                        input = text
                    }, JsonOptions),
                    Encoding.UTF8,
                    "application/json")
            };
            message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromMilliseconds(Math.Clamp(aiOptions.RequestTimeoutMs, 1000, 60000)));

            using var response = await httpClient.SendAsync(message, timeoutCts.Token);
            var raw = await response.Content.ReadAsStringAsync(timeoutCts.Token);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "OpenAI moderation request failed with status {StatusCode}. Body preview: {BodyPreview}",
                    (int)response.StatusCode,
                    aiPrivacyGovernanceService.RedactForLogPreview(raw));
                return HandleModerationFailure(aiOptions);
            }

            using var document = JsonDocument.Parse(raw);
            var root = document.RootElement;

            if (!root.TryGetProperty("results", out var resultsElement) ||
                resultsElement.ValueKind != JsonValueKind.Array ||
                resultsElement.GetArrayLength() == 0)
            {
                logger.LogWarning(
                    "OpenAI moderation response was missing results array. Body preview: {BodyPreview}",
                    aiPrivacyGovernanceService.RedactForLogPreview(raw));
                return HandleModerationFailure(aiOptions);
            }

            var firstResult = resultsElement[0];
            return firstResult.TryGetProperty("flagged", out var flaggedElement) &&
                   flaggedElement.ValueKind == JsonValueKind.True;
        }
        catch (OperationCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(exception, "OpenAI moderation request timed out.");
            return HandleModerationFailure(aiOptions);
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "OpenAI moderation request failed.");
            return HandleModerationFailure(aiOptions);
        }
        catch (JsonException exception)
        {
            logger.LogWarning(exception, "OpenAI moderation response could not be parsed.");
            return HandleModerationFailure(aiOptions);
        }
    }

    private bool HandleModerationFailure(AiInsightOptions aiOptions)
    {
        if (aiOptions.FailClosedOnModerationError)
        {
            throw new InvalidOperationException("AI safety check failed.");
        }

        logger.LogWarning(
            "OpenAI moderation failed and request continues because AiInsights:FailClosedOnModerationError is disabled.");
        return false;
    }

    private async Task<PosInsightFacts> BuildPosInsightFactsAsync(AppUser user, CancellationToken cancellationToken)
    {
        if (dbContext.Database.IsSqlite())
        {
            return await BuildPosInsightFactsForSqliteAsync(user, cancellationToken);
        }

        var now = DateTimeOffset.UtcNow;
        var recentWindowStart = now.AddDays(-7);
        var previousWindowStart = now.AddDays(-14);

        var recentSalesQuery = ApplyStoreScope(
            dbContext.Sales
                .AsNoTracking()
                .Where(x => x.Status == SaleStatus.Completed && x.CreatedAtUtc >= recentWindowStart && x.CreatedAtUtc <= now),
            user.StoreId);

        var previousSalesQuery = ApplyStoreScope(
            dbContext.Sales
                .AsNoTracking()
                .Where(x => x.Status == SaleStatus.Completed && x.CreatedAtUtc >= previousWindowStart && x.CreatedAtUtc < recentWindowStart),
            user.StoreId);

        var transactionsLast7Days = await recentSalesQuery.CountAsync(cancellationToken);
        var transactionsPrevious7Days = await previousSalesQuery.CountAsync(cancellationToken);
        var revenueLast7Days = RoundMoney(await recentSalesQuery.SumAsync(x => (decimal?)x.GrandTotal, cancellationToken) ?? 0m);
        var revenuePrevious7Days = RoundMoney(await previousSalesQuery.SumAsync(x => (decimal?)x.GrandTotal, cancellationToken) ?? 0m);

        var revenueTrendPercent = revenuePrevious7Days > 0m
            ? RoundPercent(((revenueLast7Days - revenuePrevious7Days) / revenuePrevious7Days) * 100m)
            : (revenueLast7Days > 0m ? 100m : 0m);

        var recentSaleItemsQuery = ApplyStoreScope(
            dbContext.SaleItems
                .AsNoTracking()
                .Where(x => x.Sale.Status == SaleStatus.Completed && x.Sale.CreatedAtUtc >= recentWindowStart && x.Sale.CreatedAtUtc <= now),
            user.StoreId);

        var topProductsRaw = await recentSaleItemsQuery
            .GroupBy(x => x.ProductNameSnapshot)
            .Select(g => new
            {
                ProductName = g.Key,
                Revenue = g.Sum(x => x.LineTotal),
                Quantity = g.Sum(x => x.Quantity)
            })
            .OrderByDescending(x => x.Revenue)
            .Take(5)
            .ToListAsync(cancellationToken);

        var topProducts = topProductsRaw
            .Select(x => new PosFactTopProduct(
                string.IsNullOrWhiteSpace(x.ProductName) ? "Unknown product" : x.ProductName,
                RoundMoney(x.Revenue),
                RoundQuantity(x.Quantity)))
            .ToList();

        var lowMarginRaw = (await ApplyStoreScope(
                    dbContext.Products
                        .AsNoTracking()
                        .Where(x => x.IsActive && x.UnitPrice > 0m),
                    user.StoreId)
                .Select(x => new
                {
                    x.Name,
                    MarginPercent = ((x.UnitPrice - x.CostPrice) / x.UnitPrice) * 100m
                })
                .ToListAsync(cancellationToken))
            .OrderBy(x => x.MarginPercent)
            .Take(5)
            .ToList();

        var lowMarginProducts = lowMarginRaw
            .Select(x => new PosFactMarginProduct(x.Name, RoundPercent(x.MarginPercent)))
            .ToList();

        var lowStockRaw = await ApplyStoreScope(
                dbContext.Inventory
                    .AsNoTracking(),
                user.StoreId)
            .Select(x => new
            {
                ProductName = x.Product.Name,
                x.QuantityOnHand,
                x.ReorderLevel
            })
            .ToListAsync(cancellationToken);

        var lowStockProducts = lowStockRaw
            .Where(x => x.QuantityOnHand <= x.ReorderLevel)
            .OrderBy(x => x.QuantityOnHand - x.ReorderLevel)
            .Take(5)
            .Select(x => new PosFactLowStockProduct(
                x.ProductName,
                x.QuantityOnHand,
                x.ReorderLevel))
            .ToList();

        lowStockProducts = lowStockProducts
            .Select(x => x with
            {
                QuantityOnHand = RoundQuantity(x.QuantityOnHand),
                ReorderLevel = RoundQuantity(x.ReorderLevel)
            })
            .ToList();

        var missingData = new List<string>();
        if (transactionsLast7Days < 3)
        {
            missingData.Add("Need at least 3 completed sales in the last 7 days for reliable trend analysis.");
        }

        if (topProducts.Count == 0)
        {
            missingData.Add("No sold-product breakdown found in the last 7 days.");
        }

        if (lowMarginProducts.Count == 0)
        {
            missingData.Add("No active product margin data available.");
        }

        if (lowStockProducts.Count == 0)
        {
            missingData.Add("No low-stock alerts currently available.");
        }

        var isInsufficientData = transactionsLast7Days < 3 || topProducts.Count == 0;

        var contextPayload = new
        {
            generated_at_utc = now,
            window_days = new { current = 7, previous = 7 },
            sales = new
            {
                transactions_last_7_days = transactionsLast7Days,
                transactions_previous_7_days = transactionsPrevious7Days,
                revenue_last_7_days = revenueLast7Days,
                revenue_previous_7_days = revenuePrevious7Days,
                revenue_trend_percent = revenueTrendPercent
            },
            top_products = topProducts,
            low_margin_products = lowMarginProducts,
            low_stock_products = lowStockProducts,
            insufficient_data = isInsufficientData,
            missing_data = missingData
        };

        return new PosInsightFacts(
            JsonSerializer.Serialize(contextPayload, JsonOptions),
            isInsufficientData,
            transactionsLast7Days,
            transactionsPrevious7Days,
            revenueLast7Days,
            revenuePrevious7Days,
            revenueTrendPercent,
            topProducts,
            lowMarginProducts,
            lowStockProducts,
            missingData);
    }

    private async Task<PosInsightFacts> BuildPosInsightFactsForSqliteAsync(
        AppUser user,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var recentWindowStart = now.AddDays(-7);
        var previousWindowStart = now.AddDays(-14);

        var completedSales = await ApplyStoreScope(
                dbContext.Sales
                    .AsNoTracking()
                    .Where(x => x.Status == SaleStatus.Completed),
                user.StoreId)
            .Select(x => new
            {
                x.Id,
                x.CreatedAtUtc,
                x.GrandTotal
            })
            .ToListAsync(cancellationToken);

        var recentSales = completedSales
            .Where(x => x.CreatedAtUtc >= recentWindowStart && x.CreatedAtUtc <= now)
            .ToList();
        var previousSales = completedSales
            .Where(x => x.CreatedAtUtc >= previousWindowStart && x.CreatedAtUtc < recentWindowStart)
            .ToList();

        var transactionsLast7Days = recentSales.Count;
        var transactionsPrevious7Days = previousSales.Count;
        var revenueLast7Days = RoundMoney(recentSales.Sum(x => x.GrandTotal));
        var revenuePrevious7Days = RoundMoney(previousSales.Sum(x => x.GrandTotal));

        var revenueTrendPercent = revenuePrevious7Days > 0m
            ? RoundPercent(((revenueLast7Days - revenuePrevious7Days) / revenuePrevious7Days) * 100m)
            : (revenueLast7Days > 0m ? 100m : 0m);

        var saleItems = await ApplyStoreScope(
                dbContext.SaleItems
                    .AsNoTracking()
                    .Where(x => x.Sale.Status == SaleStatus.Completed),
                user.StoreId)
            .Select(x => new
            {
                x.ProductNameSnapshot,
                x.LineTotal,
                x.Quantity,
                x.Sale.CreatedAtUtc
            })
            .ToListAsync(cancellationToken);

        var topProducts = saleItems
            .Where(x => x.CreatedAtUtc >= recentWindowStart && x.CreatedAtUtc <= now)
            .GroupBy(x => x.ProductNameSnapshot)
            .Select(g => new PosFactTopProduct(
                g.Key,
                g.Sum(x => x.LineTotal),
                g.Sum(x => x.Quantity)))
            .OrderByDescending(x => x.Revenue)
            .Take(5)
            .Select(x => x with
            {
                Revenue = RoundMoney(x.Revenue),
                Quantity = RoundQuantity(x.Quantity)
            })
            .ToList();

        var lowMarginRaw = (await ApplyStoreScope(
                    dbContext.Products
                        .AsNoTracking()
                        .Where(x => x.IsActive && x.UnitPrice > 0m),
                    user.StoreId)
                .Select(x => new
                {
                    x.Name,
                    MarginPercent = ((x.UnitPrice - x.CostPrice) / x.UnitPrice) * 100m
                })
                .ToListAsync(cancellationToken))
            .OrderBy(x => x.MarginPercent)
            .Take(5)
            .ToList();

        var lowMarginProducts = lowMarginRaw
            .Select(x => new PosFactMarginProduct(x.Name, RoundPercent(x.MarginPercent)))
            .ToList();

        var lowStockRaw = await ApplyStoreScope(
                dbContext.Inventory
                    .AsNoTracking(),
                user.StoreId)
            .Select(x => new
            {
                ProductName = x.Product.Name,
                x.QuantityOnHand,
                x.ReorderLevel
            })
            .ToListAsync(cancellationToken);

        var lowStockProducts = lowStockRaw
            .Where(x => x.QuantityOnHand <= x.ReorderLevel)
            .OrderBy(x => x.QuantityOnHand - x.ReorderLevel)
            .Take(5)
            .Select(x => new PosFactLowStockProduct(
                x.ProductName,
                x.QuantityOnHand,
                x.ReorderLevel))
            .ToList();

        lowStockProducts = lowStockProducts
            .Select(x => x with
            {
                QuantityOnHand = RoundQuantity(x.QuantityOnHand),
                ReorderLevel = RoundQuantity(x.ReorderLevel)
            })
            .ToList();

        var missingData = new List<string>();
        if (transactionsLast7Days < 3)
        {
            missingData.Add("Need at least 3 completed sales in the last 7 days for reliable trend analysis.");
        }

        if (topProducts.Count == 0)
        {
            missingData.Add("No sold-product breakdown found in the last 7 days.");
        }

        if (lowMarginProducts.Count == 0)
        {
            missingData.Add("No active product margin data available.");
        }

        if (lowStockProducts.Count == 0)
        {
            missingData.Add("No low-stock alerts currently available.");
        }

        var isInsufficientData = transactionsLast7Days < 3 || topProducts.Count == 0;

        var contextPayload = new
        {
            generated_at_utc = now,
            window_days = new { current = 7, previous = 7 },
            sales = new
            {
                transactions_last_7_days = transactionsLast7Days,
                transactions_previous_7_days = transactionsPrevious7Days,
                revenue_last_7_days = revenueLast7Days,
                revenue_previous_7_days = revenuePrevious7Days,
                revenue_trend_percent = revenueTrendPercent
            },
            top_products = topProducts,
            low_margin_products = lowMarginProducts,
            low_stock_products = lowStockProducts,
            insufficient_data = isInsufficientData,
            missing_data = missingData
        };

        return new PosInsightFacts(
            JsonSerializer.Serialize(contextPayload, JsonOptions),
            isInsufficientData,
            transactionsLast7Days,
            transactionsPrevious7Days,
            revenueLast7Days,
            revenuePrevious7Days,
            revenueTrendPercent,
            topProducts,
            lowMarginProducts,
            lowStockProducts,
            missingData);
    }

    private async Task<string> ResolvePreferredOutputLanguageAsync(CancellationToken cancellationToken)
    {
        string? value;
        if (dbContext.Database.IsSqlite())
        {
            value = (await dbContext.ShopProfiles
                    .AsNoTracking()
                    .Select(x => x.Language)
                    .ToListAsync(cancellationToken))
                .FirstOrDefault();
        }
        else
        {
            value = await dbContext.ShopProfiles
                .AsNoTracking()
                .Select(x => x.Language)
                .FirstOrDefaultAsync(cancellationToken);
        }

        return NormalizeOutputLanguage(value);
    }

    private static IQueryable<Sale> ApplyStoreScope(IQueryable<Sale> query, Guid? storeId)
    {
        if (storeId.HasValue)
        {
            return query.Where(x => x.StoreId == storeId.Value);
        }

        return query.Where(x => x.StoreId == null);
    }

    private static string NormalizeOutputLanguage(string? value)
    {
        var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            OutputLanguageSinhala => OutputLanguageSinhala,
            OutputLanguageTamil => OutputLanguageTamil,
            _ => OutputLanguageEnglish
        };
    }

    private static string? ResolveOutputLanguageOverride(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return NormalizeOutputLanguage(value);
    }

    private static string MapOutputLanguageLabel(string normalizedLanguage)
    {
        return normalizedLanguage switch
        {
            OutputLanguageSinhala => "Sinhala",
            OutputLanguageTamil => "Tamil",
            _ => "English"
        };
    }

    private static string LocalizeOutputText(string english, string sinhala, string tamil, string outputLanguage)
    {
        return outputLanguage switch
        {
            OutputLanguageSinhala => sinhala,
            OutputLanguageTamil => tamil,
            _ => english
        };
    }

    private static IQueryable<SaleItem> ApplyStoreScope(IQueryable<SaleItem> query, Guid? storeId)
    {
        if (storeId.HasValue)
        {
            return query.Where(x => x.Sale.StoreId == storeId.Value);
        }

        return query.Where(x => x.Sale.StoreId == null);
    }

    private static IQueryable<Product> ApplyStoreScope(IQueryable<Product> query, Guid? storeId)
    {
        if (storeId.HasValue)
        {
            return query.Where(x => x.StoreId == storeId.Value);
        }

        return query.Where(x => x.StoreId == null);
    }

    private static IQueryable<InventoryRecord> ApplyStoreScope(IQueryable<InventoryRecord> query, Guid? storeId)
    {
        if (storeId.HasValue)
        {
            return query.Where(x => x.StoreId == storeId.Value);
        }

        return query.Where(x => x.StoreId == null);
    }

    private static string BuildGroundedPrompt(
        IReadOnlyDictionary<string, string> payload)
    {
        var customerQuestion = ReadPayloadValue(payload, "customer_question", fallback: "No customer question provided.");
        var posFactsJson = ReadPayloadValue(payload, "verified_pos_facts_json", fallback: "{}");
        var outputLanguageLabel = ReadPayloadValue(payload, "output_language", fallback: "English");
        var customRules = ReadPayloadValue(payload, "rules", fallback: string.Empty);

        var builder = new StringBuilder();
        builder.AppendLine("Customer question:");
        builder.AppendLine(customerQuestion);
        builder.AppendLine();
        builder.AppendLine("Verified POS facts (JSON):");
        builder.AppendLine(posFactsJson);
        builder.AppendLine();
        builder.AppendLine("Rules:");
        builder.AppendLine("1. Use only verified facts from the JSON block.");
        builder.AppendLine("2. Do not invent numbers, products, trends, or stock values.");
        builder.AppendLine("3. If data is insufficient, set insufficient_data=true and list missing_data.");
        builder.AppendLine("4. Return strictly valid JSON with this schema:");
        builder.AppendLine($"5. Write all text fields in {outputLanguageLabel}.");
        if (!string.IsNullOrWhiteSpace(customRules))
        {
            builder.AppendLine("6. Additional policy:");
            builder.AppendLine($"   {customRules}");
        }
        builder.AppendLine("   {");
        builder.AppendLine("     \"summary\": string,");
        builder.AppendLine("     \"recommended_actions\": string[],");
        builder.AppendLine("     \"risks\": string[],");
        builder.AppendLine("     \"missing_data\": string[],");
        builder.AppendLine("     \"insufficient_data\": boolean,");
        builder.AppendLine("     \"confidence\": \"low\" | \"medium\" | \"high\"");
        builder.AppendLine("   }");
        return builder.ToString();
    }

    private static string ReadPayloadValue(
        IReadOnlyDictionary<string, string> payload,
        string key,
        string fallback)
    {
        return payload.TryGetValue(key, out var value) &&
               !string.IsNullOrWhiteSpace(value)
            ? value
            : fallback;
    }

    private static StructuredInsightPayload BuildLocalStructuredInsight(
        string prompt,
        PosInsightFacts posFacts,
        string outputLanguage)
    {
        if (posFacts.IsInsufficientData)
        {
            return BuildInsufficientDataStructuredInsight(prompt, posFacts, outputLanguage);
        }

        var topProduct = posFacts.TopProducts.FirstOrDefault();
        var lowMargin = posFacts.LowMarginProducts.FirstOrDefault();
        var lowStock = posFacts.LowStockProducts.FirstOrDefault();

        var actions = new List<string>();
        if (!string.IsNullOrWhiteSpace(topProduct.ProductName))
        {
            actions.Add(LocalizeOutputText(
                $"Protect sales momentum for '{topProduct.ProductName}' with targeted placement and avoid stock interruptions.",
                $"'{topProduct.ProductName}' සඳහා ඉලක්කගත ප්‍රදර්ශනය භාවිතා කර විකුණුම් වේගය ආරක්ෂා කර තොග බාධා වලක්වන්න.",
                $"'{topProduct.ProductName}' க்கான விற்பனை வேகத்தை பாதுகாக்க இலக்கு மையப்படுத்தப்பட்ட காட்சியமைப்பைப் பயன்படுத்தி சரக்கு தடைப்படுதலை தவிர்க்கவும்.",
                outputLanguage));
        }

        if (!string.IsNullOrWhiteSpace(lowMargin.ProductName))
        {
            actions.Add(LocalizeOutputText(
                $"Review pricing or supplier cost for '{lowMargin.ProductName}' to improve margin performance.",
                $"ලාභ ප්‍රතිඵල වැඩි දියුණු කිරීම සඳහා '{lowMargin.ProductName}' සඳහා මිලකරණය හෝ සැපයුම්කරු පිරිවැය සමාලෝචනය කරන්න.",
                $"லாப செயல்திறனை மேம்படுத்த '{lowMargin.ProductName}' க்கான விலை நிர்ணயம் அல்லது விநியோகஸ்தர் செலவை மதிப்பாய்வு செய்யவும்.",
                outputLanguage));
        }

        if (!string.IsNullOrWhiteSpace(lowStock.ProductName))
        {
            actions.Add(LocalizeOutputText(
                $"Replenish '{lowStock.ProductName}' soon because quantity is {lowStock.QuantityOnHand:0.###} against reorder level {lowStock.ReorderLevel:0.###}.",
                $"'{lowStock.ProductName}' ඉක්මනින් නැවත තොග කරන්න. පවතින ප්‍රමාණය {lowStock.QuantityOnHand:0.###}ක් වන අතර නැවත ඇණවුම් මට්ටම {lowStock.ReorderLevel:0.###}කි.",
                $"'{lowStock.ProductName}' ஐ விரைவில் மீண்டும் சரக்கு சேர்க்கவும். தற்போதைய அளவு {lowStock.QuantityOnHand:0.###}, மறு ஆர்டர் நிலை {lowStock.ReorderLevel:0.###}.",
                outputLanguage));
        }

        if (actions.Count == 0)
        {
            actions.Add(LocalizeOutputText(
                "Run a 7-day product and margin review report before changing pricing or promotion strategy.",
                "මිලකරණය හෝ ප්‍රවර්ධන උපාය මාර්ගය වෙනස් කිරීමට පෙර දින 7ක භාණ්ඩ සහ ලාභ සමාලෝචන වාර්තාවක් ක්‍රියාත්මක කරන්න.",
                "விலை நிர்ணயம் அல்லது விளம்பர மூலோபாயத்தை மாற்றுவதற்கு முன் 7 நாள் பொருள் மற்றும் லாப மதிப்பாய்வு அறிக்கையை இயக்கவும்.",
                outputLanguage));
        }

        var risks = new List<string>();
        if (posFacts.RevenueTrendPercent < 0m)
        {
            risks.Add(LocalizeOutputText(
                $"Revenue trend is declining ({posFacts.RevenueTrendPercent:0.##}% versus previous 7 days). Continue monitoring daily.",
                $"ආදායම් ප්‍රවණතාව පහළ යමින් පවතී (පසුගිය දින 7ට සාපේක්ෂව {posFacts.RevenueTrendPercent:0.##}%). දිනපතා නිරීක්ෂණය කරගෙන යන්න.",
                $"வருமான போக்கு குறைந்து வருகிறது (முந்தைய 7 நாட்களுடன் ஒப்பிடும்போது {posFacts.RevenueTrendPercent:0.##}%). தினசரி கண்காணிப்பை தொடரவும்.",
                outputLanguage));
        }

        if (!string.IsNullOrWhiteSpace(lowStock.ProductName))
        {
            risks.Add(LocalizeOutputText(
                $"Potential stock-out risk for '{lowStock.ProductName}'.",
                $"'{lowStock.ProductName}' සඳහා තොග අවසන් වීමේ අවදානමක් ඇත.",
                $"'{lowStock.ProductName}' க்கு சரக்கு தீர்ந்துவிடும் அபாயம் உள்ளது.",
                outputLanguage));
        }

        if (risks.Count == 0)
        {
            risks.Add(LocalizeOutputText(
                "Current trend is stable, but demand can shift quickly without daily monitoring.",
                "වත්මන් ප්‍රවණතාව ස්ථාවරය, නමුත් දෛනික නිරීක්ෂණයකින් තොරව ඉල්ලුම වේගයෙන් වෙනස් විය හැක.",
                "தற்போதைய போக்கு நிலையாக உள்ளது, ஆனால் தினசரி கண்காணிப்பு இல்லையெனில் தேவை விரைவாக மாறலாம்.",
                outputLanguage));
        }

        return new StructuredInsightPayload
        {
            Summary = LocalizeOutputText(
                $"Last 7 days show {posFacts.TransactionsLast7Days} completed sales with revenue {posFacts.RevenueLast7Days:0.00}. Revenue trend vs prior 7 days is {posFacts.RevenueTrendPercent:0.##}%.",
                $"පසුගිය දින 7 තුළ සම්පූර්ණ විකුණුම් {posFacts.TransactionsLast7Days}ක් සහ ආදායම {posFacts.RevenueLast7Days:0.00}කි. පෙර දින 7ට සාපේක්ෂ ආදායම් ප්‍රවණතාව {posFacts.RevenueTrendPercent:0.##}%කි.",
                $"கடந்த 7 நாட்களில் {posFacts.TransactionsLast7Days} முடிக்கப்பட்ட விற்பனைகள் மற்றும் {posFacts.RevenueLast7Days:0.00} வருமானம் பதிவாகியுள்ளது. முந்தைய 7 நாட்களுடன் ஒப்பிடும் வருமான போக்கு {posFacts.RevenueTrendPercent:0.##}%.",
                outputLanguage),
            RecommendedActions = actions,
            Risks = risks,
            MissingData = posFacts.MissingData.ToList(),
            InsufficientData = false,
            Confidence = "medium"
        };
    }

    private static StructuredInsightPayload BuildInsufficientDataStructuredInsight(
        string prompt,
        PosInsightFacts posFacts,
        string outputLanguage)
    {
        var missingData = posFacts.MissingData.Count == 0
            ? [LocalizeOutputText(
                "Not enough reliable POS data is available for this timeframe.",
                "මෙම කාල පරාසය සඳහා විශ්වාසදායක POS දත්ත ප්‍රමාණවත් නොවේ.",
                "இந்த காலப்பகுதிக்கான நம்பத்தகுந்த POS தரவு போதவில்லை.",
                outputLanguage)]
            : posFacts.MissingData.ToList();

        return new StructuredInsightPayload
        {
            Summary = LocalizeOutputText(
                "Insufficient data to provide reliable AI insights from POS facts.",
                "POS දත්ත මත විශ්වාසදායක AI අවබෝධ ලබා දීමට දත්ත ප්‍රමාණවත් නොවේ.",
                "POS தரவின் அடிப்படையில் நம்பத்தகுந்த AI பார்வைகளை வழங்க தரவு போதவில்லை.",
                outputLanguage),
            RecommendedActions =
            [
                LocalizeOutputText(
                    "Collect at least 3 completed sales across multiple time periods, then retry the same question.",
                    "විවිධ කාල පරාසයන් තුළ අවම වශයෙන් සම්පූර්ණ විකුණුම් 3ක් එකතු කර එම ප්‍රශ්නය නැවත උත්සාහ කරන්න.",
                    "பல்வேறு காலப்பகுதிகளில் குறைந்தது 3 முடிக்கப்பட்ட விற்பனைகளை சேகரித்து அதே கேள்வியை மீண்டும் முயற்சிக்கவும்.",
                    outputLanguage),
                LocalizeOutputText(
                    "Ensure products, cost prices, and inventory reorder levels are up to date.",
                    "භාණ්ඩ, පිරිවැය මිල සහ ඉන්වෙන්ටරි නැවත ඇණවුම් මට්ටම් යාවත්කාලීනව ඇති බව තහවුරු කරන්න.",
                    "பொருட்கள், செலவு விலைகள் மற்றும் இன்வெண்டரி மறு ஆர்டர் நிலைகள் புதுப்பிக்கப்பட்டுள்ளனவா என்பதை உறுதிப்படுத்தவும்.",
                    outputLanguage)
            ],
            Risks =
            [
                LocalizeOutputText(
                    "Any recommendation now may be inaccurate because key POS facts are missing.",
                    "ප්‍රධාන POS දත්ත නොමැති බැවින් දැන් ලබාදෙන ඕනෑම නිර්දේශයක් අක්‍රමවත් විය හැක.",
                    "முக்கிய POS தரவுகள் இல்லாததால் இப்போது வழங்கப்படும் எந்த பரிந்துரையும் துல்லியமற்றதாக இருக்கலாம்.",
                    outputLanguage)
            ],
            MissingData = missingData,
            InsufficientData = true,
            Confidence = "low"
        };
    }

    private static string NormalizeInsightText(
        string rawInsight,
        PosInsightFacts posFacts,
        string prompt,
        string outputLanguage)
    {
        StructuredInsightPayload payload;
        if (!TryParseStructuredInsight(rawInsight, out var parsedPayload))
        {
            payload = BuildBestEffortStructuredInsight(rawInsight, prompt, posFacts, outputLanguage);
        }
        else
        {
            payload = parsedPayload;
        }

        var normalized = NormalizeStructuredInsightPayload(payload, posFacts, rawInsight, outputLanguage);
        return FormatStructuredInsight(normalized, outputLanguage);
    }

    private static bool TryParseStructuredInsight(string rawInsight, out StructuredInsightPayload payload)
    {
        payload = new StructuredInsightPayload();

        if (string.IsNullOrWhiteSpace(rawInsight))
        {
            return false;
        }

        var candidate = rawInsight.Trim();

        var firstBrace = candidate.IndexOf('{');
        var lastBrace = candidate.LastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace)
        {
            candidate = candidate[firstBrace..(lastBrace + 1)];
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<StructuredInsightPayload>(candidate, CaseInsensitiveJsonOptions);
            if (parsed is null)
            {
                return false;
            }

            var hasSignal = !string.IsNullOrWhiteSpace(parsed.Summary)
                            || (parsed.RecommendedActions?.Count ?? 0) > 0
                            || (parsed.Risks?.Count ?? 0) > 0
                            || (parsed.MissingData?.Count ?? 0) > 0;

            if (!hasSignal)
            {
                return false;
            }

            payload = parsed;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static StructuredInsightPayload BuildBestEffortStructuredInsight(
        string rawInsight,
        string prompt,
        PosInsightFacts posFacts,
        string outputLanguage)
    {
        var summary = SummarizeText(rawInsight, 320);
        if (string.IsNullOrWhiteSpace(summary))
        {
            summary = LocalizeOutputText(
                posFacts.IsInsufficientData
                    ? "Insufficient data to provide reliable AI insights from POS facts."
                    : "AI insight generated with partial structure.",
                posFacts.IsInsufficientData
                    ? "POS දත්ත මත විශ්වාසදායක AI අවබෝධ ලබා දීමට දත්ත ප්‍රමාණවත් නොවේ."
                    : "අර්ධ ව්‍යුහයකින් AI අවබෝධයක් නිර්මාණය කරන ලදී.",
                posFacts.IsInsufficientData
                    ? "POS தரவின் அடிப்படையில் நம்பத்தகுந்த AI பார்வைகளை வழங்க தரவு போதவில்லை."
                    : "பகுதி கட்டமைப்புடன் AI பார்வை உருவாக்கப்பட்டது.",
                outputLanguage);
        }

        var actions = new List<string>();
        if (posFacts.TopProducts.Count > 0)
        {
            actions.Add(LocalizeOutputText(
                $"Prioritize monitoring '{posFacts.TopProducts[0].ProductName}' as a leading sales contributor.",
                $"ප්‍රමුඛ විකුණුම් දායකයෙකු ලෙස '{posFacts.TopProducts[0].ProductName}' වෙත ප්‍රමුඛ නිරීක්ෂණයක් ලබා දෙන්න.",
                $"முன்னணி விற்பனை பங்களிப்பாளராக '{posFacts.TopProducts[0].ProductName}' ஐ முன்னுரிமையுடன் கண்காணிக்கவும்.",
                outputLanguage));
        }

        actions.Add(LocalizeOutputText(
            "Review daily sales, margin, and stock movement before applying permanent pricing changes.",
            "ස්ථිර මිල වෙනස්කම් කිරීමට පෙර දෛනික විකුණුම්, ලාභ අනුපාතය සහ තොග චලනය සමාලෝචනය කරන්න.",
            "நிலையான விலை மாற்றங்களைச் செய்வதற்கு முன் தினசரி விற்பனை, லாப விகிதம் மற்றும் சரக்கு நகர்வை மதிப்பாய்வு செய்யவும்.",
            outputLanguage));

        return new StructuredInsightPayload
        {
            Summary = summary,
            RecommendedActions = actions,
            Risks =
            [
                LocalizeOutputText(
                    "Output was not fully structured; validate actions against raw POS reports before rollout.",
                    "ප්‍රතිදානය සම්පූර්ණයෙන් ව්‍යුහගත නොවීය; ක්‍රියාත්මක කිරීමට පෙර raw POS වාර්තා සමඟ ක්‍රියාමාර්ග තහවුරු කරන්න.",
                    "வெளியீடு முழுமையாக கட்டமைக்கப்படவில்லை; செயல்படுத்துவதற்கு முன் raw POS அறிக்கைகளுடன் நடவடிக்கைகளை சரிபார்க்கவும்.",
                    outputLanguage)
            ],
            MissingData = posFacts.MissingData.ToList(),
            InsufficientData = posFacts.IsInsufficientData,
            Confidence = posFacts.IsInsufficientData ? "low" : "medium"
        };
    }

    private static StructuredInsightPayload NormalizeStructuredInsightPayload(
        StructuredInsightPayload payload,
        PosInsightFacts posFacts,
        string rawInsight,
        string outputLanguage)
    {
        var summary = SummarizeText(payload.Summary, 380);
        if (string.IsNullOrWhiteSpace(summary))
        {
            summary = SummarizeText(rawInsight, 380);
        }

        if (string.IsNullOrWhiteSpace(summary))
        {
            summary = LocalizeOutputText(
                posFacts.IsInsufficientData
                    ? "Insufficient data to provide reliable AI insights from POS facts."
                    : "AI insight generated from available POS facts.",
                posFacts.IsInsufficientData
                    ? "POS දත්ත මත විශ්වාසදායක AI අවබෝධ ලබා දීමට දත්ත ප්‍රමාණවත් නොවේ."
                    : "පවතින POS දත්ත මත AI අවබෝධයක් නිර්මාණය කරන ලදී.",
                posFacts.IsInsufficientData
                    ? "POS தரவின் அடிப்படையில் நம்பத்தகுந்த AI பார்வைகளை வழங்க தரவு போதவில்லை."
                    : "கிடைக்கக்கூடிய POS தரவின் அடிப்படையில் AI பார்வை உருவாக்கப்பட்டது.",
                outputLanguage);
        }

        var actions = SanitizeStringList(payload.RecommendedActions, minItems: 1, maxItems: 5);
        if (actions.Count == 0)
        {
            actions.Add(LocalizeOutputText(
                "Review daily sales, margin, and inventory reports to confirm the next operational action.",
                "මීළඟ මෙහෙයුම් ක්‍රියාව තහවුරු කිරීම සඳහා දෛනික විකුණුම්, ලාභ සහ ඉන්වෙන්ටරි වාර්තා සමාලෝචනය කරන්න.",
                "அடுத்த செயல்பாட்டு நடவடிக்கையை உறுதிப்படுத்த தினசரி விற்பனை, லாபம் மற்றும் இன்வெண்டரி அறிக்கைகளை மதிப்பாய்வு செய்யவும்.",
                outputLanguage));
        }

        var risks = SanitizeStringList(payload.Risks, minItems: 0, maxItems: 5);
        if (risks.Count == 0)
        {
            risks.Add(LocalizeOutputText(
                "Recommendations should be validated against current POS reports before full rollout.",
                "සම්පූර්ණ ක්‍රියාත්මක කිරීමට පෙර නිර්දේශ වත්මන් POS වාර්තා සමඟ තහවුරු කළ යුතුය.",
                "முழுமையான செயல்படுத்தலுக்கு முன் பரிந்துரைகள் தற்போதைய POS அறிக்கைகளுடன் சரிபார்க்கப்பட வேண்டும்.",
                outputLanguage));
        }

        var missingData = SanitizeStringList(payload.MissingData, minItems: 0, maxItems: 8)
            .Concat(posFacts.MissingData)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToList();

        var insufficientData = payload.InsufficientData || posFacts.IsInsufficientData;
        if (insufficientData && missingData.Count == 0)
        {
            missingData.Add(LocalizeOutputText(
                "Not enough verified POS context is available.",
                "තහවුරු කළ POS පසුබිම් දත්ත ප්‍රමාණවත් නොවේ.",
                "சரிபார்க்கப்பட்ட POS பின்னணி தரவு போதவில்லை.",
                outputLanguage));
        }

        var confidence = NormalizeConfidence(payload.Confidence, insufficientData ? "low" : "medium");

        return new StructuredInsightPayload
        {
            Summary = summary,
            RecommendedActions = actions,
            Risks = risks,
            MissingData = missingData,
            InsufficientData = insufficientData,
            Confidence = confidence
        };
    }

    private static string FormatStructuredInsight(StructuredInsightPayload payload, string outputLanguage)
    {
        var builder = new StringBuilder();

        builder.AppendLine(LocalizeOutputText("Summary:", "සාරාංශය:", "சுருக்கம்:", outputLanguage));
        builder.AppendLine(payload.Summary);
        builder.AppendLine();

        builder.AppendLine(LocalizeOutputText("Recommended actions:", "නිර්දේශිත ක්‍රියාමාර්ග:", "பரிந்துரைக்கப்பட்ட நடவடிக்கைகள்:", outputLanguage));
        for (var index = 0; index < payload.RecommendedActions.Count; index++)
        {
            builder.Append(index + 1).Append(". ").AppendLine(payload.RecommendedActions[index]);
        }

        builder.AppendLine();
        builder.AppendLine(LocalizeOutputText("Risks to watch:", "සැලකිලිමත් විය යුතු අවදානම්:", "கவனிக்க வேண்டிய அபாயங்கள்:", outputLanguage));
        foreach (var risk in payload.Risks)
        {
            builder.Append("- ").AppendLine(risk);
        }

        builder.AppendLine();
        builder.AppendLine(LocalizeOutputText("Missing data:", "අස්ථානගත දත්ත:", "பற்றாக்குறை தரவு:", outputLanguage));
        if (payload.MissingData.Count == 0)
        {
            builder.AppendLine("- " + LocalizeOutputText("None identified.", "කිසිවක් හඳුනාගෙන නොමැත.", "எதுவும் கண்டறியப்படவில்லை.", outputLanguage));
        }
        else
        {
            foreach (var item in payload.MissingData)
            {
                builder.Append("- ").AppendLine(item);
            }
        }

        builder.AppendLine();
        builder.Append("Confidence: ").Append(payload.Confidence);
        if (payload.InsufficientData)
        {
            builder.Append(" (insufficient data)");
        }

        return builder.ToString().Trim();
    }

    private static List<string> SanitizeStringList(IEnumerable<string>? input, int minItems, int maxItems)
    {
        var sanitized = (input ?? [])
            .Select(x => (x ?? string.Empty).Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(Math.Max(0, maxItems))
            .ToList();

        if (sanitized.Count < minItems)
        {
            return [];
        }

        return sanitized;
    }

    private static string NormalizeConfidence(string? confidence, string fallback)
    {
        var normalized = (confidence ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "low" => "low",
            "medium" => "medium",
            "high" => "high",
            _ => fallback
        };
    }

    private static string SummarizeText(string? text, int maxChars)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var singleLine = normalized.Replace("\r", " ").Replace("\n", " ").Trim();
        if (singleLine.Length <= maxChars)
        {
            return singleLine;
        }

        return singleLine[..maxChars].TrimEnd() + "...";
    }

    private static string NormalizeErrorMessageForPersistence(string? message)
    {
        var normalized = (message ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return "AI insight request failed.";
        }

        return normalized.Length <= 500
            ? normalized
            : normalized[..500].TrimEnd();
    }

    private static string BuildOpenAiFailureMessage(int statusCode, string raw)
    {
        var details = ExtractOpenAiFailureDetail(raw);
        if (string.IsNullOrWhiteSpace(details))
        {
            return $"OpenAI insight request failed (HTTP {statusCode}).";
        }

        return $"OpenAI insight request failed (HTTP {statusCode}): {details}";
    }

    private static string? TryResolveStreamingErrorMessage(JsonElement root)
    {
        if (root.TryGetProperty("error", out var errorElement) &&
            errorElement.ValueKind == JsonValueKind.Object &&
            errorElement.TryGetProperty("message", out var messageElement) &&
            messageElement.ValueKind == JsonValueKind.String)
        {
            var message = messageElement.GetString();
            if (!string.IsNullOrWhiteSpace(message))
            {
                return message.Trim();
            }
        }

        if (root.TryGetProperty("response", out var responseElement) &&
            responseElement.ValueKind == JsonValueKind.Object &&
            responseElement.TryGetProperty("error", out var responseErrorElement) &&
            responseErrorElement.ValueKind == JsonValueKind.Object &&
            responseErrorElement.TryGetProperty("message", out var responseMessageElement) &&
            responseMessageElement.ValueKind == JsonValueKind.String)
        {
            var responseMessage = responseMessageElement.GetString();
            if (!string.IsNullOrWhiteSpace(responseMessage))
            {
                return responseMessage.Trim();
            }
        }

        if (root.TryGetProperty("message", out var topMessageElement) &&
            topMessageElement.ValueKind == JsonValueKind.String)
        {
            var topMessage = topMessageElement.GetString();
            if (!string.IsNullOrWhiteSpace(topMessage))
            {
                return topMessage.Trim();
            }
        }

        return null;
    }

    private static string? ExtractOpenAiFailureDetail(string raw)
    {
        var normalized = (raw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(normalized);
            var root = document.RootElement;
            if (root.TryGetProperty("error", out var errorElement) &&
                errorElement.ValueKind == JsonValueKind.Object &&
                errorElement.TryGetProperty("message", out var messageElement) &&
                messageElement.ValueKind == JsonValueKind.String)
            {
                var message = messageElement.GetString();
                var summary = SummarizeText(message, 320);
                return string.IsNullOrWhiteSpace(summary) ? null : summary;
            }

            if (root.TryGetProperty("message", out var topMessageElement) &&
                topMessageElement.ValueKind == JsonValueKind.String)
            {
                var message = topMessageElement.GetString();
                var summary = SummarizeText(message, 320);
                return string.IsNullOrWhiteSpace(summary) ? null : summary;
            }
        }
        catch (JsonException)
        {
            // Fall back to plain-text preview when provider body is not JSON.
        }

        var fallback = SummarizeText(normalized, 320);
        return string.IsNullOrWhiteSpace(fallback) ? null : fallback;
    }

    private static string MapRequestStatus(AiInsightRequestStatus status)
    {
        return status switch
        {
            AiInsightRequestStatus.Pending => "pending",
            AiInsightRequestStatus.Succeeded => "succeeded",
            AiInsightRequestStatus.Failed => "failed",
            _ => "unknown"
        };
    }

    private static string MapUsageType(AiUsageType usageType)
    {
        return usageType switch
        {
            AiUsageType.QuickInsights => UsageTypeQuickInsights,
            AiUsageType.AdvancedAnalysis => UsageTypeAdvancedAnalysis,
            AiUsageType.SmartReports => UsageTypeSmartReports,
            _ => UsageTypeQuickInsights
        };
    }

    private static UsageTypePolicy ResolveUsagePolicy(string? usageType, AiInsightOptions aiOptions)
    {
        var normalized = (usageType ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "" or UsageTypeQuickInsights => new UsageTypePolicy(
                AiUsageType.QuickInsights,
                UsageTypeQuickInsights,
                NormalizeOutputTokenLimit(aiOptions.QuickInsightsMaxOutputTokens, aiOptions.MaxOutputTokens),
                NormalizeUsageMultiplier(aiOptions.QuickInsightsCreditMultiplier, 1.0m),
                (aiOptions.QuickInsightsModel ?? string.Empty).Trim()),
            UsageTypeAdvancedAnalysis => new UsageTypePolicy(
                AiUsageType.AdvancedAnalysis,
                UsageTypeAdvancedAnalysis,
                NormalizeOutputTokenLimit(aiOptions.AdvancedAnalysisMaxOutputTokens, aiOptions.MaxOutputTokens),
                NormalizeUsageMultiplier(aiOptions.AdvancedAnalysisCreditMultiplier, 1.8m),
                (aiOptions.AdvancedAnalysisModel ?? string.Empty).Trim()),
            UsageTypeSmartReports => new UsageTypePolicy(
                AiUsageType.SmartReports,
                UsageTypeSmartReports,
                NormalizeOutputTokenLimit(aiOptions.SmartReportsMaxOutputTokens, aiOptions.MaxOutputTokens),
                NormalizeUsageMultiplier(aiOptions.SmartReportsCreditMultiplier, 3.0m),
                (aiOptions.SmartReportsModel ?? string.Empty).Trim()),
            _ => throw new InvalidOperationException(
                "Invalid usage_type. Use quick_insights, advanced_analysis, or smart_reports.")
        };
    }

    private static int NormalizeOutputTokenLimit(int configured, int fallback)
    {
        var baseline = configured > 0 ? configured : fallback;
        return Math.Clamp(baseline, 32, 2000);
    }

    private static decimal NormalizeUsageMultiplier(decimal configured, decimal fallback)
    {
        return configured > 0m ? configured : fallback;
    }

    private static string ResolveModelForUsageType(
        AiInsightOptions aiOptions,
        string provider,
        UsageTypePolicy usagePolicy)
    {
        var fallback = provider == ProviderOpenAi
            ? string.IsNullOrWhiteSpace(usagePolicy.PreferredModel)
                ? "gpt-5.4-mini"
                : usagePolicy.PreferredModel
            : "local-pos-insights-v1";
        return ResolveModel(aiOptions, fallback);
    }

    private InsightEstimateData BuildInsightEstimate(
        string prompt,
        AiInsightOptions aiOptions,
        UsageTypePolicy usagePolicy)
    {
        var estimatedInput = Math.Max(
            1,
            EstimateTokenCount(prompt) +
            Math.Max(0, aiOptions.EstimatedSystemPromptTokens) +
            GroundingContextReserveTokenBuffer);
        var estimatedOutput = Math.Max(32, usagePolicy.MaxOutputTokens);
        var estimatedCharge = CalculateCredits(
            estimatedInput,
            estimatedOutput,
            aiOptions,
            usagePolicy.CreditMultiplier);
        var reserved = RoundCredits(estimatedCharge * Math.Max(1.0m, aiOptions.ReserveSafetyMultiplier));
        var reserveCredits = Math.Max(
            RoundCredits(Math.Max(0.1m, aiOptions.MinimumReserveCredits)),
            reserved);

        return new InsightEstimateData(
            estimatedInput,
            estimatedOutput,
            estimatedCharge,
            reserveCredits);
    }

    private static decimal CalculateCredits(
        int inputTokens,
        int outputTokens,
        AiInsightOptions aiOptions,
        decimal usageMultiplier)
    {
        var inputCredits = (Math.Max(0, inputTokens) / 1000m) * Math.Max(0m, aiOptions.InputCreditsPer1KTokens);
        var outputCredits = (Math.Max(0, outputTokens) / 1000m) * Math.Max(0m, aiOptions.OutputCreditsPer1KTokens);
        var computed = RoundCredits((inputCredits + outputCredits) * Math.Max(0.1m, usageMultiplier));
        var minimum = RoundCredits(Math.Max(0.1m, aiOptions.MinimumChargeCredits));
        return computed < minimum ? minimum : computed;
    }

    private static int ExtractUsageToken(JsonElement root, string usageField)
    {
        if (!root.TryGetProperty("usage", out var usage) || usage.ValueKind != JsonValueKind.Object)
        {
            return 0;
        }

        if (!usage.TryGetProperty(usageField, out var value))
        {
            return 0;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetInt32(out var parsed) => parsed,
            JsonValueKind.String when int.TryParse(value.GetString(), out var parsed) => parsed,
            _ => 0
        };
    }

    private static string ExtractOutputTextFromRoot(JsonElement root)
    {
        if (root.TryGetProperty("output_text", out var outputTextElement) &&
            outputTextElement.ValueKind == JsonValueKind.String)
        {
            return outputTextElement.GetString() ?? string.Empty;
        }

        if (!root.TryGetProperty("output", out var output) || output.ValueKind != JsonValueKind.Array)
        {
            return string.Empty;
        }

        foreach (var outputItem in output.EnumerateArray())
        {
            if (!outputItem.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array)
            {
                continue;
            }

            foreach (var contentItem in content.EnumerateArray())
            {
                if (contentItem.TryGetProperty("text", out var textElement) &&
                    textElement.ValueKind == JsonValueKind.String)
                {
                    var value = textElement.GetString();
                    if (!string.IsNullOrWhiteSpace(value))
                    {
                        return value;
                    }
                }
            }
        }

        return string.Empty;
    }

    private static string NormalizePrompt(string prompt)
    {
        var normalized = (prompt ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException("Prompt is required.");
        }

        if (normalized.Length > 8000)
        {
            throw new InvalidOperationException("Prompt is too long. Keep it under 8000 characters.");
        }

        return normalized;
    }

    private static string NormalizeIdempotencyKey(string idempotencyKey)
    {
        var normalized = (idempotencyKey ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException("Idempotency key is required.");
        }

        if (normalized.Length > 120)
        {
            throw new InvalidOperationException("Idempotency key is too long.");
        }

        return normalized;
    }

    private static string ComputePromptHash(string prompt)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(prompt));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static int EstimateTokenCount(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return 1;
        }

        return Math.Max(1, (int)Math.Ceiling(text.Length / 4.0));
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
            ProviderLocal => ProviderLocal,
            _ => throw new InvalidOperationException("Unsupported AI insights provider. Use 'Local' or 'OpenAI'.")
        };
    }

    private static string ResolveModel(AiInsightOptions aiOptions, string fallback)
    {
        var configured = (aiOptions.Model ?? string.Empty).Trim();
        var resolved = string.IsNullOrWhiteSpace(configured) ? fallback : configured;

        var allowedModels = aiOptions.AllowedModels
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (allowedModels.Count > 0 && !allowedModels.Contains(resolved))
        {
            throw new InvalidOperationException(
                $"Configured model '{resolved}' is not allowed by the frozen model list.");
        }

        return resolved;
    }

    private static string ResolvePricingRulesVersion(AiInsightOptions aiOptions)
    {
        var value = (aiOptions.PricingRulesVersion ?? string.Empty).Trim();
        return string.IsNullOrWhiteSpace(value)
            ? "ai_pricing_v1_2026_04_03"
            : value;
    }

    private static (string ApiKey, string EnvironmentVariableName) ResolveOpenAiApiKey(
        IConfiguration configuration,
        AiInsightOptions aiOptions)
    {
        var environmentVariableName = string.IsNullOrWhiteSpace(aiOptions.OpenAiApiKeyEnvironmentVariable)
            ? "OPENAI_API_KEY"
            : aiOptions.OpenAiApiKeyEnvironmentVariable.Trim();
        var apiKeyFromEnvironment = Environment.GetEnvironmentVariable(environmentVariableName);
        if (!string.IsNullOrWhiteSpace(apiKeyFromEnvironment))
        {
            return (apiKeyFromEnvironment.Trim(), environmentVariableName);
        }

        var apiKeyFromOptions = (aiOptions.OpenAiApiKey ?? string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(apiKeyFromOptions))
        {
            return (apiKeyFromOptions, environmentVariableName);
        }

        var apiKeyFromConfiguration = configuration["OpenAI:ApiKey"] ??
                                      configuration["OPENAI_API_KEY"] ??
                                      string.Empty;
        return (apiKeyFromConfiguration.Trim(), environmentVariableName);
    }

    private async Task<AppUser> ResolveUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        return await dbContext.Users
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("User account was not found.");
    }

    private static decimal RoundCredits(decimal credits)
    {
        return decimal.Round(credits, 2, MidpointRounding.AwayFromZero);
    }

    private static decimal RoundMoney(decimal amount)
    {
        return decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
    }

    private static decimal RoundPercent(decimal amount)
    {
        return decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
    }

    private static decimal RoundQuantity(decimal quantity)
    {
        return decimal.Round(quantity, 3, MidpointRounding.AwayFromZero);
    }

    private sealed record AiProviderResult(
        string Insight,
        int InputTokens,
        int OutputTokens,
        string Provider,
        string Model);

    private readonly record struct InsightEstimateData(
        int EstimatedInputTokens,
        int EstimatedOutputTokens,
        decimal EstimatedChargeCredits,
        decimal ReserveCredits);

    private readonly record struct UsageTypePolicy(
        AiUsageType UsageType,
        string ApiValue,
        int MaxOutputTokens,
        decimal CreditMultiplier,
        string PreferredModel);

    private readonly record struct PosInsightFacts(
        string ContextJson,
        bool IsInsufficientData,
        int TransactionsLast7Days,
        int TransactionsPrevious7Days,
        decimal RevenueLast7Days,
        decimal RevenuePrevious7Days,
        decimal RevenueTrendPercent,
        IReadOnlyList<PosFactTopProduct> TopProducts,
        IReadOnlyList<PosFactMarginProduct> LowMarginProducts,
        IReadOnlyList<PosFactLowStockProduct> LowStockProducts,
        IReadOnlyList<string> MissingData);

    private readonly record struct PosFactTopProduct(
        string ProductName,
        decimal Revenue,
        decimal Quantity);

    private readonly record struct PosFactMarginProduct(
        string ProductName,
        decimal MarginPercent);

    private readonly record struct PosFactLowStockProduct(
        string ProductName,
        decimal QuantityOnHand,
        decimal ReorderLevel);

    private sealed class StructuredInsightPayload
    {
        [JsonPropertyName("summary")]
        public string Summary { get; set; } = string.Empty;

        [JsonPropertyName("recommended_actions")]
        public List<string> RecommendedActions { get; set; } = [];

        [JsonPropertyName("risks")]
        public List<string> Risks { get; set; } = [];

        [JsonPropertyName("missing_data")]
        public List<string> MissingData { get; set; } = [];

        [JsonPropertyName("insufficient_data")]
        public bool InsufficientData { get; set; }

        [JsonPropertyName("confidence")]
        public string Confidence { get; set; } = "medium";
    }
}
