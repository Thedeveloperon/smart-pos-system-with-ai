namespace SmartPos.Backend.IntegrationTests;

public sealed class AiModerationStrictWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["AiInsights:Provider"] = "Local",
            ["AiInsights:EnableOpenAiModeration"] = "true",
            ["AiInsights:FailClosedOnModerationError"] = "true",
            ["AiInsights:ApiBaseUrl"] = "http://127.0.0.1:1",
            ["AiInsights:OpenAiApiKey"] = "integration-test-dummy-key"
        };
    }
}
