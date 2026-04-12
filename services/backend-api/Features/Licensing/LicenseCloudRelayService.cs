using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Licensing;

public sealed class LicenseCloudRelayService(
    IOptions<LicenseOptions> optionsAccessor,
    IHttpClientFactory httpClientFactory,
    LicenseCloudRelayStatusCache statusCache,
    LicenseCloudRelayMetrics relayMetrics,
    ILogger<LicenseCloudRelayService> logger)
{
    private const string CloudRelayClientName = "cloud-license-relay";
    private const string LicenseTokenHeaderName = "X-License-Token";
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    public bool IsEnabled => optionsAccessor.Value.CloudRelayEnabled;

    public async Task<ProvisionChallengeResponse> CreateActivationChallengeAsync(
        ProvisionChallengeRequest request,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        return await RelayAsync<ProvisionChallengeResponse>(
            HttpMethod.Post,
            "cloud/v1/device/challenge",
            request,
            httpContext,
            "challenge",
            request.DeviceCode,
            licenseToken: null,
            allowCachedStatusFallback: false,
            cancellationToken);
    }

    public async Task<LicenseStatusResponse> ActivateAsync(
        ProvisionActivateRequest request,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var response = await RelayAsync<LicenseStatusResponse>(
            HttpMethod.Post,
            "cloud/v1/device/activate",
            request,
            httpContext,
            "activate",
            request.DeviceCode,
            licenseToken: null,
            allowCachedStatusFallback: false,
            cancellationToken);
        CacheStatus(response, request.DeviceCode);
        return response;
    }

    public async Task<LicenseStatusResponse> GetStatusAsync(
        string deviceCode,
        string? licenseToken,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var response = await RelayAsync<LicenseStatusResponse>(
            HttpMethod.Get,
            $"cloud/v1/license/status?device_code={Uri.EscapeDataString(deviceCode)}",
            body: null,
            httpContext,
            "status",
            deviceCode,
            NormalizeOptionalValue(licenseToken),
            allowCachedStatusFallback: true,
            cancellationToken);
        CacheStatus(response, deviceCode);
        return response;
    }

    public async Task<LicenseStatusResponse> HeartbeatAsync(
        LicenseHeartbeatRequest request,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var response = await RelayAsync<LicenseStatusResponse>(
            HttpMethod.Post,
            "cloud/v1/license/heartbeat",
            request,
            httpContext,
            "heartbeat",
            request.DeviceCode,
            NormalizeOptionalValue(request.LicenseToken),
            allowCachedStatusFallback: true,
            cancellationToken);
        CacheStatus(response, request.DeviceCode);
        return response;
    }

    private async Task<TResponse> RelayAsync<TResponse>(
        HttpMethod method,
        string relativePath,
        object? body,
        HttpContext sourceContext,
        string endpointName,
        string deviceCode,
        string? licenseToken,
        bool allowCachedStatusFallback,
        CancellationToken cancellationToken)
    {
        var options = optionsAccessor.Value;
        using var request = BuildCloudRequest(
            method,
            relativePath,
            body,
            sourceContext.Request,
            deviceCode,
            licenseToken,
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
                if (allowCachedStatusFallback &&
                    (int)cloudResponse.StatusCode >= StatusCodes.Status500InternalServerError)
                {
                    if (typeof(TResponse) == typeof(LicenseStatusResponse) &&
                        TryResolveCachedStatus(deviceCode, endpointName, out var cachedStatus))
                    {
                        return (TResponse)(object)cachedStatus;
                    }

                    relayMetrics.RecordRelayFailure(endpointName, $"http_{(int)cloudResponse.StatusCode}");
                    throw CreateCloudUnreachableException();
                }

                relayMetrics.RecordRelayFailure(endpointName, $"http_{(int)cloudResponse.StatusCode}");
                throw ToCloudErrorException(cloudResponse.StatusCode, responseBody);
            }

            var response = DeserializePayload<TResponse>(responseBody);
            relayMetrics.RecordRelaySuccess(endpointName);
            return response;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            relayMetrics.RecordRelayFailure(endpointName, "timeout");
            if (allowCachedStatusFallback &&
                typeof(TResponse) == typeof(LicenseStatusResponse) &&
                TryResolveCachedStatus(deviceCode, endpointName, out var cachedStatus))
            {
                return (TResponse)(object)cachedStatus;
            }

            throw CreateCloudUnreachableException();
        }
        catch (HttpRequestException)
        {
            relayMetrics.RecordRelayFailure(endpointName, "network_error");
            if (allowCachedStatusFallback &&
                typeof(TResponse) == typeof(LicenseStatusResponse) &&
                TryResolveCachedStatus(deviceCode, endpointName, out var cachedStatus))
            {
                return (TResponse)(object)cachedStatus;
            }

            throw CreateCloudUnreachableException();
        }
    }

    private void CacheStatus(LicenseStatusResponse response, string deviceCode)
    {
        var normalized = NormalizeOptionalValue(deviceCode);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return;
        }

        statusCache.Upsert(normalized, response, DateTimeOffset.UtcNow);
    }

    private bool TryResolveCachedStatus(
        string deviceCode,
        string endpointName,
        out LicenseStatusResponse cachedStatus)
    {
        cachedStatus = default!;
        var normalizedDeviceCode = NormalizeOptionalValue(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            return false;
        }

        if (!statusCache.TryGet(normalizedDeviceCode, out var snapshot))
        {
            return false;
        }

        var maxAgeMinutes = Math.Max(0, optionsAccessor.Value.CloudRelayStatusCacheMaxAgeMinutes);
        var maxAge = TimeSpan.FromMinutes(maxAgeMinutes);
        var age = DateTimeOffset.UtcNow - snapshot.ReceivedAtUtc;
        if (maxAge == TimeSpan.Zero || age > maxAge)
        {
            relayMetrics.RecordCacheExpired(endpointName);
            logger.LogWarning(
                "Cloud relay cache expired for endpoint {Endpoint} and device {DeviceCode}. Age={AgeSeconds}s, MaxAgeMinutes={MaxAgeMinutes}.",
                endpointName,
                normalizedDeviceCode,
                Math.Max(0, (int)Math.Round(age.TotalSeconds)),
                maxAgeMinutes);
            return false;
        }

        try
        {
            cachedStatus = DeserializePayload<LicenseStatusResponse>(snapshot.StatusJson);
            relayMetrics.RecordCacheHit(endpointName);
            logger.LogWarning(
                "Using cached cloud license status for endpoint {Endpoint} and device {DeviceCode}. Age={AgeSeconds}s.",
                endpointName,
                normalizedDeviceCode,
                Math.Max(0, (int)Math.Round(age.TotalSeconds)));
            return true;
        }
        catch
        {
            statusCache.Remove(normalizedDeviceCode);
            return false;
        }
    }

    private static HttpRequestMessage BuildCloudRequest(
        HttpMethod method,
        string relativePath,
        object? body,
        HttpRequest sourceRequest,
        string deviceCode,
        string? licenseToken,
        string baseUrl)
    {
        var normalizedBaseUrl = NormalizeOptionalValue(baseUrl)
            ?? throw new LicenseException(
                LicenseErrorCodes.LicensingConfigurationError,
                "Licensing cloud relay base URL is not configured.",
                StatusCodes.Status500InternalServerError);
        var normalizedPath = relativePath.TrimStart('/');
        var requestUri = $"{normalizedBaseUrl.TrimEnd('/')}/{normalizedPath}";

        var request = new HttpRequestMessage(method, requestUri);
        CopyHeaderIfPresent(sourceRequest, request, CloudWriteRequestContract.IdempotencyHeaderName);
        CopyHeaderIfPresent(sourceRequest, request, CloudWriteRequestContract.PosVersionHeaderName);

        var resolvedDeviceId = sourceRequest.Headers[CloudWriteRequestContract.DeviceIdHeaderName]
            .FirstOrDefault();
        resolvedDeviceId = string.IsNullOrWhiteSpace(resolvedDeviceId)
            ? NormalizeOptionalValue(deviceCode)
            : resolvedDeviceId.Trim();
        if (!string.IsNullOrWhiteSpace(resolvedDeviceId))
        {
            request.Headers.TryAddWithoutValidation(CloudWriteRequestContract.TerminalIdHeaderName, resolvedDeviceId);
            request.Headers.TryAddWithoutValidation(CloudWriteRequestContract.DeviceIdHeaderName, resolvedDeviceId);
            request.Headers.TryAddWithoutValidation(CloudWriteRequestContract.DeviceCodeHeaderName, resolvedDeviceId);
        }

        if (!string.IsNullOrWhiteSpace(licenseToken))
        {
            request.Headers.TryAddWithoutValidation(LicenseTokenHeaderName, licenseToken);
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

    private static TResponse DeserializePayload<TResponse>(string responseBody)
    {
        if (string.IsNullOrWhiteSpace(responseBody))
        {
            throw new LicenseException(
                LicenseErrorCodes.CloudLicenseUnreachable,
                "Cloud licensing relay received an empty response body.",
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
            throw new LicenseException(
                LicenseErrorCodes.CloudLicenseUnreachable,
                "Cloud licensing relay received an invalid response payload.",
                StatusCodes.Status503ServiceUnavailable);
        }
    }

    private static LicenseException ToCloudErrorException(HttpStatusCode statusCode, string responseBody)
    {
        try
        {
            var payload = JsonSerializer.Deserialize<LicenseErrorPayload>(responseBody, SerializerOptions);
            if (!string.IsNullOrWhiteSpace(payload?.Error?.Code) &&
                !string.IsNullOrWhiteSpace(payload.Error.Message))
            {
                return new LicenseException(payload.Error.Code, payload.Error.Message, (int)statusCode);
            }
        }
        catch (JsonException)
        {
            // Fall through to generic mapping.
        }

        var fallbackMessage = string.IsNullOrWhiteSpace(responseBody)
            ? $"Cloud licensing request failed with status {(int)statusCode}."
            : responseBody.Trim();
        return new LicenseException(
            LicenseErrorCodes.CloudLicenseUnreachable,
            fallbackMessage,
            (int)statusCode);
    }

    private static LicenseException CreateCloudUnreachableException()
    {
        return new LicenseException(
            LicenseErrorCodes.CloudLicenseUnreachable,
            "Cloud licensing service is temporarily unreachable.",
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

    private static string? NormalizeOptionalValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}

public sealed class LicenseCloudRelayStatusCache
{
    private readonly ConcurrentDictionary<string, LicenseCloudRelayCachedStatusSnapshot> snapshots = new(StringComparer.OrdinalIgnoreCase);

    public void Upsert(string deviceCode, LicenseStatusResponse response, DateTimeOffset receivedAtUtc)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        var snapshot = new LicenseCloudRelayCachedStatusSnapshot(
            JsonSerializer.Serialize(response),
            receivedAtUtc);
        snapshots[normalizedDeviceCode] = snapshot;
    }

    public bool TryGet(string deviceCode, out LicenseCloudRelayCachedStatusSnapshot snapshot)
    {
        return snapshots.TryGetValue(NormalizeDeviceCode(deviceCode), out snapshot);
    }

    public bool Remove(string deviceCode)
    {
        return snapshots.TryRemove(NormalizeDeviceCode(deviceCode), out _);
    }

    private static string NormalizeDeviceCode(string deviceCode)
    {
        return string.IsNullOrWhiteSpace(deviceCode)
            ? string.Empty
            : deviceCode.Trim();
    }
}

public readonly record struct LicenseCloudRelayCachedStatusSnapshot(
    string StatusJson,
    DateTimeOffset ReceivedAtUtc);

public sealed class LicenseCloudRelayMetrics : IDisposable
{
    private readonly Meter meter;
    private readonly Counter<long> relaySuccessCounter;
    private readonly Counter<long> relayFailureCounter;
    private readonly Counter<long> cacheHitCounter;
    private readonly Counter<long> cacheExpiredCounter;

    public LicenseCloudRelayMetrics()
    {
        meter = new Meter("SmartPos.Licensing.Relay", "1.0.0");
        relaySuccessCounter = meter.CreateCounter<long>(
            "licensing.relay.success",
            unit: "count",
            description: "Number of successful cloud licensing relay calls.");
        relayFailureCounter = meter.CreateCounter<long>(
            "licensing.relay.failure",
            unit: "count",
            description: "Number of failed cloud licensing relay calls.");
        cacheHitCounter = meter.CreateCounter<long>(
            "licensing.relay.cache_hit",
            unit: "count",
            description: "Number of cached license status fallbacks served.");
        cacheExpiredCounter = meter.CreateCounter<long>(
            "licensing.relay.cache_expired",
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
