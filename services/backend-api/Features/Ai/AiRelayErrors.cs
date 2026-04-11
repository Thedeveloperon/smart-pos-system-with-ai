using System.Text.Json.Serialization;

namespace SmartPos.Backend.Features.Ai;

internal sealed class AiRelayException(string code, string message, int statusCode = StatusCodes.Status400BadRequest)
    : Exception(message)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
}

internal sealed class AiRelayErrorPayload
{
    [JsonPropertyName("error")]
    public required AiRelayErrorItem Error { get; set; }
}

internal sealed class AiRelayErrorItem
{
    [JsonPropertyName("code")]
    public required string Code { get; set; }

    [JsonPropertyName("message")]
    public required string Message { get; set; }
}

internal static class AiRelayErrorCodes
{
    public const string ValidationError = "AI_VALIDATION_ERROR";
    public const string CloudRelayDisabled = "CLOUD_AI_RELAY_DISABLED";
    public const string CloudRelayUnreachable = "AI_CREDIT_CLOUD_UNREACHABLE";
    public const string CloudRelayConfigurationError = "AI_CREDIT_CLOUD_RELAY_CONFIGURATION_ERROR";
    public const string CloudRelayContextResolutionFailed = "AI_CLOUD_RELAY_CONTEXT_RESOLUTION_FAILED";
}
