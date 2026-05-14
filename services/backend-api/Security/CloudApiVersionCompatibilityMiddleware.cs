using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Security;

public sealed class CloudApiVersionCompatibilityMiddleware(
    RequestDelegate next,
    IOptions<CloudApiCompatibilityOptions> optionsAccessor)
{
    private readonly CloudApiCompatibilityOptions options = optionsAccessor.Value;

    public async Task InvokeAsync(HttpContext httpContext)
    {
        if (!options.EnforceMinimumSupportedPosVersion ||
            !CloudWriteRequestContract.IsProtectedWrite(httpContext.Request.Path, httpContext.Request.Method))
        {
            await next(httpContext);
            return;
        }

        var providedVersionRaw = httpContext.Request.Headers[CloudWriteRequestContract.PosVersionHeaderName]
            .FirstOrDefault()
            ?.Trim();
        if (!TryParseVersion(providedVersionRaw, out var providedVersion))
        {
            await WriteErrorAsync(
                httpContext,
                "POS_VERSION_INVALID",
                $"Header '{CloudWriteRequestContract.PosVersionHeaderName}' must contain semantic version text like '1.2.3'.",
                StatusCodes.Status400BadRequest);
            return;
        }

        if (!TryParseVersion(options.MinimumSupportedPosVersion, out var minimumVersion))
        {
            await next(httpContext);
            return;
        }

        if (providedVersion.CompareTo(minimumVersion) >= 0)
        {
            await next(httpContext);
            return;
        }

        await WriteErrorAsync(
            httpContext,
            "POS_VERSION_UNSUPPORTED",
            $"POS client version '{providedVersionRaw}' is below minimum supported version '{options.MinimumSupportedPosVersion}'. Upgrade required.",
            StatusCodes.Status426UpgradeRequired);
    }

    private static async Task WriteErrorAsync(
        HttpContext httpContext,
        string code,
        string message,
        int statusCode)
    {
        httpContext.Response.StatusCode = statusCode;
        await httpContext.Response.WriteAsJsonAsync(new LicenseErrorPayload
        {
            Error = new LicenseErrorItem
            {
                Code = code,
                Message = message
            }
        });
    }

    private static bool TryParseVersion(string? rawVersion, out Version value)
    {
        value = new Version(0, 0, 0);
        if (string.IsNullOrWhiteSpace(rawVersion))
        {
            return false;
        }

        var digits = rawVersion
            .Trim()
            .Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Reverse()
            .Select(segment => segment.Trim())
            .FirstOrDefault(segment => segment.Any(char.IsDigit))
            ?? rawVersion.Trim();

        var token = digits;
        if (token.StartsWith("v", StringComparison.OrdinalIgnoreCase))
        {
            token = token[1..];
        }

        var normalized = token
            .Replace('_', '.')
            .Replace("..", ".", StringComparison.Ordinal);
        var firstDigitIndex = normalized.IndexOfAny("0123456789".ToCharArray());
        if (firstDigitIndex < 0)
        {
            return false;
        }

        normalized = normalized[firstDigitIndex..];
        var validChars = new List<char>();
        foreach (var ch in normalized)
        {
            if (char.IsDigit(ch) || ch == '.')
            {
                validChars.Add(ch);
                continue;
            }

            break;
        }

        var versionText = new string(validChars.ToArray()).Trim('.');
        if (string.IsNullOrWhiteSpace(versionText))
        {
            return false;
        }

        var parts = versionText.Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 1)
        {
            versionText = $"{parts[0]}.0.0";
        }
        else if (parts.Length == 2)
        {
            versionText = $"{parts[0]}.{parts[1]}.0";
        }
        else if (parts.Length > 3)
        {
            versionText = $"{parts[0]}.{parts[1]}.{parts[2]}";
        }

        if (!Version.TryParse(versionText, out var parsedVersion) || parsedVersion is null)
        {
            return false;
        }

        value = parsedVersion;
        return true;
    }
}
