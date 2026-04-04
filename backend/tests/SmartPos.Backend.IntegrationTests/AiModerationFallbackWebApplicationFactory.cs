namespace SmartPos.Backend.IntegrationTests;

public sealed class AiModerationFallbackWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["AiInsights:Provider"] = "Local",
            ["AiInsights:EnableOpenAiModeration"] = "true",
            ["AiInsights:FailClosedOnModerationError"] = "false",
            ["AiInsights:ApiBaseUrl"] = "http://127.0.0.1:1",
            ["AiInsights:OpenAiApiKey"] = "integration-test-dummy-key"
        };
    }
}
