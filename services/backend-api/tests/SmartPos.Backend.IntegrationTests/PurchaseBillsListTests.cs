using System.Net;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class PurchaseBillsListTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task ListPurchaseBills_ShouldReturnOk()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.GetAsync("/api/purchases/bills");
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(
            response.IsSuccessStatusCode,
            $"Expected success but received {(int)response.StatusCode} {response.StatusCode}. Body: {body}");

        var payload = JsonArray.Parse(body);
        Assert.NotNull(payload);
    }
}
