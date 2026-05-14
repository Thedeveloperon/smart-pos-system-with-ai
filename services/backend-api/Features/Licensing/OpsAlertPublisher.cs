using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace SmartPos.Backend.Features.Licensing;

public sealed class OpsAlertMessage
{
    public string Category { get; set; } = string.Empty;
    public string Severity { get; set; } = "warning";
    public string Summary { get; set; } = string.Empty;
    public DateTimeOffset OccurredAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public Dictionary<string, object?> Details { get; set; } = [];
}

public interface IOpsAlertPublisher
{
    bool IsEnabled { get; }
    Task PublishAsync(OpsAlertMessage message, CancellationToken cancellationToken);
}

public sealed class WebhookOpsAlertPublisher(
    IOptions<LicenseOptions> optionsAccessor,
    IHttpClientFactory httpClientFactory,
    ILogger<WebhookOpsAlertPublisher> logger)
    : IOpsAlertPublisher
{
    private readonly LicenseOptions options = optionsAccessor.Value;
    private const string HttpClientName = "ops-alert-delivery";

    public bool IsEnabled => options.OpsAlerts.Enabled &&
                             !string.IsNullOrWhiteSpace(options.OpsAlerts.WebhookUrl);

    public async Task PublishAsync(OpsAlertMessage message, CancellationToken cancellationToken)
    {
        if (!IsEnabled)
        {
            return;
        }

        var webhookUrl = options.OpsAlerts.WebhookUrl.Trim();
        if (!Uri.TryCreate(webhookUrl, UriKind.Absolute, out var webhookUri))
        {
            logger.LogWarning("Ops alert webhook URL is invalid and alerts are not sent.");
            return;
        }

        var payload = new
        {
            source_system = options.OpsAlerts.SourceSystem,
            channel = options.OpsAlerts.Channel,
            category = message.Category,
            severity = message.Severity,
            summary = message.Summary,
            occurred_at = message.OccurredAtUtc,
            details = message.Details
        };

        try
        {
            var json = JsonSerializer.Serialize(payload);
            using var request = new HttpRequestMessage(HttpMethod.Post, webhookUri)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };

            ApplyAuthHeaders(request);

            var timeoutSeconds = Math.Clamp(options.OpsAlerts.TimeoutSeconds, 2, 60);
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));

            var client = httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.SendAsync(request, timeoutCts.Token);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "Ops alert delivery failed with status {StatusCode} for category {Category}.",
                    (int)response.StatusCode,
                    message.Category);
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(
                "Ops alert delivery timed out for category {Category}.",
                message.Category);
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "Ops alert delivery failed for category {Category}.",
                message.Category);
        }
    }

    private void ApplyAuthHeaders(HttpRequestMessage request)
    {
        var envVarName = (options.OpsAlerts.AuthTokenEnvironmentVariable ?? string.Empty).Trim();
        var tokenFromEnvironment = string.IsNullOrWhiteSpace(envVarName)
            ? null
            : Environment.GetEnvironmentVariable(envVarName);
        var configuredToken = (options.OpsAlerts.AuthToken ?? string.Empty).Trim();
        var token = string.IsNullOrWhiteSpace(tokenFromEnvironment)
            ? configuredToken
            : tokenFromEnvironment.Trim();

        if (string.IsNullOrWhiteSpace(token))
        {
            return;
        }

        var headerName = string.IsNullOrWhiteSpace(options.OpsAlerts.AuthHeaderName)
            ? "Authorization"
            : options.OpsAlerts.AuthHeaderName.Trim();
        var authScheme = (options.OpsAlerts.AuthScheme ?? string.Empty).Trim();
        var headerValue = string.Equals(headerName, "Authorization", StringComparison.OrdinalIgnoreCase) &&
                          !string.IsNullOrWhiteSpace(authScheme)
            ? $"{authScheme} {token}"
            : token;

        request.Headers.Remove(headerName);
        request.Headers.TryAddWithoutValidation(headerName, headerValue);
    }
}

public sealed class NoOpOpsAlertPublisher : IOpsAlertPublisher
{
    public static NoOpOpsAlertPublisher Instance { get; } = new();

    public bool IsEnabled => false;

    public Task PublishAsync(OpsAlertMessage message, CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }
}
