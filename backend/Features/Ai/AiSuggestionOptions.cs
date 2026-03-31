namespace SmartPos.Backend.Features.Ai;

public sealed class AiSuggestionOptions
{
    public const string SectionName = "AiSuggestions";

    public bool Enabled { get; set; } = true;
    public string Provider { get; set; } = "Local";
    public string ApiBaseUrl { get; set; } = "https://api.openai.com/v1";
    public string Model { get; set; } = "gpt-5.4-mini";
    public int RequestTimeoutMs { get; set; } = 12000;
    public string CustomEndpointUrl { get; set; } = string.Empty;
    public string CustomApiKeyHeader { get; set; } = "Authorization";
    public string CustomApiKeyPrefix { get; set; } = "Bearer";
    public string CustomApiKey { get; set; } = string.Empty;
    public string CustomSuggestionField { get; set; } = "suggestion";
}
