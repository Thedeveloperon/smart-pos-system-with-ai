namespace SmartPos.Backend.IntegrationTests;

public sealed class AiChatIntentPipelineWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["AiInsights:UseIntentPipelineForChatbot"] = "true"
        };
    }
}
