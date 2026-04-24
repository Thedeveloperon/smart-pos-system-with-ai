using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.AiChat;
using SmartPos.Backend.Features.CloudAccount;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Ai;

public sealed class AiCreditCloudRelayService(
    IOptions<AiInsightOptions> optionsAccessor,
    IHttpClientFactory httpClientFactory,
    LicenseService licenseService,
    CloudAccountService cloudAccountService,
    AiCreditCloudRelayWalletCache walletCache,
    AiCreditCloudRelayMetrics relayMetrics,
    ILogger<AiCreditCloudRelayService> logger)
{
    private const string CloudRelayClientName = "cloud-ai-relay";
    private const string LicenseTokenHeaderName = "X-License-Token";
    private const string CloudAuthCookieName = "smartpos_auth";
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    public bool IsEnabled => optionsAccessor.Value.CloudRelayEnabled;

    public async Task<AiWalletResponse> GetWalletAsync(
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        var authContext = await ResolveRelayAuthContextAsync(sourceContext, cancellationToken);
        var cacheKey = BuildWalletCacheKey(authContext.CacheIdentity);

        return await RelayAsync<AiWalletResponse>(
            HttpMethod.Get,
            "cloud/v1/ai/wallet",
            body: null,
            sourceContext,
            endpointName: "wallet",
            authContext,
            cacheKey,
            allowCachedWalletFallback: true,
            cancellationToken);
    }

    public async Task<AiCreditPackListResponse> GetCreditPacksAsync(
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        var authContext = await ResolveRelayAuthContextAsync(sourceContext, cancellationToken);

        return await RelayAsync<AiCreditPackListResponse>(
            HttpMethod.Get,
            "cloud/v1/ai/credit-packs",
            body: null,
            sourceContext,
            endpointName: "credit_packs",
            authContext,
            walletCacheKey: null,
            allowCachedWalletFallback: false,
            cancellationToken);
    }

    public async Task<AiInsightResponse> GenerateInsightAsync(
        AiInsightRequestPayload request,
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        var authContext = await ResolveRelayAuthContextAsync(sourceContext, cancellationToken);

        return await RelayAsync<AiInsightResponse>(
            HttpMethod.Post,
            "cloud/v1/ai/insights",
            request,
            sourceContext,
            endpointName: "insights",
            authContext,
            walletCacheKey: null,
            allowCachedWalletFallback: false,
            cancellationToken);
    }

    public async Task<AiInsightEstimateResponse> EstimateInsightAsync(
        AiInsightEstimateRequestPayload request,
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        var authContext = await ResolveRelayAuthContextAsync(sourceContext, cancellationToken);

        return await RelayAsync<AiInsightEstimateResponse>(
            HttpMethod.Post,
            "cloud/v1/ai/insights/estimate",
            request,
            sourceContext,
            endpointName: "insights_estimate",
            authContext,
            walletCacheKey: null,
            allowCachedWalletFallback: false,
            cancellationToken);
    }

    public async Task<AiInsightHistoryResponse> GetInsightHistoryAsync(
        int take,
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        var authContext = await ResolveRelayAuthContextAsync(sourceContext, cancellationToken);
        var normalizedTake = Math.Clamp(take, 1, 100);

        return await RelayAsync<AiInsightHistoryResponse>(
            HttpMethod.Get,
            $"cloud/v1/ai/insights/history?take={normalizedTake}",
            body: null,
            sourceContext,
            endpointName: "insights_history",
            authContext,
            walletCacheKey: null,
            allowCachedWalletFallback: false,
            cancellationToken);
    }

    public async Task<AiChatSessionSummaryResponse> CreateChatSessionAsync(
        AiChatCreateSessionRequest request,
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        var authContext = await ResolveRelayAuthContextAsync(sourceContext, cancellationToken);

        return await RelayAsync<AiChatSessionSummaryResponse>(
            HttpMethod.Post,
            "cloud/v1/ai/chat/sessions",
            request,
            sourceContext,
            endpointName: "chat_create_session",
            authContext,
            walletCacheKey: null,
            allowCachedWalletFallback: false,
            cancellationToken);
    }

    public async Task<AiChatPostMessageResponse> PostChatMessageAsync(
        Guid sessionId,
        AiChatMessageCreateRequest request,
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        var authContext = await ResolveRelayAuthContextAsync(sourceContext, cancellationToken);

        return await RelayAsync<AiChatPostMessageResponse>(
            HttpMethod.Post,
            $"cloud/v1/ai/chat/sessions/{sessionId:D}/messages",
            request,
            sourceContext,
            endpointName: "chat_post_message",
            authContext,
            walletCacheKey: null,
            allowCachedWalletFallback: false,
            cancellationToken);
    }

    public async Task<AiChatSessionDetailResponse> GetChatSessionAsync(
        Guid sessionId,
        int take,
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        var authContext = await ResolveRelayAuthContextAsync(sourceContext, cancellationToken);
        var normalizedTake = Math.Clamp(take, 1, 200);

        return await RelayAsync<AiChatSessionDetailResponse>(
            HttpMethod.Get,
            $"cloud/v1/ai/chat/sessions/{sessionId:D}?take={normalizedTake}",
            body: null,
            sourceContext,
            endpointName: "chat_get_session",
            authContext,
            walletCacheKey: null,
            allowCachedWalletFallback: false,
            cancellationToken);
    }

    public async Task<AiChatHistoryResponse> GetChatHistoryAsync(
        int take,
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        var authContext = await ResolveRelayAuthContextAsync(sourceContext, cancellationToken);
        var normalizedTake = Math.Clamp(take, 1, 100);

        return await RelayAsync<AiChatHistoryResponse>(
            HttpMethod.Get,
            $"cloud/v1/ai/chat/history?take={normalizedTake}",
            body: null,
            sourceContext,
            endpointName: "chat_history",
            authContext,
            walletCacheKey: null,
            allowCachedWalletFallback: false,
            cancellationToken);
    }

    public async Task<AiCheckoutSessionResponse> CreateCheckoutSessionAsync(
        AiCheckoutSessionRequest request,
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        var authContext = await ResolveRelayAuthContextAsync(sourceContext, cancellationToken);

        return await RelayAsync<AiCheckoutSessionResponse>(
            HttpMethod.Post,
            "cloud/v1/ai/payments/checkout",
            request,
            sourceContext,
            endpointName: "payments_checkout",
            authContext,
            walletCacheKey: null,
            allowCachedWalletFallback: false,
            cancellationToken);
    }

    public async Task<AiPaymentHistoryResponse> GetPaymentHistoryAsync(
        int take,
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        var authContext = await ResolveRelayAuthContextAsync(sourceContext, cancellationToken);
        var normalizedTake = Math.Clamp(take, 1, 100);

        return await RelayAsync<AiPaymentHistoryResponse>(
            HttpMethod.Get,
            $"cloud/v1/ai/payments?take={normalizedTake}",
            body: null,
            sourceContext,
            endpointName: "payments_history",
            authContext,
            walletCacheKey: null,
            allowCachedWalletFallback: false,
            cancellationToken);
    }

    private async Task<TResponse> RelayAsync<TResponse>(
        HttpMethod method,
        string relativePath,
        object? body,
        HttpContext sourceContext,
        string endpointName,
        RelayAuthContext authContext,
        string? walletCacheKey,
        bool allowCachedWalletFallback,
        CancellationToken cancellationToken)
    {
        var options = optionsAccessor.Value;
        using var request = BuildCloudRequest(
            method,
            relativePath,
            body,
            sourceContext.Request,
            authContext.LicenseToken,
            authContext.CloudAuthToken,
            options.CloudRelayBaseUrl);
        var httpClient = httpClientFactory.CreateClient(CloudRelayClientName);
        using var timeoutCts = BuildTimeoutCancellationTokenSource(options.CloudRelayTimeoutSeconds, cancellationToken);

        try
        {
            var cloudResponse = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeoutCts.Token);
            var responseBody = cloudResponse.Content is null
                ? string.Empty
                : await cloudResponse.Content.ReadAsStringAsync(timeoutCts.Token);

            if (!cloudResponse.IsSuccessStatusCode)
            {
                if (allowCachedWalletFallback &&
                    (int)cloudResponse.StatusCode >= StatusCodes.Status500InternalServerError &&
                    typeof(TResponse) == typeof(AiWalletResponse) &&
                    TryResolveCachedWallet(walletCacheKey, endpointName, out var cachedWallet))
                {
                    return (TResponse)(object)cachedWallet;
                }

                relayMetrics.RecordRelayFailure(endpointName, $"http_{(int)cloudResponse.StatusCode}");

                if ((int)cloudResponse.StatusCode >= StatusCodes.Status500InternalServerError)
                {
                    throw CreateCloudUnreachableException();
                }

                throw ToCloudErrorException(cloudResponse.StatusCode, responseBody);
            }

            var response = DeserializePayload<TResponse>(responseBody);
            if (allowCachedWalletFallback &&
                typeof(TResponse) == typeof(AiWalletResponse) &&
                response is AiWalletResponse wallet)
            {
                CacheWallet(walletCacheKey, wallet);
            }

            relayMetrics.RecordRelaySuccess(endpointName);
            return response;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            relayMetrics.RecordRelayFailure(endpointName, "timeout");
            if (allowCachedWalletFallback &&
                typeof(TResponse) == typeof(AiWalletResponse) &&
                TryResolveCachedWallet(walletCacheKey, endpointName, out var cachedWallet))
            {
                return (TResponse)(object)cachedWallet;
            }

            throw CreateCloudUnreachableException();
        }
        catch (HttpRequestException)
        {
            relayMetrics.RecordRelayFailure(endpointName, "network_error");
            if (allowCachedWalletFallback &&
                typeof(TResponse) == typeof(AiWalletResponse) &&
                TryResolveCachedWallet(walletCacheKey, endpointName, out var cachedWallet))
            {
                return (TResponse)(object)cachedWallet;
            }

            throw CreateCloudUnreachableException();
        }
    }

    private void CacheWallet(string? walletCacheKey, AiWalletResponse wallet)
    {
        var normalizedCacheKey = NormalizeOptionalValue(walletCacheKey);
        if (string.IsNullOrWhiteSpace(normalizedCacheKey))
        {
            return;
        }

        walletCache.Upsert(normalizedCacheKey, wallet, DateTimeOffset.UtcNow);
    }

    private bool TryResolveCachedWallet(string? walletCacheKey, string endpointName, out AiWalletResponse cachedWallet)
    {
        cachedWallet = default!;
        var normalizedCacheKey = NormalizeOptionalValue(walletCacheKey);
        if (string.IsNullOrWhiteSpace(normalizedCacheKey))
        {
            return false;
        }

        if (!walletCache.TryGet(normalizedCacheKey, out var snapshot))
        {
            return false;
        }

        var maxAgeSeconds = Math.Max(0, optionsAccessor.Value.CloudRelayWalletCacheMaxAgeSeconds);
        var maxAge = TimeSpan.FromSeconds(maxAgeSeconds);
        var age = DateTimeOffset.UtcNow - snapshot.ReceivedAtUtc;
        if (maxAge == TimeSpan.Zero || age > maxAge)
        {
            relayMetrics.RecordCacheExpired(endpointName);
            logger.LogWarning(
                "Cloud AI relay wallet cache expired for endpoint {Endpoint}. Age={AgeSeconds}s, MaxAgeSeconds={MaxAgeSeconds}.",
                endpointName,
                Math.Max(0, (int)Math.Round(age.TotalSeconds)),
                maxAgeSeconds);
            return false;
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<AiWalletResponse>(snapshot.WalletJson, SerializerOptions);
            if (parsed is null)
            {
                walletCache.Remove(normalizedCacheKey);
                return false;
            }

            cachedWallet = parsed;
            relayMetrics.RecordCacheHit(endpointName);
            logger.LogWarning(
                "Using cached cloud AI wallet for endpoint {Endpoint}. Age={AgeSeconds}s.",
                endpointName,
                Math.Max(0, (int)Math.Round(age.TotalSeconds)));
            return true;
        }
        catch
        {
            walletCache.Remove(normalizedCacheKey);
            return false;
        }
    }

    private async Task<RelayAuthContext> ResolveRelayAuthContextAsync(
        HttpContext sourceContext,
        CancellationToken cancellationToken)
    {
        LinkedCloudAuthTokenStatus cloudAuthStatus;
        try
        {
            cloudAuthStatus = await cloudAccountService.GetLinkedAuthTokenStatusAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is InvalidOperationException or CryptographicException or FormatException)
        {
            throw new AiRelayException(
                AiRelayErrorCodes.CloudRelayContextResolutionFailed,
                "Linked cloud account token could not be resolved. Please re-link the cloud account.",
                StatusCodes.Status400BadRequest);
        }

        var licenseToken = NormalizeOptionalValue(licenseService.ResolveLicenseToken(sourceContext));
        if (!cloudAuthStatus.IsLinked)
        {
            throw new AiRelayException(
                AiRelayErrorCodes.CloudRelayContextResolutionFailed,
                "No linked cloud account is available. Link the cloud account and try again.",
                StatusCodes.Status401Unauthorized);
        }

        var cloudAuthToken = NormalizeOptionalValue(cloudAuthStatus.AuthToken);
        if (string.IsNullOrWhiteSpace(cloudAuthToken) || cloudAuthStatus.IsExpired)
        {
            throw new AiRelayException(
                AiRelayErrorCodes.CloudRelayContextResolutionFailed,
                "Linked cloud account session expired. Re-link the cloud account and try again.",
                StatusCodes.Status401Unauthorized);
        }

        return new RelayAuthContext(licenseToken, cloudAuthToken, cloudAuthToken);
    }

    private static HttpRequestMessage BuildCloudRequest(
        HttpMethod method,
        string relativePath,
        object? body,
        HttpRequest sourceRequest,
        string? licenseToken,
        string? cloudAuthToken,
        string baseUrl)
    {
        var normalizedBaseUrl = NormalizeOptionalValue(baseUrl)
            ?? throw new AiRelayException(
                AiRelayErrorCodes.CloudRelayConfigurationError,
                "AI cloud relay base URL is not configured.",
                StatusCodes.Status500InternalServerError);
        var normalizedPath = relativePath.TrimStart('/');
        var requestUri = $"{normalizedBaseUrl.TrimEnd('/')}/{normalizedPath}";

        var request = new HttpRequestMessage(method, requestUri);
        var resolvedIdempotencyKey = NormalizeOptionalValue(
            sourceRequest.Headers[CloudWriteRequestContract.IdempotencyHeaderName]
                .FirstOrDefault());
        if (string.IsNullOrWhiteSpace(resolvedIdempotencyKey))
        {
            resolvedIdempotencyKey = ResolveBodyIdempotencyKey(body);
        }

        if (!string.IsNullOrWhiteSpace(resolvedIdempotencyKey))
        {
            request.Headers.TryAddWithoutValidation(
                CloudWriteRequestContract.IdempotencyHeaderName,
                resolvedIdempotencyKey);
        }

        CopyHeaderIfPresent(sourceRequest, request, CloudWriteRequestContract.PosVersionHeaderName);

        var resolvedDeviceId = sourceRequest.Headers[CloudWriteRequestContract.DeviceIdHeaderName]
            .FirstOrDefault();
        resolvedDeviceId = string.IsNullOrWhiteSpace(resolvedDeviceId)
            ? NormalizeOptionalValue(sourceRequest.Headers[CloudWriteRequestContract.DeviceCodeHeaderName].FirstOrDefault())
            : resolvedDeviceId.Trim();
        if (!string.IsNullOrWhiteSpace(resolvedDeviceId))
        {
            request.Headers.TryAddWithoutValidation(CloudWriteRequestContract.DeviceIdHeaderName, resolvedDeviceId);
            request.Headers.TryAddWithoutValidation(CloudWriteRequestContract.DeviceCodeHeaderName, resolvedDeviceId);
        }

        if (!string.IsNullOrWhiteSpace(licenseToken))
        {
            request.Headers.TryAddWithoutValidation(LicenseTokenHeaderName, licenseToken);
        }

        if (!string.IsNullOrWhiteSpace(cloudAuthToken))
        {
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudAuthToken);
            request.Headers.TryAddWithoutValidation("Cookie", $"{CloudAuthCookieName}={cloudAuthToken}");
        }

        if (body is not null)
        {
            request.Content = new StringContent(
                JsonSerializer.Serialize(body, SerializerOptions),
                Encoding.UTF8,
                "application/json");
        }

        return request;
    }

    private static void CopyHeaderIfPresent(HttpRequest source, HttpRequestMessage target, string headerName)
    {
        var value = source.Headers[headerName].FirstOrDefault()?.Trim();
        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        target.Headers.TryAddWithoutValidation(headerName, value);
    }

    private static string? ResolveBodyIdempotencyKey(object? body)
    {
        return body switch
        {
            AiInsightRequestPayload insightRequest => NormalizeOptionalValue(insightRequest.IdempotencyKey),
            AiCheckoutSessionRequest checkoutRequest => NormalizeOptionalValue(checkoutRequest.IdempotencyKey),
            AiChatMessageCreateRequest chatRequest => NormalizeOptionalValue(chatRequest.IdempotencyKey),
            _ => null
        };
    }

    private static TResponse DeserializePayload<TResponse>(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            throw new AiRelayException(
                AiRelayErrorCodes.CloudRelayUnreachable,
                "Cloud AI relay received an empty response body.",
                StatusCodes.Status503ServiceUnavailable);
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<TResponse>(responseBody, SerializerOptions);
            if (parsed is null)
            {
                throw new InvalidOperationException("Parsed payload was null.");
            }

            return parsed;
        }
        catch (JsonException)
        {
            throw new AiRelayException(
                AiRelayErrorCodes.CloudRelayUnreachable,
                "Cloud AI relay received an invalid response payload.",
                StatusCodes.Status503ServiceUnavailable);
        }
    }

    private static AiRelayException ToCloudErrorException(HttpStatusCode statusCode, string responseBody)
    {
        string? code = null;
        string? message = null;

        if (!string.IsNullOrWhiteSpace(responseBody))
        {
            try
            {
                using var document = JsonDocument.Parse(responseBody);
                if (document.RootElement.ValueKind == JsonValueKind.Object)
                {
                    if (document.RootElement.TryGetProperty("error", out var errorNode) &&
                        errorNode.ValueKind == JsonValueKind.Object)
                    {
                        code = TryResolveStringProperty(errorNode, "code");
                        message = TryResolveStringProperty(errorNode, "message");
                    }

                    code ??= TryResolveStringProperty(document.RootElement, "code");
                    message ??= TryResolveStringProperty(document.RootElement, "message");
                }
            }
            catch (JsonException)
            {
                // Fall through to generic mapping.
            }
        }

        if (string.IsNullOrWhiteSpace(message))
        {
            message = string.IsNullOrWhiteSpace(responseBody)
                ? $"Cloud AI request failed with status {(int)statusCode}."
                : responseBody.Trim();
        }

        return new AiRelayException(
            string.IsNullOrWhiteSpace(code) ? AiRelayErrorCodes.ValidationError : code.Trim(),
            message,
            (int)statusCode);
    }

    private static string? TryResolveStringProperty(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        if (property.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var value = property.GetString();
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static AiRelayException CreateCloudUnreachableException()
    {
        return new AiRelayException(
            AiRelayErrorCodes.CloudRelayUnreachable,
            "Cloud AI service is temporarily unreachable.",
            StatusCodes.Status503ServiceUnavailable);
    }

    private static CancellationTokenSource BuildTimeoutCancellationTokenSource(
        int configuredTimeoutSeconds,
        CancellationToken cancellationToken)
    {
        var timeoutSeconds = Math.Max(1, configuredTimeoutSeconds);
        var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        return cts;
    }

    private static string? BuildWalletCacheKey(string? identityToken)
    {
        var normalizedToken = NormalizeOptionalValue(identityToken);
        if (string.IsNullOrWhiteSpace(normalizedToken))
        {
            return null;
        }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(normalizedToken));
        return Convert.ToHexString(hash);
    }

    private static string? NormalizeOptionalValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private sealed record RelayAuthContext(
        string? LicenseToken,
        string? CloudAuthToken,
        string CacheIdentity);
}

public sealed class AiCreditCloudRelayWalletCache
{
    private readonly ConcurrentDictionary<string, AiCreditCloudRelayWalletSnapshot> snapshots = new(StringComparer.Ordinal);

    public void Upsert(string cacheKey, AiWalletResponse wallet, DateTimeOffset receivedAtUtc)
    {
        var normalizedCacheKey = NormalizeCacheKey(cacheKey);
        var snapshot = new AiCreditCloudRelayWalletSnapshot(
            JsonSerializer.Serialize(wallet),
            receivedAtUtc);
        snapshots[normalizedCacheKey] = snapshot;
    }

    public bool TryGet(string cacheKey, out AiCreditCloudRelayWalletSnapshot snapshot)
    {
        return snapshots.TryGetValue(NormalizeCacheKey(cacheKey), out snapshot);
    }

    public bool Remove(string cacheKey)
    {
        return snapshots.TryRemove(NormalizeCacheKey(cacheKey), out _);
    }

    private static string NormalizeCacheKey(string cacheKey)
    {
        return string.IsNullOrWhiteSpace(cacheKey)
            ? string.Empty
            : cacheKey.Trim();
    }
}

public readonly record struct AiCreditCloudRelayWalletSnapshot(
    string WalletJson,
    DateTimeOffset ReceivedAtUtc);

public sealed class AiCreditCloudRelayMetrics : IDisposable
{
    private readonly Meter meter;
    private readonly Counter<long> relaySuccessCounter;
    private readonly Counter<long> relayFailureCounter;
    private readonly Counter<long> cacheHitCounter;
    private readonly Counter<long> cacheExpiredCounter;

    public AiCreditCloudRelayMetrics()
    {
        meter = new Meter("SmartPos.Ai.Relay", "1.0.0");
        relaySuccessCounter = meter.CreateCounter<long>(
            "ai.relay.success",
            unit: "count",
            description: "Number of successful AI cloud relay calls.");
        relayFailureCounter = meter.CreateCounter<long>(
            "ai.relay.failure",
            unit: "count",
            description: "Number of failed AI cloud relay calls.");
        cacheHitCounter = meter.CreateCounter<long>(
            "ai.relay.cache_hit",
            unit: "count",
            description: "Number of cached wallet fallbacks served.");
        cacheExpiredCounter = meter.CreateCounter<long>(
            "ai.relay.cache_expired",
            unit: "count",
            description: "Number of cache fallback attempts rejected due to staleness.");
    }

    public void RecordRelaySuccess(string endpointName)
    {
        relaySuccessCounter.Add(1, new KeyValuePair<string, object?>("endpoint", Normalize(endpointName)));
    }

    public void RecordRelayFailure(string endpointName, string reason)
    {
        relayFailureCounter.Add(
            1,
            new KeyValuePair<string, object?>("endpoint", Normalize(endpointName)),
            new KeyValuePair<string, object?>("reason", Normalize(reason)));
    }

    public void RecordCacheHit(string endpointName)
    {
        cacheHitCounter.Add(1, new KeyValuePair<string, object?>("endpoint", Normalize(endpointName)));
    }

    public void RecordCacheExpired(string endpointName)
    {
        cacheExpiredCounter.Add(1, new KeyValuePair<string, object?>("endpoint", Normalize(endpointName)));
    }

    public void Dispose()
    {
        meter.Dispose();
    }

    private static string Normalize(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? "unknown" : value.Trim().ToLowerInvariant();
    }
}
