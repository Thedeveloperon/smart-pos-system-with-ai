namespace SmartPos.Backend.IntegrationTests;

public sealed class AiCanaryWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["AiInsights:CanaryOnlyEnabled"] = "true",
            ["AiInsights:CanaryAllowedUsers:0"] = "manager"
        };
    }
}
