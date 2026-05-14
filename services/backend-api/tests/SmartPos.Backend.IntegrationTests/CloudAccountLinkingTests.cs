using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class CloudAccountLinkingTests : IDisposable
{
    private readonly CloudAccountStubMessageHandler cloudHandler = new();
    private readonly CloudAccountWebApplicationFactory appFactory;
    private readonly HttpClient client;

    public CloudAccountLinkingTests()
    {
        appFactory = new CloudAccountWebApplicationFactory(cloudHandler, new Dictionary<string, string?>());
        client = appFactory.CreateClient();
    }

    public void Dispose()
    {
        client.Dispose();
        appFactory.Dispose();
    }

    [Fact]
    public async Task Link_WhenAiAndLicensingRelayDiffer_ShouldPreferAiRelayAndAiTimeout()
    {
        cloudHandler.Enqueue(async (_, cancellationToken) =>
        {
            await Task.Delay(TimeSpan.FromMilliseconds(1500), cancellationToken);
            return JsonResponse(HttpStatusCode.OK, new
            {
                username = "sampath",
                full_name = "Sampath",
                role = "owner",
                expires_at = DateTimeOffset.UtcNow.AddHours(2),
                token = "cloud-auth-token-it"
            });
        });
        cloudHandler.Enqueue((_, _) => Task.FromResult(JsonResponse(HttpStatusCode.OK, new
        {
            shop_id = Guid.NewGuid(),
            shop_code = "default",
            username = "sampath",
            full_name = "Sampath",
            role = "owner"
        })));

        await SignInAsOwnerAccountAsync(client);

        var response = await client.PostAsJsonAsync("/api/cloud-account/link", new
        {
            username = "sampath",
            password = "12345678"
        });
        response.EnsureSuccessStatusCode();

        var payload = await TestJson.ReadObjectAsync(response);
        Assert.Equal("sampath", TestJson.GetString(payload, "cloud_username"));
        Assert.Equal("default", TestJson.GetString(payload, "cloud_shop_code"));

        Assert.Equal(2, cloudHandler.CapturedRequests.Count);
        Assert.Equal("https://backend.smartpos.test/api/auth/login", cloudHandler.CapturedRequests[0].RequestUri);
        Assert.Equal("https://backend.smartpos.test/api/account/tenant-context", cloudHandler.CapturedRequests[1].RequestUri);
        Assert.Equal("smartpos_auth=cloud-auth-token-it", cloudHandler.CapturedRequests[1].Headers["Cookie"]);

        using var scope = appFactory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var link = dbContext.CloudAccountLinks.Single();
        Assert.Equal("sampath", link.CloudUsername);
        Assert.Equal("default", link.CloudShopCode);
        Assert.StartsWith("enc:v1:", link.CloudAuthToken, StringComparison.Ordinal);
    }

    private static async Task SignInAsOwnerAccountAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/account/login", new
        {
            username = "owner",
            password = "owner123"
        });
        response.EnsureSuccessStatusCode();
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

    private sealed class CloudAccountWebApplicationFactory(
        CloudAccountStubMessageHandler cloudHandler,
        IReadOnlyDictionary<string, string?> overrides)
        : CustomWebApplicationFactory
    {
        protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
        {
            var settings = new Dictionary<string, string?>
            {
                ["Licensing:CloudRelayBaseUrl"] = "https://portal.smartpos.test",
                ["Licensing:CloudRelayTimeoutSeconds"] = "1",
                ["AiInsights:CloudRelayBaseUrl"] = "https://backend.smartpos.test",
                ["AiInsights:CloudRelayTimeoutSeconds"] = "5"
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
                services.AddSingleton(cloudHandler);
                services.AddHttpClient("cloud-account-link")
                    .ConfigurePrimaryHttpMessageHandler(serviceProvider =>
                        serviceProvider.GetRequiredService<CloudAccountStubMessageHandler>());
            });
        }
    }

    private sealed class CloudAccountStubMessageHandler : HttpMessageHandler
    {
        private readonly ConcurrentQueue<Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>>> responders = new();

        public List<CapturedCloudAccountRequest> CapturedRequests { get; } = [];

        public void Enqueue(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder)
        {
            responders.Enqueue(responder);
        }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var (key, values) in request.Headers)
            {
                headers[key] = string.Join(",", values);
            }

            if (request.Content is not null)
            {
                foreach (var (key, values) in request.Content.Headers)
                {
                    headers[key] = string.Join(",", values);
                }
            }

            CapturedRequests.Add(new CapturedCloudAccountRequest(
                request.RequestUri?.ToString() ?? string.Empty,
                headers));

            if (!responders.TryDequeue(out var responder))
            {
                throw new InvalidOperationException("No cloud account response configured.");
            }

            return await responder(request, cancellationToken);
        }
    }

    private sealed record CapturedCloudAccountRequest(
        string RequestUri,
        IReadOnlyDictionary<string, string> Headers);
}
