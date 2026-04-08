using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Security;

public static class CloudWriteRequestContract
{
    public const string IdempotencyHeaderName = "Idempotency-Key";
    public const string DeviceIdHeaderName = "X-Device-Id";
    public const string DeviceCodeHeaderName = "X-Device-Code";
    public const string PosVersionHeaderName = "X-POS-Version";

    public static bool IsProtectedWrite(PathString path, string method)
    {
        if (!(HttpMethods.IsPost(method) ||
              HttpMethods.IsPut(method) ||
              HttpMethods.IsPatch(method) ||
              HttpMethods.IsDelete(method)))
        {
            return false;
        }

        return path.StartsWithSegments("/api/provision/challenge", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/provision/activate", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/provision/deactivate", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/license/heartbeat", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/cloud/v1/device/challenge", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/cloud/v1/device/activate", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/cloud/v1/device/deactivate", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/cloud/v1/license/heartbeat", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/security/challenge", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/ai/insights", StringComparison.OrdinalIgnoreCase)
               || path.StartsWithSegments("/api/ai/chat/sessions", StringComparison.OrdinalIgnoreCase);
    }

    public static bool TryResolveHeaders(
        HttpContext httpContext,
        out CloudWriteRequestHeaders headers,
        out (int StatusCode, LicenseErrorPayload Payload) error)
    {
        headers = default;
        error = default;

        var idempotencyKey = httpContext.Request.Headers[IdempotencyHeaderName]
            .FirstOrDefault()
            ?.Trim();
        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            error = BuildError(
                "IDEMPOTENCY_KEY_REQUIRED",
                $"Header '{IdempotencyHeaderName}' is required.",
                StatusCodes.Status400BadRequest);
            return false;
        }

        if (idempotencyKey.Length > 128)
        {
            error = BuildError(
                "IDEMPOTENCY_KEY_INVALID",
                $"Header '{IdempotencyHeaderName}' must be 128 characters or less.",
                StatusCodes.Status400BadRequest);
            return false;
        }

        var deviceId = httpContext.Request.Headers[DeviceIdHeaderName]
            .FirstOrDefault()
            ?.Trim();
        if (string.IsNullOrWhiteSpace(deviceId))
        {
            error = BuildError(
                "DEVICE_ID_REQUIRED",
                $"Header '{DeviceIdHeaderName}' is required.",
                StatusCodes.Status400BadRequest);
            return false;
        }

        if (deviceId.Length > 128)
        {
            error = BuildError(
                "DEVICE_ID_INVALID",
                $"Header '{DeviceIdHeaderName}' must be 128 characters or less.",
                StatusCodes.Status400BadRequest);
            return false;
        }

        var posVersion = httpContext.Request.Headers[PosVersionHeaderName]
            .FirstOrDefault()
            ?.Trim();
        if (string.IsNullOrWhiteSpace(posVersion))
        {
            error = BuildError(
                "POS_VERSION_REQUIRED",
                $"Header '{PosVersionHeaderName}' is required.",
                StatusCodes.Status400BadRequest);
            return false;
        }

        if (posVersion.Length > 64)
        {
            error = BuildError(
                "POS_VERSION_INVALID",
                $"Header '{PosVersionHeaderName}' must be 64 characters or less.",
                StatusCodes.Status400BadRequest);
            return false;
        }

        headers = new CloudWriteRequestHeaders(
            idempotencyKey,
            deviceId,
            posVersion,
            BuildEndpointKey(httpContext.Request.Method, httpContext.Request.Path));
        return true;
    }

    public static void EnsureLegacyDeviceCodeHeader(HttpContext httpContext, string deviceId)
    {
        httpContext.Request.Headers[DeviceCodeHeaderName] = deviceId;
    }

    public static string BuildEndpointKey(string method, PathString path)
    {
        var normalizedPath = (path.Value ?? string.Empty).Trim().ToLowerInvariant();
        return $"{method.ToUpperInvariant()}:{normalizedPath}";
    }

    private static (int StatusCode, LicenseErrorPayload Payload) BuildError(
        string code,
        string message,
        int statusCode)
    {
        return (
            statusCode,
            new LicenseErrorPayload
            {
                Error = new LicenseErrorItem
                {
                    Code = code,
                    Message = message
                }
            });
    }
}

public readonly record struct CloudWriteRequestHeaders(
    string IdempotencyKey,
    string DeviceId,
    string PosVersion,
    string EndpointKey);
