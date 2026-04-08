using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.IntegrationTests;

public sealed class OpsAlertPublisherTests
{
    [Fact]
    public async Task PublishAsync_WithEnabledWebhook_ShouldSendPayloadAndAuthorizationHeader()
    {
        var handler = new CapturingHttpMessageHandler();
        using var httpClient = new HttpClient(handler);
        var factory = new SingleHttpClientFactory(httpClient);
        var publisher = new WebhookOpsAlertPublisher(
            Options.Create(new LicenseOptions
            {
                OpsAlerts = new OpsAlertDeliveryOptions
                {
                    Enabled = true,
                    WebhookUrl = "https://ops.example.local/alerts",
                    AuthHeaderName = "Authorization",
                    AuthScheme = "Bearer",
                    AuthToken = "test-token",
                    Channel = "platform-ops",
                    SourceSystem = "smartpos-tests",
                    TimeoutSeconds = 5
                }
            }),
            factory,
            NullLogger<WebhookOpsAlertPublisher>.Instance);

        await publisher.PublishAsync(new OpsAlertMessage
        {
            Category = "licensing.validation_spike",
            Severity = "warning",
            Summary = "Validation failures increased.",
            Details = new Dictionary<string, object?>
            {
                ["window_minutes"] = 10,
                ["failure_count"] = 12
            }
        }, CancellationToken.None);

        Assert.Single(handler.Requests);
        var request = handler.Requests[0];
        Assert.Equal(HttpMethod.Post.Method, request.Method);
        Assert.Equal("https://ops.example.local/alerts", request.Uri);
        Assert.True(request.Headers.TryGetValue("Authorization", out var authValue));
        Assert.Equal("Bearer test-token", authValue);

        var body = request.Body;
        using var payload = JsonDocument.Parse(body);
        Assert.Equal("platform-ops", payload.RootElement.GetProperty("channel").GetString());
        Assert.Equal("smartpos-tests", payload.RootElement.GetProperty("source_system").GetString());
        Assert.Equal("licensing.validation_spike", payload.RootElement.GetProperty("category").GetString());
    }

    private sealed class SingleHttpClientFactory(HttpClient httpClient) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
        {
            return httpClient;
        }
    }

    private sealed class CapturingHttpMessageHandler : HttpMessageHandler
    {
        public List<CapturedRequest> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var headers = request.Headers.ToDictionary(
                keyValuePair => keyValuePair.Key,
                keyValuePair => string.Join(",", keyValuePair.Value),
                StringComparer.OrdinalIgnoreCase);
            var body = request.Content is null
                ? string.Empty
                : request.Content.ReadAsStringAsync(cancellationToken).GetAwaiter().GetResult();

            Requests.Add(new CapturedRequest(
                request.Method.Method,
                request.RequestUri?.ToString() ?? string.Empty,
                headers,
                body));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{}")
            });
        }
    }

    private sealed record CapturedRequest(
        string Method,
        string Uri,
        IReadOnlyDictionary<string, string> Headers,
        string Body);
}
