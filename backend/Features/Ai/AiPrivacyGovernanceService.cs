using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace SmartPos.Backend.Features.Ai;

public sealed class AiPrivacyGovernanceService(
    IOptions<AiInsightOptions> optionsAccessor,
    ILogger<AiPrivacyGovernanceService> logger)
{
    private readonly AiInsightOptions options = optionsAccessor.Value;
    private readonly IReadOnlyList<CompiledRedactionRule> compiledRules = CompileRules(optionsAccessor.Value.Privacy, logger);
    private readonly HashSet<string> providerPayloadAllowlist = BuildProviderPayloadAllowlist(optionsAccessor.Value.Privacy);

    public string RedactForProvider(string? text)
    {
        return Redact(text);
    }

    public string RedactForStorage(string? text)
    {
        return Redact(text);
    }

    public string RedactForLogPreview(string? text)
    {
        var redacted = Redact(text);
        var maxChars = Math.Clamp(options.Privacy.LogPreviewMaxChars, 40, 512);
        return redacted.Length <= maxChars
            ? redacted
            : $"{redacted[..maxChars].TrimEnd()}...";
    }

    public IReadOnlyDictionary<string, string> FilterProviderPayload(IDictionary<string, string?> source)
    {
        var filtered = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var key in providerPayloadAllowlist)
        {
            if (!source.TryGetValue(key, out var rawValue))
            {
                continue;
            }

            var normalized = (rawValue ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(normalized))
            {
                continue;
            }

            filtered[key] = RedactForProvider(normalized);
        }

        if (filtered.Count == 0)
        {
            throw new InvalidOperationException("AI provider payload is empty after privacy allowlist filtering.");
        }

        return filtered;
    }

    public AiPrivacyPolicySnapshot GetPolicySnapshot()
    {
        var retention = options.Privacy.Retention;
        return new AiPrivacyPolicySnapshot
        {
            PayloadRedactionEnabled = options.Privacy.EnablePayloadRedaction,
            RedactionPlaceholder = string.IsNullOrWhiteSpace(options.Privacy.RedactionPlaceholder)
                ? "[redacted]"
                : options.Privacy.RedactionPlaceholder.Trim(),
            ProviderPayloadAllowlist = providerPayloadAllowlist.OrderBy(x => x, StringComparer.Ordinal).ToList(),
            RetentionEnabled = retention.Enabled,
            ChatMessageRetentionDays = Math.Clamp(retention.ChatMessageRetentionDays, 1, 3650),
            ConversationRetentionDays = Math.Clamp(retention.ConversationRetentionDays, 1, 3650),
            InsightSucceededRetentionDays = Math.Clamp(retention.InsightSucceededRetentionDays, 1, 3650),
            InsightFailedRetentionDays = Math.Clamp(retention.InsightFailedRetentionDays, 1, 3650),
            RedactionRules = compiledRules
                .Select(x => new AiPrivacyRedactionRuleSnapshot
                {
                    Name = x.Name,
                    Enabled = true
                })
                .ToList()
        };
    }

    private string Redact(string? text)
    {
        var normalized = (text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        var privacy = options.Privacy;
        if (!privacy.EnablePayloadRedaction || compiledRules.Count == 0)
        {
            return normalized;
        }

        var output = normalized;
        var fallbackReplacement = string.IsNullOrWhiteSpace(privacy.RedactionPlaceholder)
            ? "[redacted]"
            : privacy.RedactionPlaceholder.Trim();

        foreach (var rule in compiledRules)
        {
            var replacement = string.IsNullOrWhiteSpace(rule.Replacement)
                ? fallbackReplacement
                : rule.Replacement;
            output = rule.Regex.Replace(output, replacement);
        }

        return output;
    }

    private static IReadOnlyList<CompiledRedactionRule> CompileRules(
        AiPrivacyOptions privacyOptions,
        ILogger logger)
    {
        var compiled = new List<CompiledRedactionRule>();
        foreach (var rule in privacyOptions.RedactionRules)
        {
            if (!rule.Enabled)
            {
                continue;
            }

            var name = string.IsNullOrWhiteSpace(rule.Name)
                ? "unnamed_rule"
                : rule.Name.Trim();
            var pattern = (rule.Pattern ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(pattern))
            {
                continue;
            }

            try
            {
                compiled.Add(new CompiledRedactionRule(
                    name,
                    new Regex(pattern, RegexOptions.Compiled | RegexOptions.CultureInvariant),
                    string.IsNullOrWhiteSpace(rule.Replacement) ? null : rule.Replacement.Trim()));
            }
            catch (ArgumentException exception)
            {
                logger.LogWarning(
                    exception,
                    "Skipping invalid AI privacy redaction rule {RuleName}.",
                    name);
            }
        }

        return compiled;
    }

    private static HashSet<string> BuildProviderPayloadAllowlist(AiPrivacyOptions privacyOptions)
    {
        var allowlist = privacyOptions.ProviderPayloadAllowlist
            .Select(x => (x ?? string.Empty).Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        if (allowlist.Count > 0)
        {
            return allowlist;
        }

        return new HashSet<string>(
            ["customer_question", "verified_pos_facts_json", "rules", "output_language"],
            StringComparer.OrdinalIgnoreCase);
    }

    private readonly record struct CompiledRedactionRule(
        string Name,
        Regex Regex,
        string? Replacement);
}

public sealed class AiPrivacyPolicySnapshot
{
    public bool PayloadRedactionEnabled { get; set; }
    public string RedactionPlaceholder { get; set; } = "[redacted]";
    public List<string> ProviderPayloadAllowlist { get; set; } = [];
    public List<AiPrivacyRedactionRuleSnapshot> RedactionRules { get; set; } = [];
    public bool RetentionEnabled { get; set; }
    public int ChatMessageRetentionDays { get; set; }
    public int ConversationRetentionDays { get; set; }
    public int InsightSucceededRetentionDays { get; set; }
    public int InsightFailedRetentionDays { get; set; }
}

public sealed class AiPrivacyRedactionRuleSnapshot
{
    public string Name { get; set; } = string.Empty;
    public bool Enabled { get; set; } = true;
}
