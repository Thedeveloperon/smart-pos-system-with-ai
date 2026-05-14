using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

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
        await SeedLinkedCloudAccountAsync();

        await TestAuth.SignInAsManagerAsync(client);

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/ai/wallet");
        request.Headers.Add("X-License-Token", "local-offline-license-token-it");

        var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();

        var payload = await TestJson.ReadObjectAsync(response);
        Assert.Equal(321.50m, TestJson.GetDecimal(payload, "available_credits"));

        Assert.Single(relayHandler.CapturedRequests);
        var relayRequest = relayHandler.CapturedRequests[0];
        Assert.Equal(HttpMethod.Get.Method, relayRequest.Method);
        Assert.EndsWith("/cloud/v1/ai/wallet", relayRequest.PathAndQuery, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("integration-tests-device", relayRequest.Headers["X-Device-Id"]);
        Assert.Equal("it-pos-1.0.0", relayRequest.Headers["X-POS-Version"]);
        Assert.False(relayRequest.Headers.ContainsKey("X-License-Token"));
    }

    [Fact]
    public async Task RelayEnabled_WhenCloudLicensingRelayIsEnabled_ShouldForwardLicenseToken()
    {
        using var cloudCompatibleFactory = new RelayWebApplicationFactory(
            relayHandler,
            new Dictionary<string, string?>
            {
                ["Licensing:Mode"] = "CloudCompatible",
                ["Licensing:CloudLicensingEndpointsEnabled"] = "true",
                ["Licensing:CloudRelayEnabled"] = "true",
                ["Licensing:CloudRelayBaseUrl"] = "https://relay.smartpos.test"
            });
        using var cloudCompatibleClient = cloudCompatibleFactory.CreateClient();

        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.OK, new
        {
            available_credits = 12.0m,
            updated_at = DateTimeOffset.UtcNow
        }));
        await SeedLinkedCloudAccountAsync(factory: cloudCompatibleFactory);
        var signInResponse = await cloudCompatibleClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = "manager",
            password = "manager123",
            device_code = "integration-tests-device",
            device_name = "Integration Tests"
        });
        signInResponse.EnsureSuccessStatusCode();

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/ai/wallet");
        request.Headers.Add("X-License-Token", "cloud-license-token-it");

        var response = await cloudCompatibleClient.SendAsync(request);
        response.EnsureSuccessStatusCode();

        Assert.Single(relayHandler.CapturedRequests);
        var relayRequest = relayHandler.CapturedRequests[0];
        Assert.Equal("cloud-license-token-it", relayRequest.Headers["X-License-Token"]);
    }

    [Fact]
    public async Task RelayEnabled_WhenCloudReturnsValidationError_ShouldPassThroughCloudError()
    {
        var idempotencyKey = $"it-ai-relay-error-{Guid.NewGuid():N}";
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.BadRequest, new
        {
            error = new
            {
                code = "INSUFFICIENT_CREDITS",
                message = "Insufficient credits. Please top up to continue."
            }
        }));
        await SeedLinkedCloudAccountAsync();

        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/insights", new
        {
            prompt = "Give me two practical actions for tomorrow.",
            idempotency_key = idempotencyKey
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected AI relay error payload.");

        Assert.Equal("INSUFFICIENT_CREDITS", payload["error"]?["code"]?.GetValue<string>());
        Assert.Equal("Insufficient credits. Please top up to continue.", payload["error"]?["message"]?.GetValue<string>());
        Assert.Single(relayHandler.CapturedRequests);
        var relayRequest = relayHandler.CapturedRequests[0];
        Assert.True(relayRequest.Headers.ContainsKey("Idempotency-Key"));
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
        await SeedLinkedCloudAccountAsync();

        await TestAuth.SignInAsManagerAsync(client);

        var warmResponse = await client.GetAsync("/api/ai/wallet");
        warmResponse.EnsureSuccessStatusCode();

        var fallbackResponse = await client.GetAsync("/api/ai/wallet");
        fallbackResponse.EnsureSuccessStatusCode();

        var fallbackPayload = await TestJson.ReadObjectAsync(fallbackResponse);
        Assert.Equal(44.0m, TestJson.GetDecimal(fallbackPayload, "available_credits"));
    }

    [Fact]
    public async Task RelayEnabled_WhenCloudAccountIsLinked_ShouldForwardCloudAuthToken()
    {
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.OK, new
        {
            available_credits = 12.0m,
            updated_at = DateTimeOffset.UtcNow
        }));

        await SeedLinkedCloudAccountAsync();

        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.GetAsync("/api/ai/wallet");
        response.EnsureSuccessStatusCode();

        Assert.Single(relayHandler.CapturedRequests);
        var relayRequest = relayHandler.CapturedRequests[0];
        Assert.Equal("Bearer cloud-auth-token-it", relayRequest.Headers["Authorization"]);
        Assert.Equal("smartpos_auth=cloud-auth-token-it", relayRequest.Headers["Cookie"]);
    }

    [Fact]
    public async Task RelayEnabled_WhenCloudAccountIsNotLinked_ShouldReturnActionableReLinkError()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.GetAsync("/api/ai/wallet");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected AI relay error payload.");
        Assert.Equal("AI_CLOUD_RELAY_CONTEXT_RESOLUTION_FAILED", payload["error"]?["code"]?.GetValue<string>());
        Assert.Equal("No linked cloud account is available. Link the cloud account and try again.", payload["error"]?["message"]?.GetValue<string>());
        Assert.Empty(relayHandler.CapturedRequests);
    }

    [Fact]
    public async Task RelayEnabled_WhenCloudAccountSessionIsExpired_ShouldReturnActionableReLinkError()
    {
        await SeedLinkedCloudAccountAsync(expiresAtUtc: DateTimeOffset.UtcNow.AddSeconds(-5));
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.GetAsync("/api/ai/wallet");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected AI relay error payload.");
        Assert.Equal("AI_CLOUD_RELAY_CONTEXT_RESOLUTION_FAILED", payload["error"]?["code"]?.GetValue<string>());
        Assert.Equal("Linked cloud account session expired. Re-link the cloud account and try again.", payload["error"]?["message"]?.GetValue<string>());
        Assert.Empty(relayHandler.CapturedRequests);
    }

    [Fact]
    public async Task RelayEnabled_ChatMessageStream_ShouldProxySseFromCloud()
    {
        relayHandler.Enqueue(_ =>
        {
            var content = new StringContent(
                """
                data: {"type":"start","assistant_message":{"message_id":"assistant-1","role":"assistant","status":"pending","usage_type":"quick_insights","content":"","citations":[],"blocks":[],"input_tokens":0,"output_tokens":0,"reserved_credits":0,"charged_credits":0,"refunded_credits":0,"created_at":"2026-04-26T10:00:00Z","completed_at":null,"error_message":null}}

                data: {"type":"delta","message_id":"assistant-1","delta":"Hello"}

                data: {"type":"complete","session":{"session_id":"11111111-1111-1111-1111-111111111111","title":"Relay stream","default_usage_type":"quick_insights","message_count":2,"created_at":"2026-04-26T10:00:00Z","updated_at":"2026-04-26T10:00:02Z","last_message_at":"2026-04-26T10:00:02Z"},"user_message":{"message_id":"user-1","role":"user","status":"succeeded","usage_type":"quick_insights","content":"Hello","citations":[],"blocks":[],"input_tokens":0,"output_tokens":0,"reserved_credits":0,"charged_credits":0,"refunded_credits":0,"created_at":"2026-04-26T10:00:00Z","completed_at":null,"error_message":null},"assistant_message":{"message_id":"assistant-1","role":"assistant","status":"succeeded","usage_type":"quick_insights","content":"Hello","citations":[],"blocks":[],"input_tokens":0,"output_tokens":0,"reserved_credits":0,"charged_credits":1.25,"refunded_credits":0,"created_at":"2026-04-26T10:00:00Z","completed_at":"2026-04-26T10:00:02Z","error_message":null},"remaining_credits":10.5}

                """,
                Encoding.UTF8);
            content.Headers.ContentType = new MediaTypeHeaderValue("text/event-stream");
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = content
            };
        });
        await SeedLinkedCloudAccountAsync();

        await TestAuth.SignInAsManagerAsync(client);

        var sessionId = Guid.NewGuid();
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/ai/chat/sessions/{sessionId}/messages/stream")
        {
            Content = JsonContent.Create(new
            {
                message = "Hello",
                usage_type = "quick_insights",
                idempotency_key = $"it-relay-stream-{Guid.NewGuid():N}"
            })
        };
        request.Headers.Add("X-License-Token", "local-offline-license-token-it");

        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        response.EnsureSuccessStatusCode();

        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);

        var streamBody = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"type\":\"start\"", streamBody, StringComparison.Ordinal);
        Assert.Contains("\"type\":\"delta\"", streamBody, StringComparison.Ordinal);
        Assert.Contains("\"type\":\"complete\"", streamBody, StringComparison.Ordinal);

        Assert.Single(relayHandler.CapturedRequests);
        var relayRequest = relayHandler.CapturedRequests[0];
        Assert.EndsWith(
            $"/cloud/v1/ai/chat/sessions/{sessionId:D}/messages/stream",
            relayRequest.PathAndQuery,
            StringComparison.OrdinalIgnoreCase);
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

    private async Task SeedLinkedCloudAccountAsync(
        string authToken = "cloud-auth-token-it",
        DateTimeOffset? expiresAtUtc = null,
        RelayWebApplicationFactory? factory = null)
    {
        using var scope = (factory ?? appFactory).Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        dbContext.CloudAccountLinks.RemoveRange(dbContext.CloudAccountLinks);
        dbContext.CloudAccountLinks.Add(new CloudAccountLink
        {
            Id = Guid.NewGuid(),
            CloudUsername = "owner",
            CloudFullName = "Owner",
            CloudRole = "owner",
            CloudShopCode = "default",
            CloudAuthToken = authToken,
            TokenExpiresAtUtc = expiresAtUtc ?? DateTimeOffset.UtcNow.AddHours(1),
            LinkedAtUtc = DateTimeOffset.UtcNow
        });
        await dbContext.SaveChangesAsync();
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
