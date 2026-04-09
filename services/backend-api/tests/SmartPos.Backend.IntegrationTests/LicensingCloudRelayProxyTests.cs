using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingCloudRelayProxyTests : IDisposable
{
    private readonly RelayStubMessageHandler relayHandler = new();
    private readonly RelayWebApplicationFactory appFactory;
    private readonly HttpClient client;

    public LicensingCloudRelayProxyTests()
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
    public async Task RelayEnabled_Activate_ShouldProxyToCloudAndReturnCloudStatus()
    {
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.OK, new
        {
            state = "active",
            shop_id = Guid.NewGuid(),
            device_code = "relay-device-01",
            subscription_status = "active",
            plan = "growth",
            seat_limit = 5,
            active_seats = 1,
            valid_until = DateTimeOffset.UtcNow.AddDays(30),
            grace_until = DateTimeOffset.UtcNow.AddDays(37),
            license_token = "relay-license-token-1",
            blocked_actions = Array.Empty<string>(),
            server_time = DateTimeOffset.UtcNow
        }));

        var response = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = "relay-device-01",
            device_name = "Relay Device",
            actor = "integration-tests",
            reason = "relay activation test",
            activation_entitlement_key = "SPK-TEST-1234"
        });
        response.EnsureSuccessStatusCode();

        var payload = await TestJson.ReadObjectAsync(response);
        Assert.Equal("active", TestJson.GetString(payload, "state"));
        Assert.Equal("relay-license-token-1", TestJson.GetString(payload, "license_token"));

        Assert.Single(relayHandler.CapturedRequests);
        var request = relayHandler.CapturedRequests[0];
        Assert.Equal(HttpMethod.Post.Method, request.Method);
        Assert.EndsWith("/cloud/v1/device/activate", request.PathAndQuery, StringComparison.OrdinalIgnoreCase);
        Assert.True(request.Headers.ContainsKey("Idempotency-Key"));
        Assert.True(request.Headers.ContainsKey("X-Device-Id"));
        Assert.True(request.Headers.ContainsKey("X-POS-Version"));
    }

    [Fact]
    public async Task RelayEnabled_StatusAndHeartbeat_ShouldReturnCloudState()
    {
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.OK, new
        {
            state = "active",
            shop_id = Guid.NewGuid(),
            device_code = "relay-device-02",
            subscription_status = "active",
            plan = "starter",
            seat_limit = 2,
            active_seats = 1,
            valid_until = DateTimeOffset.UtcNow.AddDays(10),
            grace_until = DateTimeOffset.UtcNow.AddDays(17),
            license_token = "relay-license-token-status",
            blocked_actions = Array.Empty<string>(),
            server_time = DateTimeOffset.UtcNow
        }));
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.OK, new
        {
            state = "active",
            shop_id = Guid.NewGuid(),
            device_code = "relay-device-02",
            subscription_status = "active",
            plan = "starter",
            seat_limit = 2,
            active_seats = 1,
            valid_until = DateTimeOffset.UtcNow.AddDays(10),
            grace_until = DateTimeOffset.UtcNow.AddDays(17),
            license_token = "relay-license-token-heartbeat",
            blocked_actions = Array.Empty<string>(),
            server_time = DateTimeOffset.UtcNow
        }));

        var statusResponse = await client.GetAsync("/api/license/status?device_code=relay-device-02");
        statusResponse.EnsureSuccessStatusCode();
        var statusPayload = await TestJson.ReadObjectAsync(statusResponse);
        Assert.Equal("active", TestJson.GetString(statusPayload, "state"));
        Assert.Equal("relay-license-token-status", TestJson.GetString(statusPayload, "license_token"));

        var heartbeatResponse = await client.PostAsJsonAsync("/api/license/heartbeat", new
        {
            device_code = "relay-device-02",
            license_token = "relay-license-token-status"
        });
        heartbeatResponse.EnsureSuccessStatusCode();
        var heartbeatPayload = await TestJson.ReadObjectAsync(heartbeatResponse);
        Assert.Equal("active", TestJson.GetString(heartbeatPayload, "state"));
        Assert.Equal("relay-license-token-heartbeat", TestJson.GetString(heartbeatPayload, "license_token"));
    }

    [Fact]
    public async Task RelayEnabled_ProtectedRoute_ShouldUseCloudStatusForLicenseGuard()
    {
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.OK, new
        {
            state = "active",
            shop_id = Guid.NewGuid(),
            device_code = "relay-guard-device-01",
            subscription_status = "active",
            plan = "growth",
            seat_limit = 5,
            active_seats = 1,
            valid_until = DateTimeOffset.UtcNow.AddDays(30),
            grace_until = DateTimeOffset.UtcNow.AddDays(37),
            license_token = "relay-license-token-guard",
            blocked_actions = Array.Empty<string>(),
            server_time = DateTimeOffset.UtcNow
        }));

        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "manager",
            password = "manager123",
            device_code = "relay-guard-device-01",
            device_name = "Relay Guard Device"
        });
        loginResponse.EnsureSuccessStatusCode();

        var protectedResponse = await client.GetAsync("/api/cash-sessions/current");
        Assert.Equal(HttpStatusCode.OK, protectedResponse.StatusCode);

        Assert.Single(relayHandler.CapturedRequests);
        Assert.EndsWith(
            "/cloud/v1/license/status?device_code=relay-guard-device-01",
            relayHandler.CapturedRequests[0].PathAndQuery,
            StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task RelayEnabled_WhenCloudReturnsActivationEntitlementNotFound_ShouldPassThroughCloudError()
    {
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.Forbidden, new
        {
            error = new
            {
                code = "ACTIVATION_ENTITLEMENT_NOT_FOUND",
                message = "activation_entitlement_key was not found."
            }
        }));

        var response = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = "relay-device-03",
            device_name = "Relay Device",
            actor = "integration-tests",
            activation_entitlement_key = "SPK-MISSING-0000"
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected error payload.");
        Assert.Equal("ACTIVATION_ENTITLEMENT_NOT_FOUND", payload["error"]?["code"]?.GetValue<string>());
        Assert.Equal("activation_entitlement_key was not found.", payload["error"]?["message"]?.GetValue<string>());
    }

    [Fact]
    public async Task RelayEnabled_WhenCloudUnavailableAndCachedStatusIsFresh_ShouldReturnCachedStatus()
    {
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.OK, new
        {
            state = "active",
            shop_id = Guid.NewGuid(),
            device_code = "relay-device-04",
            subscription_status = "active",
            plan = "growth",
            seat_limit = 5,
            active_seats = 1,
            valid_until = DateTimeOffset.UtcNow.AddDays(5),
            grace_until = DateTimeOffset.UtcNow.AddDays(12),
            license_token = "relay-license-token-cached",
            blocked_actions = Array.Empty<string>(),
            server_time = DateTimeOffset.UtcNow
        }));
        relayHandler.Enqueue(_ => throw new HttpRequestException("Cloud unreachable"));

        var first = await client.GetAsync("/api/license/status?device_code=relay-device-04");
        first.EnsureSuccessStatusCode();
        var firstPayload = await TestJson.ReadObjectAsync(first);
        Assert.Equal("active", TestJson.GetString(firstPayload, "state"));

        var second = await client.GetAsync("/api/license/status?device_code=relay-device-04");
        second.EnsureSuccessStatusCode();
        var secondPayload = await TestJson.ReadObjectAsync(second);
        Assert.Equal("active", TestJson.GetString(secondPayload, "state"));
        Assert.Equal("relay-license-token-cached", TestJson.GetString(secondPayload, "license_token"));
    }

    [Fact]
    public async Task RelayEnabled_WhenCloudUnavailableAndCacheMissingOrExpired_ShouldReturnCloudUnreachable()
    {
        relayHandler.Enqueue(_ => JsonResponse(HttpStatusCode.OK, new
        {
            state = "active",
            shop_id = Guid.NewGuid(),
            device_code = "relay-device-05",
            subscription_status = "active",
            plan = "growth",
            seat_limit = 5,
            active_seats = 1,
            valid_until = DateTimeOffset.UtcNow.AddDays(5),
            grace_until = DateTimeOffset.UtcNow.AddDays(12),
            license_token = "relay-license-token-expired",
            blocked_actions = Array.Empty<string>(),
            server_time = DateTimeOffset.UtcNow
        }));
        relayHandler.Enqueue(_ => throw new HttpRequestException("Cloud unreachable"));

        using var expiredFactory = new RelayWebApplicationFactory(
            relayHandler,
            new Dictionary<string, string?>
            {
                ["Licensing:CloudRelayStatusCacheMaxAgeMinutes"] = "0"
            });
        using var expiredClient = expiredFactory.CreateClient();

        var warm = await expiredClient.GetAsync("/api/license/status?device_code=relay-device-05");
        warm.EnsureSuccessStatusCode();

        var failed = await expiredClient.GetAsync("/api/license/status?device_code=relay-device-05");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, failed.StatusCode);
        var payload = await failed.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected error payload.");
        Assert.Equal("CLOUD_LICENSE_UNREACHABLE", payload["error"]?["code"]?.GetValue<string>());
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
                ["Licensing:CloudRelayEnabled"] = "true",
                ["Licensing:CloudRelayBaseUrl"] = "https://relay.smartpos.test",
                ["Licensing:CloudRelayTimeoutSeconds"] = "5",
                ["Licensing:CloudRelayStatusCacheMaxAgeMinutes"] = "60"
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
                services.AddHttpClient("cloud-license-relay")
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
            foreach (var (key, values) in request.Headers)
            {
                headers[key] = string.Join(",", values);
            }

            var body = request.Content is null
                ? string.Empty
                : request.Content.ReadAsStringAsync(cancellationToken).GetAwaiter().GetResult();

            CapturedRequests.Add(new CapturedRelayRequest(
                request.Method.Method,
                request.RequestUri?.PathAndQuery ?? string.Empty,
                headers,
                body));

            if (!responders.TryDequeue(out var responder))
            {
                throw new HttpRequestException("No relay response configured.");
            }

            return Task.FromResult(responder(request));
        }
    }

    private sealed record CapturedRelayRequest(
        string Method,
        string PathAndQuery,
        IReadOnlyDictionary<string, string> Headers,
        string Body);
}
