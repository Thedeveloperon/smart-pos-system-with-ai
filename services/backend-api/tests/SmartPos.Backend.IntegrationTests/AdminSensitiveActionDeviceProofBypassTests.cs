using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AdminSensitiveActionDeviceProofBypassTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task AdminMutation_WithInvalidDeviceProofHeaders_ShouldBypassProofValidationForSuperAdminScope()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);

        var payload = new
        {
            shop_code = $"admin-proof-bypass-shop-{Guid.NewGuid():N}",
            amount_due = 2500m,
            currency = "LKR",
            due_at = DateTimeOffset.UtcNow.AddDays(7),
            notes = "admin proof bypass",
            actor = "support_admin",
            reason_code = "manual_billing_invoice_created",
            actor_note = "admin proof bypass test"
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/admin/licensing/billing/invoices")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        request.Headers.TryAddWithoutValidation("X-Device-Nonce-Id", Guid.NewGuid().ToString());
        request.Headers.TryAddWithoutValidation("X-Device-Timestamp", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString());
        request.Headers.TryAddWithoutValidation("X-Device-Signature", "invalid-signature");

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<JsonObject>();
        Assert.False(string.IsNullOrWhiteSpace(body?["invoice_id"]?.GetValue<string>()));
    }
}
