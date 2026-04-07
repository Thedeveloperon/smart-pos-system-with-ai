using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;

namespace SmartPos.Backend.IntegrationTests;

public sealed class ManualFallbackDisabledWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["Licensing:MarketingManualBillingFallbackEnabled"] = "false"
        };
    }
}

public sealed class LicensingManualFallbackFeatureFlagTests(ManualFallbackDisabledWebApplicationFactory factory)
    : IClassFixture<ManualFallbackDisabledWebApplicationFactory>
{
    private readonly ManualFallbackDisabledWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task PaymentSubmitEndpoint_ShouldReturnForbidden_WhenManualFallbackDisabled()
    {
        var client = appFactory.CreateClient();

        var payload = new
        {
            invoice_number = "INV-MANUAL-DISABLED-001",
            amount = 100,
            payment_method = "bank_deposit",
            bank_reference = "BR-MANUAL-DISABLED-001",
            deposit_slip_url = "https://proofs.smartpos.test/slip-001.png"
        };

        var response = await client.PostAsJsonAsync("/api/license/public/payment-submit", payload);
        Assert.Equal(StatusCodes.Status403Forbidden, (int)response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonObject>();
        var error = body?["error"] as JsonObject;
        Assert.Equal("INVALID_ADMIN_REQUEST", error?["code"]?.GetValue<string>());
        Assert.Contains("disabled", error?["message"]?.GetValue<string>() ?? string.Empty, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PaymentProofUploadEndpoint_ShouldReturnForbidden_WhenManualFallbackDisabled()
    {
        var client = appFactory.CreateClient();

        using var multipart = new MultipartFormDataContent();
        using var content = new ByteArrayContent(Encoding.UTF8.GetBytes("mock-proof-content"));
        content.Headers.ContentType = MediaTypeHeaderValue.Parse("image/png");
        multipart.Add(content, "file", "proof.png");

        var response = await client.PostAsync("/api/license/public/payment-proof-upload", multipart);
        Assert.Equal(StatusCodes.Status403Forbidden, (int)response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonObject>();
        var error = body?["error"] as JsonObject;
        Assert.Equal("INVALID_ADMIN_REQUEST", error?["code"]?.GetValue<string>());
        Assert.Contains("disabled", error?["message"]?.GetValue<string>() ?? string.Empty, StringComparison.OrdinalIgnoreCase);
    }
}
