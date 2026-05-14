using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Features.CloudAccount;

internal static class CloudAccountRelaySelection
{
    public static bool TryResolve(
        AiInsightOptions aiOptions,
        LicenseOptions licenseOptions,
        out string baseUrl,
        out int timeoutSeconds)
    {
        foreach (var candidate in GetCandidates(aiOptions, licenseOptions))
        {
            if (string.IsNullOrWhiteSpace(candidate.BaseUrl) ||
                !Uri.TryCreate(candidate.BaseUrl, UriKind.Absolute, out var relayUri))
            {
                continue;
            }

            baseUrl = relayUri.ToString().TrimEnd('/');
            timeoutSeconds = Math.Max(1, candidate.TimeoutSeconds);
            return true;
        }

        baseUrl = string.Empty;
        timeoutSeconds = Math.Max(1, Math.Max(aiOptions.CloudRelayTimeoutSeconds, licenseOptions.CloudRelayTimeoutSeconds));
        return false;
    }

    private static IEnumerable<(string? BaseUrl, int TimeoutSeconds)> GetCandidates(
        AiInsightOptions aiOptions,
        LicenseOptions licenseOptions)
    {
        // Prefer the direct backend relay URL when it is available. The account portal
        // surface may proxy these requests, which adds latency and can trip the shorter
        // licensing timeout in split portal/backend deployments.
        yield return (NormalizeOptionalValue(aiOptions.CloudRelayBaseUrl), aiOptions.CloudRelayTimeoutSeconds);
        yield return (NormalizeOptionalValue(licenseOptions.CloudRelayBaseUrl), licenseOptions.CloudRelayTimeoutSeconds);
    }

    private static string? NormalizeOptionalValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
