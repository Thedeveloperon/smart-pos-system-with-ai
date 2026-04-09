using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Security;

public sealed class DeviceActionProofService(
    SmartPosDbContext dbContext,
    IOptions<LicenseOptions> optionsAccessor,
    ILicensingAlertMonitor alertMonitor)
{
    public const string NonceIdHeaderName = "X-Device-Nonce-Id";
    public const string SignatureHeaderName = "X-Device-Signature";
    public const string TimestampHeaderName = "X-Device-Timestamp";
    public const string DefaultKeyAlgorithm = "ECDSA_P256_SHA256";
    private readonly LicenseOptions options = optionsAccessor.Value;

    public bool RequiresProofForSensitiveActions => options.RequireSensitiveActionDeviceProof;

    public bool ShouldProtectRequest(PathString requestPath, string method)
    {
        if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method))
        {
            return false;
        }

        return options.SensitiveActionProtectedPathPrefixes.Any(prefix =>
            requestPath.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase));
    }

    public bool HasAnyProofHeaders(IHeaderDictionary headers)
    {
        return headers.ContainsKey(NonceIdHeaderName)
               || headers.ContainsKey(SignatureHeaderName)
               || headers.ContainsKey(TimestampHeaderName);
    }

    public async Task<DeviceActionChallengeResponse> CreateChallengeAsync(
        string deviceCode,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            throw new LicenseException(
                LicenseErrorCodes.InvalidDeviceProof,
                "device_code is required for device action challenge.");
        }

        var now = DateTimeOffset.UtcNow;
        var nonceTtlSeconds = Math.Clamp(options.SensitiveActionNonceTtlSeconds, 30, 900);
        var challenge = new DeviceActionChallenge
        {
            DeviceCode = normalizedDeviceCode,
            Nonce = Base64UrlEncode(RandomNumberGenerator.GetBytes(32)),
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddSeconds(nonceTtlSeconds)
        };

        dbContext.DeviceActionChallenges.Add(challenge);
        await dbContext.SaveChangesAsync(cancellationToken);

        return new DeviceActionChallengeResponse
        {
            ChallengeId = challenge.Id.ToString(),
            DeviceCode = normalizedDeviceCode,
            Nonce = challenge.Nonce,
            KeyAlgorithm = DefaultKeyAlgorithm,
            IssuedAt = challenge.CreatedAtUtc,
            ExpiresAt = challenge.ExpiresAtUtc
        };
    }

    public async Task<DeviceActionProofValidationResult> ValidateRequestAsync(
        HttpContext httpContext,
        string deviceCode,
        CancellationToken cancellationToken)
    {
        var normalizedDeviceCode = NormalizeDeviceCode(deviceCode);
        var requestSource = RequestSourceContext.FromHttpContext(httpContext);

        async Task<DeviceActionProofValidationResult> DenyAsync(
            string errorCode,
            string message,
            int statusCode,
            Guid? shopId = null,
            Guid? provisionedDeviceId = null)
        {
            await WriteProofAuditAsync(
                "sensitive_action_proof_failed",
                normalizedDeviceCode,
                errorCode,
                httpContext,
                requestSource,
                shopId,
                provisionedDeviceId,
                cancellationToken);
            alertMonitor.RecordSecurityAnomaly(BuildProofFailureReason(errorCode, requestSource));

            return DeviceActionProofValidationResult.Deny(errorCode, message, statusCode);
        }

        if (string.IsNullOrWhiteSpace(normalizedDeviceCode))
        {
            return await DenyAsync(
                LicenseErrorCodes.InvalidDeviceProof,
                "Device proof validation requires device_code.",
                StatusCodes.Status403Forbidden);
        }

        var nonceIdRaw = httpContext.Request.Headers[NonceIdHeaderName].FirstOrDefault()?.Trim();
        var signatureRaw = httpContext.Request.Headers[SignatureHeaderName].FirstOrDefault()?.Trim();
        var timestampRaw = httpContext.Request.Headers[TimestampHeaderName].FirstOrDefault()?.Trim();
        if (string.IsNullOrWhiteSpace(nonceIdRaw) ||
            string.IsNullOrWhiteSpace(signatureRaw) ||
            string.IsNullOrWhiteSpace(timestampRaw))
        {
            return await DenyAsync(
                LicenseErrorCodes.InvalidDeviceProof,
                "Device proof headers are incomplete.",
                StatusCodes.Status400BadRequest);
        }

        if (!Guid.TryParse(nonceIdRaw, out var nonceId))
        {
            return await DenyAsync(
                LicenseErrorCodes.InvalidDeviceProof,
                "X-Device-Nonce-Id is invalid.",
                StatusCodes.Status400BadRequest);
        }

        if (!long.TryParse(timestampRaw, out var timestampUnix))
        {
            return await DenyAsync(
                LicenseErrorCodes.InvalidDeviceProof,
                "X-Device-Timestamp is invalid.",
                StatusCodes.Status400BadRequest);
        }

        var now = DateTimeOffset.UtcNow;
        var requestTime = DateTimeOffset.FromUnixTimeSeconds(timestampUnix);
        var toleranceSeconds = Math.Clamp(options.SensitiveActionTimestampToleranceSeconds, 30, 900);
        if (Math.Abs((now - requestTime).TotalSeconds) > toleranceSeconds)
        {
            return await DenyAsync(
                LicenseErrorCodes.InvalidDeviceProof,
                "Device proof timestamp is outside the allowed window.",
                StatusCodes.Status403Forbidden);
        }

        var challenge = await dbContext.DeviceActionChallenges
            .FirstOrDefaultAsync(x => x.Id == nonceId, cancellationToken);
        if (challenge is null)
        {
            return await DenyAsync(
                LicenseErrorCodes.InvalidDeviceProof,
                "Device action challenge is unknown.",
                StatusCodes.Status403Forbidden);
        }

        if (!string.Equals(challenge.DeviceCode, normalizedDeviceCode, StringComparison.Ordinal))
        {
            return await DenyAsync(
                LicenseErrorCodes.InvalidDeviceProof,
                "Device action challenge does not belong to this device.",
                StatusCodes.Status403Forbidden);
        }

        if (challenge.ConsumedAtUtc.HasValue)
        {
            return await DenyAsync(
                LicenseErrorCodes.ChallengeConsumed,
                "Device action challenge was already used.",
                StatusCodes.Status409Conflict);
        }

        if (challenge.ExpiresAtUtc < now)
        {
            return await DenyAsync(
                LicenseErrorCodes.ChallengeExpired,
                "Device action challenge has expired.",
                StatusCodes.Status403Forbidden);
        }

        var provisionedDevice = await dbContext.ProvisionedDevices
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.DeviceCode == normalizedDeviceCode, cancellationToken);
        if (provisionedDevice is null ||
            string.IsNullOrWhiteSpace(provisionedDevice.DevicePublicKeySpki) ||
            string.IsNullOrWhiteSpace(provisionedDevice.DeviceKeyFingerprint))
        {
            return await DenyAsync(
                LicenseErrorCodes.DeviceKeyMismatch,
                "Device key binding is missing for sensitive action proof validation.",
                StatusCodes.Status403Forbidden,
                provisionedDevice?.ShopId,
                provisionedDevice?.Id);
        }

        byte[] signatureBytes;
        byte[] publicKeySpkiBytes;
        try
        {
            signatureBytes = Base64UrlDecode(signatureRaw);
            publicKeySpkiBytes = Base64UrlDecode(provisionedDevice.DevicePublicKeySpki);
        }
        catch (FormatException)
        {
            return await DenyAsync(
                LicenseErrorCodes.InvalidDeviceProof,
                "Device proof signature or public key format is invalid.",
                StatusCodes.Status400BadRequest,
                provisionedDevice.ShopId,
                provisionedDevice.Id);
        }

        var bodyHash = await ComputeRequestBodyHashAsync(httpContext.Request, cancellationToken);
        var pathAndQuery = $"{httpContext.Request.Path}{httpContext.Request.QueryString}";
        var payload = BuildRequestProofPayload(
            challenge.Id,
            challenge.Nonce,
            normalizedDeviceCode,
            timestampUnix,
            httpContext.Request.Method,
            pathAndQuery,
            bodyHash);
        var payloadBytes = Encoding.UTF8.GetBytes(payload);

        if (!VerifyDeviceSignature(payloadBytes, signatureBytes, publicKeySpkiBytes))
        {
            return await DenyAsync(
                LicenseErrorCodes.InvalidDeviceProof,
                "Device proof signature validation failed.",
                StatusCodes.Status403Forbidden,
                provisionedDevice.ShopId,
                provisionedDevice.Id);
        }

        challenge.ConsumedAtUtc = now;
        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            Action = "sensitive_action_proof_verified",
            Actor = "device-proof",
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = normalizedDeviceCode,
                method = httpContext.Request.Method,
                path = $"{httpContext.Request.Path}{httpContext.Request.QueryString}",
                source_ip = requestSource.SourceIp,
                source_ip_prefix = requestSource.SourceIpPrefix,
                source_forwarded_for = requestSource.ForwardedFor,
                source_user_agent = requestSource.UserAgent,
                source_user_agent_family = requestSource.UserAgentFamily,
                source_fingerprint = requestSource.SourceFingerprint
            })
        });
        await dbContext.SaveChangesAsync(cancellationToken);
        return DeviceActionProofValidationResult.Allow();
    }

    private async Task WriteProofAuditAsync(
        string action,
        string deviceCode,
        string? errorCode,
        HttpContext httpContext,
        RequestSourceContext requestSource,
        Guid? shopId,
        Guid? provisionedDeviceId,
        CancellationToken cancellationToken)
    {
        dbContext.LicenseAuditLogs.Add(new LicenseAuditLog
        {
            ShopId = shopId,
            ProvisionedDeviceId = provisionedDeviceId,
            Action = action,
            Actor = "device-proof",
            Reason = errorCode,
            MetadataJson = JsonSerializer.Serialize(new
            {
                device_code = string.IsNullOrWhiteSpace(deviceCode) ? null : deviceCode,
                method = httpContext.Request.Method,
                path = $"{httpContext.Request.Path}{httpContext.Request.QueryString}",
                error_code = errorCode,
                source_ip = requestSource.SourceIp,
                source_ip_prefix = requestSource.SourceIpPrefix,
                source_forwarded_for = requestSource.ForwardedFor,
                source_user_agent = requestSource.UserAgent,
                source_user_agent_family = requestSource.UserAgentFamily,
                source_fingerprint = requestSource.SourceFingerprint
            })
        });

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static string BuildProofFailureReason(string errorCode, RequestSourceContext requestSource)
    {
        var normalizedCode = string.IsNullOrWhiteSpace(errorCode)
            ? "unknown"
            : errorCode.Trim().ToLowerInvariant();
        var sourceKey = !string.IsNullOrWhiteSpace(requestSource.SourceFingerprint)
            ? requestSource.SourceFingerprint!.ToLowerInvariant()
            : !string.IsNullOrWhiteSpace(requestSource.SourceIpPrefix)
                ? requestSource.SourceIpPrefix!.ToLowerInvariant()
                : "unknown_source";

        return $"device_proof_failed:{normalizedCode}:{sourceKey}";
    }

    internal static string BuildRequestProofPayload(
        Guid nonceId,
        string nonce,
        string deviceCode,
        long timestampUnix,
        string method,
        string pathAndQuery,
        string bodyHash)
    {
        var normalizedPath = string.IsNullOrWhiteSpace(pathAndQuery) ? "/" : pathAndQuery.Trim();
        return $"smartpos.api.request|{nonceId:N}|{nonce}|{NormalizeDeviceCode(deviceCode)}|{timestampUnix}|{method.ToUpperInvariant()}|{normalizedPath}|{bodyHash.ToLowerInvariant()}";
    }

    private static async Task<string> ComputeRequestBodyHashAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        request.EnableBuffering();
        using var buffer = new MemoryStream();
        await request.Body.CopyToAsync(buffer, cancellationToken);
        request.Body.Position = 0;
        var hash = SHA256.HashData(buffer.ToArray());
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static bool VerifyDeviceSignature(
        byte[] payloadBytes,
        byte[] signatureBytes,
        byte[] publicKeySpkiBytes)
    {
        try
        {
            using var ecdsa = ECDsa.Create();
            ecdsa.ImportSubjectPublicKeyInfo(publicKeySpkiBytes, out _);
            return VerifySignatureWithFormat(
                       ecdsa,
                       payloadBytes,
                       signatureBytes,
                       DSASignatureFormat.Rfc3279DerSequence)
                   || VerifySignatureWithFormat(
                       ecdsa,
                       payloadBytes,
                       signatureBytes,
                       DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
        }
        catch (CryptographicException)
        {
            return false;
        }
    }

    private static bool VerifySignatureWithFormat(
        ECDsa ecdsa,
        byte[] payloadBytes,
        byte[] signatureBytes,
        DSASignatureFormat signatureFormat)
    {
        try
        {
            return ecdsa.VerifyData(
                payloadBytes,
                signatureBytes,
                HashAlgorithmName.SHA256,
                signatureFormat);
        }
        catch (CryptographicException)
        {
            return false;
        }
    }

    private static string NormalizeDeviceCode(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Trim();
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        var padding = 4 - (normalized.Length % 4);
        if (padding is > 0 and < 4)
        {
            normalized += new string('=', padding);
        }

        return Convert.FromBase64String(normalized);
    }
}

public sealed record DeviceActionProofValidationResult(
    bool Success,
    string? ErrorCode,
    string? Message,
    int StatusCode)
{
    public static DeviceActionProofValidationResult Allow()
        => new(true, null, null, StatusCodes.Status200OK);

    public static DeviceActionProofValidationResult Deny(string errorCode, string message, int statusCode)
        => new(false, errorCode, message, statusCode);
}
