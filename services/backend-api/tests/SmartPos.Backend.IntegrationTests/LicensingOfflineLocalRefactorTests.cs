using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingOfflineLocalRefactorTests : IDisposable
{
    private readonly OfflineLocalLicensingWebApplicationFactory appFactory;
    private readonly HttpClient client;

    public LicensingOfflineLocalRefactorTests()
    {
        appFactory = new OfflineLocalLicensingWebApplicationFactory();
        client = appFactory.CreateClient();
    }

    public void Dispose()
    {
        client.Dispose();
        appFactory.Dispose();
    }

    [Fact]
    public async Task Activate_WithoutActivationEntitlementKey_ShouldReturnInvalidActivationEntitlement()
    {
        var deviceCode = $"offline-missing-key-it-{Guid.NewGuid():N}";

        var response = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Offline Missing Key Device",
            actor = "integration-tests",
            reason = "missing activation key"
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected error payload.");
        Assert.Equal("INVALID_ACTIVATION_ENTITLEMENT", payload["error"]?["code"]?.GetValue<string>());
        Assert.Equal("activation_entitlement_key is required.", payload["error"]?["message"]?.GetValue<string>());
    }

    [Fact]
    public async Task OfflineBatchGeneration_ShouldGenerateTenKeys_AndActivationShouldSucceedWithGeneratedKey()
    {
        await SignInAsSupportAdminAsync(client);

        var batchResponse = await client.PostAsJsonAsync("/api/admin/licensing/offline/activation-entitlements/batch-generate", new
        {
            shop_code = "default",
            count = 10,
            actor = "integration-tests",
            reason_code = "offline_activation_batch_generated",
            actor_note = "integration test offline batch generation",
            reason = "offline batch generation test"
        });
        batchResponse.EnsureSuccessStatusCode();

        var batchPayload = await batchResponse.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected batch payload.");
        Assert.Equal(10, batchPayload["generated_count"]?.GetValue<int>());

        var entitlementArray = batchPayload["entitlements"]?.AsArray()
            ?? throw new InvalidOperationException("Missing entitlements array.");
        Assert.Equal(10, entitlementArray.Count);

        var generatedKeys = entitlementArray
            .Select(node => node?["activation_entitlement_key"]?.GetValue<string>() ?? string.Empty)
            .ToList();
        Assert.Equal(10, generatedKeys.Count);
        Assert.Equal(10, generatedKeys.Distinct(StringComparer.Ordinal).Count());
        Assert.DoesNotContain(generatedKeys, string.IsNullOrWhiteSpace);

        var activationKey = generatedKeys[0];
        var activateResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = $"offline-activation-it-{Guid.NewGuid():N}",
            device_name = "Offline Activation Device",
            actor = "integration-tests",
            reason = "generated key activation",
            activation_entitlement_key = activationKey
        });
        activateResponse.EnsureSuccessStatusCode();

        var activatePayload = await TestJson.ReadObjectAsync(activateResponse);
        Assert.Equal("active", TestJson.GetString(activatePayload, "state"));
        Assert.False(string.IsNullOrWhiteSpace(TestJson.GetString(activatePayload, "license_token")));
    }

    [Fact]
    public async Task OfflineBatchGeneration_ShouldPersistEncryptedValues_AndHashIndexedKeys()
    {
        await SignInAsSupportAdminAsync(client);

        var batchResponse = await client.PostAsJsonAsync("/api/admin/licensing/offline/activation-entitlements/batch-generate", new
        {
            shop_code = "default",
            count = 10,
            actor = "integration-tests",
            reason_code = "offline_activation_batch_generated",
            actor_note = "integration test encrypted at rest verification",
            reason = "offline batch encryption verification"
        });
        batchResponse.EnsureSuccessStatusCode();

        var batchPayload = await batchResponse.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected batch payload.");

        var sourceReference = batchPayload["source_reference"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Expected source_reference.");
        var entitlementArray = batchPayload["entitlements"]?.AsArray()
            ?? throw new InvalidOperationException("Missing entitlements array.");
        var generatedKeys = entitlementArray
            .Select(node => node?["activation_entitlement_key"]?.GetValue<string>() ?? string.Empty)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToList();
        Assert.Equal(10, generatedKeys.Count);

        await using var scope = appFactory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var persisted = await dbContext.CustomerActivationEntitlements
            .AsNoTracking()
            .Where(x =>
                x.Source == "offline_local_batch_manual" &&
                x.SourceReference == sourceReference)
            .ToListAsync();

        Assert.Equal(10, persisted.Count);
        var plainSet = generatedKeys.ToHashSet(StringComparer.Ordinal);
        Assert.All(persisted, record =>
        {
            Assert.False(string.IsNullOrWhiteSpace(record.EntitlementKey));
            Assert.False(string.IsNullOrWhiteSpace(record.EntitlementKeyHash));
            Assert.DoesNotContain(record.EntitlementKey, plainSet);
        });

        var expectedHashes = generatedKeys
            .Select(ComputeActivationEntitlementHash)
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToList();
        var actualHashes = persisted
            .Select(record => record.EntitlementKeyHash)
            .OrderBy(value => value, StringComparer.Ordinal)
            .ToList();
        Assert.Equal(expectedHashes, actualHashes);
    }

    [Fact]
    public async Task OfflineGeneratedKey_ShouldBeReusableAcrossMultipleDeviceActivations()
    {
        await SignInAsSupportAdminAsync(client);

        var batchResponse = await client.PostAsJsonAsync("/api/admin/licensing/offline/activation-entitlements/batch-generate", new
        {
            shop_code = "default",
            count = 10,
            actor = "integration-tests",
            reason_code = "offline_activation_batch_generated",
            actor_note = "integration test reusable key verification",
            reason = "offline reusable key verification"
        });
        batchResponse.EnsureSuccessStatusCode();

        var batchPayload = await batchResponse.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected batch payload.");
        var entitlementArray = batchPayload["entitlements"]?.AsArray()
            ?? throw new InvalidOperationException("Missing entitlements array.");
        var activationKey = entitlementArray[0]?["activation_entitlement_key"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Expected activation key.");
        var entitlementId = entitlementArray[0]?["entitlement_id"]?.GetValue<Guid>()
            ?? throw new InvalidOperationException("Expected entitlement id.");

        var firstActivation = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = $"offline-reuse-it-1-{Guid.NewGuid():N}",
            device_name = "Offline Reuse Device 1",
            actor = "integration-tests",
            reason = "reusable key activation one",
            activation_entitlement_key = activationKey
        });
        firstActivation.EnsureSuccessStatusCode();

        var secondActivation = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = $"offline-reuse-it-2-{Guid.NewGuid():N}",
            device_name = "Offline Reuse Device 2",
            actor = "integration-tests",
            reason = "reusable key activation two",
            activation_entitlement_key = activationKey
        });
        secondActivation.EnsureSuccessStatusCode();

        await using var scope = appFactory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var entitlement = await dbContext.CustomerActivationEntitlements
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == entitlementId)
            ?? throw new InvalidOperationException("Expected persisted entitlement.");
        Assert.True(entitlement.ActivationsUsed >= 2);
        Assert.Equal("active", entitlement.Status.ToString().ToLowerInvariant());
    }

    [Fact]
    public async Task CloudLicensingSurfaces_WhenDisabled_ShouldReturnDisabledError()
    {
        var paymentRequestResponse = await client.PostAsJsonAsync("/api/license/public/payment-request", new
        {
            shop_name = "Offline Disabled Shop",
            contact_name = "Owner",
            contact_email = "owner@example.com",
            plan_code = "starter",
            payment_method = "bank_deposit"
        });

        Assert.Equal(HttpStatusCode.ServiceUnavailable, paymentRequestResponse.StatusCode);
        var paymentRequestPayload = await paymentRequestResponse.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected disabled payload.");
        Assert.Equal("CLOUD_LICENSING_DISABLED", paymentRequestPayload["error"]?["code"]?.GetValue<string>());

        var cloudHealthResponse = await client.GetAsync("/cloud/v1/health");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, cloudHealthResponse.StatusCode);
        var cloudHealthPayload = await cloudHealthResponse.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected disabled payload.");
        Assert.Equal("CLOUD_LICENSING_DISABLED", cloudHealthPayload["error"]?["code"]?.GetValue<string>());
    }

    private static async Task SignInAsSupportAdminAsync(HttpClient httpClient)
    {
        var response = await httpClient.PostAsJsonAsync("/api/auth/login", new
        {
            username = "support_admin",
            password = "support123",
            device_code = $"offline-support-admin-{Guid.NewGuid():N}",
            device_name = "Offline Support Admin",
            mfa_code = TotpMfa.GenerateCode(
                "support-admin-mfa-secret-2026",
                DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 30)
        });
        response.EnsureSuccessStatusCode();
    }

    private sealed class OfflineLocalLicensingWebApplicationFactory : CustomWebApplicationFactory
    {
        protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
        {
            return new Dictionary<string, string?>
            {
                ["Licensing:Mode"] = "LocalOffline",
                ["Licensing:RequireActivationEntitlementKey"] = "true",
                ["Licensing:CloudLicensingEndpointsEnabled"] = "false",
                ["Licensing:CloudRelayEnabled"] = "false"
            };
        }
    }

    private static string ComputeActivationEntitlementHash(string entitlementKey)
    {
        var normalized = new string(entitlementKey
            .Where(char.IsLetterOrDigit)
            .Select(char.ToUpperInvariant)
            .ToArray());
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }
}
