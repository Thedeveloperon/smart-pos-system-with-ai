namespace SmartPos.Backend.IntegrationTests;

public sealed class AiOpenAiFailureWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["AiInsights:Provider"] = "OpenAI",
            ["AiInsights:Model"] = "gpt-5.4-mini",
            ["AiInsights:OpenAiApiKey"] = "",
            ["AiInsights:OpenAiApiKeyEnvironmentVariable"] = "OPENAI_API_KEY_TEST_UNSET_2026_04_03",
            ["AiInsights:EnableOpenAiModeration"] = "false"
        };
    }
}
