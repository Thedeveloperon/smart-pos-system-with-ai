using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace SmartPos.Backend.Security;

public sealed class RequestSourceContext
{
    public string? SourceIp { get; init; }
    public string? ForwardedFor { get; init; }
    public string? SourceIpPrefix { get; init; }
    public string? UserAgent { get; init; }
    public string? UserAgentFamily { get; init; }
    public string? SourceFingerprint { get; init; }

    public static RequestSourceContext FromHttpContext(HttpContext? httpContext)
    {
        var forwardedForRaw = NormalizeOptionalValue(httpContext?.Request.Headers["X-Forwarded-For"].FirstOrDefault());
        var forwardedPrimary = ExtractForwardedPrimaryIp(forwardedForRaw);
        var remoteIp = NormalizeOptionalValue(httpContext?.Connection.RemoteIpAddress?.ToString());
        var sourceIp = string.IsNullOrWhiteSpace(forwardedPrimary) ? remoteIp : forwardedPrimary;
        var sourceIpPrefix = ComputeIpPrefix(sourceIp);
        var userAgent = NormalizeOptionalValue(httpContext?.Request.Headers.UserAgent.ToString());
        var userAgentFamily = ResolveUserAgentFamily(userAgent);
        var sourceFingerprint = BuildSourceFingerprint(sourceIpPrefix, userAgentFamily);

        return new RequestSourceContext
        {
            SourceIp = sourceIp,
            ForwardedFor = forwardedForRaw,
            SourceIpPrefix = sourceIpPrefix,
            UserAgent = userAgent,
            UserAgentFamily = userAgentFamily,
            SourceFingerprint = sourceFingerprint
        };
    }

    private static string? ExtractForwardedPrimaryIp(string? forwardedFor)
    {
        if (string.IsNullOrWhiteSpace(forwardedFor))
        {
            return null;
        }

        var first = forwardedFor
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault();
        return NormalizeOptionalValue(first);
    }

    private static string? ComputeIpPrefix(string? sourceIp)
    {
        if (string.IsNullOrWhiteSpace(sourceIp) || !IPAddress.TryParse(sourceIp, out var ipAddress))
        {
            return null;
        }

        var bytes = ipAddress.GetAddressBytes();
        if (bytes.Length == 4)
        {
            return $"{bytes[0]}.{bytes[1]}.{bytes[2]}.0/24";
        }

        if (bytes.Length == 16)
        {
            return $"{bytes[0]:x2}{bytes[1]:x2}:{bytes[2]:x2}{bytes[3]:x2}:{bytes[4]:x2}{bytes[5]:x2}:{bytes[6]:x2}{bytes[7]:x2}::/64";
        }

        return null;
    }

    private static string? ResolveUserAgentFamily(string? userAgent)
    {
        var normalized = NormalizeOptionalValue(userAgent)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Contains("electron", StringComparison.Ordinal))
        {
            return "electron";
        }

        if (normalized.Contains("edg/", StringComparison.Ordinal) || normalized.Contains("edge/", StringComparison.Ordinal))
        {
            return "edge";
        }

        if (normalized.Contains("chrome/", StringComparison.Ordinal))
        {
            return "chrome";
        }

        if (normalized.Contains("firefox/", StringComparison.Ordinal))
        {
            return "firefox";
        }

        if (normalized.Contains("safari/", StringComparison.Ordinal) &&
            !normalized.Contains("chrome/", StringComparison.Ordinal))
        {
            return "safari";
        }

        if (normalized.Contains("postman", StringComparison.Ordinal))
        {
            return "postman";
        }

        return "other";
    }

    private static string? BuildSourceFingerprint(string? ipPrefix, string? userAgentFamily)
    {
        if (string.IsNullOrWhiteSpace(ipPrefix) && string.IsNullOrWhiteSpace(userAgentFamily))
        {
            return null;
        }

        var payload = $"{ipPrefix ?? "unknown"}|{userAgentFamily ?? "unknown"}";
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexString(digest).ToLowerInvariant()[..16];
    }

    private static string? NormalizeOptionalValue(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Trim();
        return normalized.Length > 500 ? normalized[..500] : normalized;
    }
}
