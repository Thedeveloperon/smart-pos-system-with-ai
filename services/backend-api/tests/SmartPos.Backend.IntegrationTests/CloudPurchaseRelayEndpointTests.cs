using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Features.Purchases;

namespace SmartPos.Backend.IntegrationTests;

public sealed class CloudPurchaseRelayEndpointTests
{
    private const string DeviceCode = "integration-tests-device";

    [Fact]
    public async Task CloudPurchaseRelay_WithAuthenticatedAccountAndUnprovisionedDevice_ShouldAllowExtraction()
    {
        await using var factory = new CloudPurchaseRelayWebApplicationFactory();
        using var client = factory.CreateClient();

        var initialStatus = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/license/status?device_code={Uri.EscapeDataString(DeviceCode)}"));
        Assert.Equal("unprovisioned", TestJson.GetString(initialStatus, "state"));

        var loginResponse = await client.PostAsJsonAsync("/api/account/login", new
        {
            username = "manager",
            password = "manager123"
        });
        loginResponse.EnsureSuccessStatusCode();

        using var formData = new MultipartFormDataContent();
        using var fileContent = new ByteArrayContent(Encoding.UTF8.GetBytes("supplier bill fixture"));
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("image/jpeg");
        formData.Add(fileContent, "file", "supplier-bill.jpg");

        var response = await client.PostAsync("/cloud/v1/purchases/ocr/extract", formData);
        response.EnsureSuccessStatusCode();

        var payload = await TestJson.ReadObjectAsync(response);
        Assert.Equal("cloud-relay-stub", payload["providerName"]?.GetValue<string>());
        Assert.Equal("Relay Supplier", payload["supplierName"]?.GetValue<string>());

        var lines = payload["lines"]?.AsArray()
                    ?? throw new InvalidOperationException("Expected OCR lines payload.");
        Assert.Single(lines);

        var line = lines[0]?.AsObject()
                   ?? throw new InvalidOperationException("Expected first OCR line payload.");
        Assert.Equal("Notebook", line["itemName"]?.GetValue<string>());
    }

    private sealed class CloudPurchaseRelayWebApplicationFactory : CustomWebApplicationFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services =>
            {
                services.AddSingleton<IOcrProvider, StubCloudPurchaseRelayOcrProvider>();
            });
        }
    }

    private sealed class StubCloudPurchaseRelayOcrProvider : IOcrProvider
    {
        public Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken)
        {
            return Task.FromResult(new PurchaseOcrExtractionResult
            {
                ProviderName = "cloud-relay-stub",
                SupplierName = "Relay Supplier",
                InvoiceNumber = "OCR-RELAY-001",
                Currency = "LKR",
                OverallConfidence = 0.97m,
                Lines =
                [
                    new PurchaseOcrExtractionLine
                    {
                        LineNumber = 1,
                        RawText = "Notebook 2 150.00 300.00",
                        ItemName = "Notebook",
                        Quantity = 2m,
                        UnitCost = 150m,
                        LineTotal = 300m,
                        Confidence = 0.97m
                    }
                ]
            });
        }
    }
}
