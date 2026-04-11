using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiCloudRelayProxyTests : IDisposable
{
    private readonly RelayStubMessageHandler relayHandler = new();
    private readonly RelayWebApplicationFactory appFactory;
    private readonly HttpClient client;

    public AiCloudRelayProxyTests()
    {
        appFactory = new RelayWebApplicationFactory(relayHandler, new Dictionary<string, string?>());
        client = appFactory.CreateClient();
    }

    public void Dispose()
    {
        client.Dispose();
        appFactory.Dispose();
    }

    [Fact]
    public async Task RelayEnabled_Wallet_ShouldProxyToCloudAndReturnCloudPayload()
    {
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.OK, new
        {
            available_credits = 321.50m,
            updated_at = DateTimeOffset.UtcNow
        }));

        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.GetAsync("/api/ai/wallet");
        response.EnsureSuccessStatusCode();

        var payload = await TestJson.ReadObjectAsync(response);
        Assert.Equal(321.50m, TestJson.GetDecimal(payload, "available_credits"));

        Assert.Single(relayHandler.CapturedRequests);
        var relayRequest = relayHandler.CapturedRequests[0];
        Assert.Equal(HttpMethod.Get.Method, relayRequest.Method);
        Assert.EndsWith("/cloud/v1/ai/wallet", relayRequest.PathAndQuery, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("integration-tests-device", relayRequest.Headers["X-Device-Id"]);
        Assert.Equal("it-pos-1.0.0", relayRequest.Headers["X-POS-Version"]);
        Assert.True(relayRequest.Headers.ContainsKey("X-License-Token"));
    }

    [Fact]
    public async Task RelayEnabled_WhenCloudReturnsValidationError_ShouldPassThroughCloudError()
    {
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.BadRequest, new
        {
            error = new
            {
                code = "INSUFFICIENT_CREDITS",
                message = "Insufficient credits. Please top up to continue."
            }
        }));

        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/insights", new
        {
            prompt = "Give me two practical actions for tomorrow.",
            idempotency_key = $"it-ai-relay-error-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected AI relay error payload.");

        Assert.Equal("INSUFFICIENT_CREDITS", payload["error"]?["code"]?.GetValue<string>());
        Assert.Equal("Insufficient credits. Please top up to continue.", payload["error"]?["message"]?.GetValue<string>());
    }

    [Fact]
    public async Task RelayEnabled_WhenCloudUnavailableAndCachedWalletIsFresh_ShouldReturnCachedWallet()
    {
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.OK, new
        {
            available_credits = 44.0m,
            updated_at = DateTimeOffset.UtcNow
        }));
        relayHandler.Enqueue(_ => throw new HttpRequestException("Cloud AI relay unavailable"));

        await TestAuth.SignInAsManagerAsync(client);

        var warmResponse = await client.GetAsync("/api/ai/wallet");
        warmResponse.EnsureSuccessStatusCode();

        var fallbackResponse = await client.GetAsync("/api/ai/wallet");
        fallbackResponse.EnsureSuccessStatusCode();

        var fallbackPayload = await TestJson.ReadObjectAsync(fallbackResponse);
        Assert.Equal(44.0m, TestJson.GetDecimal(fallbackPayload, "available_credits"));
    }

    [Fact]
    public async Task CloudAiRelaySurface_WhenDisabled_ShouldReturnServiceUnavailable()
    {
        var response = await client.GetAsync("/cloud/v1/ai/wallet");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected AI relay guard payload.");
        Assert.Equal("CLOUD_AI_RELAY_DISABLED", payload["error"]?["code"]?.GetValue<string>());
    }

    private static HttpResponseMessage JsonResponse(HttpStatusCode statusCode, object payload)
    {
        return new HttpResponseMessage(statusCode)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json")
        };
    }

    private sealed class RelayWebApplicationFactory(
        RelayStubMessageHandler relayHandler,
        IReadOnlyDictionary<string, string?> overrides)
        : CustomWebApplicationFactory
    {
        protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
        {
            var settings = new Dictionary<string, string?>
            {
                ["AiInsights:CloudRelayEnabled"] = "true",
                ["AiInsights:CloudRelayBaseUrl"] = "https://relay.smartpos.test",
                ["AiInsights:CloudRelayTimeoutSeconds"] = "5",
                ["AiInsights:CloudRelayWalletCacheMaxAgeSeconds"] = "60",
                ["AiInsights:CloudAiRelayEndpointsEnabled"] = "false"
            };

            foreach (var (key, value) in overrides)
            {
                settings[key] = value;
            }

            return settings;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services =>
            {
                services.AddSingleton(relayHandler);
                services.AddHttpClient("cloud-ai-relay")
                    .ConfigurePrimaryHttpMessageHandler(serviceProvider =>
                        serviceProvider.GetRequiredService<RelayStubMessageHandler>());
            });
        }
    }

    private sealed class RelayStubMessageHandler : HttpMessageHandler
    {
        private readonly ConcurrentQueue<Func<HttpRequestMessage, HttpResponseMessage>> responders = new();

        public List<CapturedRelayRequest> CapturedRequests { get; } = [];

        public void Enqueue(Func<HttpRequestMessage, HttpResponseMessage> responder)
        {
            responders.Enqueue(responder);
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var header in request.Headers)
            {
                headers[header.Key] = string.Join(",", header.Value);
            }

            if (request.Content is not null)
            {
                foreach (var header in request.Content.Headers)
                {
                    headers[header.Key] = string.Join(",", header.Value);
                }
            }

            CapturedRequests.Add(new CapturedRelayRequest(
                request.Method.Method,
                request.RequestUri?.PathAndQuery ?? string.Empty,
                headers));

            if (!responders.TryDequeue(out var responder))
            {
                throw new InvalidOperationException("No relay responder was queued.");
            }

            return Task.FromResult(responder(request));
        }
    }

    private sealed record CapturedRelayRequest(
        string Method,
        string PathAndQuery,
        IReadOnlyDictionary<string, string> Headers);
}
