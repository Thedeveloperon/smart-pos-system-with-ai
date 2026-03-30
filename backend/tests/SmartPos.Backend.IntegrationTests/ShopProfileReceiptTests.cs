using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class ShopProfileReceiptTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task ShopProfileUpdate_ShouldAppearInPrintableReceipt()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var updatedProfile = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync("/api/settings/shop-profile", new
            {
                shop_name = "Rearboost Innovations",
                address_line1 = "Matugama",
                address_line2 = "0704867765",
                phone = "rearboost@gmail.com",
                email = "www.rearboost.com",
                website = "www.rearboost.com",
                logo_url = "",
                receipt_footer = "Items which are sold do not accept after 03 days."
            }));

        Assert.Equal("Rearboost Innovations", TestJson.GetString(updatedProfile, "shop_name"));

        var productSearch = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/products/search"));

        var firstProduct = FirstObjectFromArray(productSearch, "items");
        var productId = Guid.Parse(TestJson.GetString(firstProduct, "id"));

        var saleResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/checkout/complete", new
            {
                sale_id = (Guid?)null,
                items = new[]
                {
                    new
                    {
                        product_id = productId,
                        quantity = 1m
                    }
                },
                discount_percent = 0m,
                role = "cashier",
                payments = new[]
                {
                    new
                    {
                        method = "cash",
                        amount = 500m,
                        reference_number = (string?)null
                    }
                }
            }));

        var saleId = Guid.Parse(TestJson.GetString(saleResponse, "sale_id"));

        var htmlResponse = await client.GetAsync($"/api/receipts/{saleId}/html");
        htmlResponse.EnsureSuccessStatusCode();
        var html = await htmlResponse.Content.ReadAsStringAsync();

        Assert.Contains("Rearboost Innovations", html);
        Assert.Contains("Matugama", html);
        Assert.Contains("INV. NO", html);
        Assert.Contains("BALANCE", html);
    }

    private static JsonObject FirstObjectFromArray(JsonNode root, string propertyName)
    {
        var array = root[propertyName]?.AsArray()
                    ?? throw new InvalidOperationException($"Missing array '{propertyName}'.");

        return array
                   .OfType<JsonObject>()
                   .FirstOrDefault()
               ?? throw new InvalidOperationException($"Array '{propertyName}' was empty.");
    }
}
