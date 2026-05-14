using System.Net;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Purchases;

namespace SmartPos.Backend.IntegrationTests;

public sealed class OpenAiOcrProviderUnitTests
{
    [Fact]
    public async Task OpenAiOcrProvider_ShouldParseStructuredResponse_ForImageBill()
    {
        using var httpClient = BuildHttpClient(_ =>
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    """
                    {
                      "output_text": "{\"supplier_name\":\"Acme Traders\",\"invoice_number\":\"INV-OPENAI-1001\",\"invoice_date\":\"2026-04-06\",\"currency\":\"LKR\",\"subtotal\":300.00,\"tax_total\":0.00,\"grand_total\":300.00,\"overall_confidence\":0.92,\"lines\":[{\"line_no\":1,\"raw_text\":\"Ceylon Tea 1 300.00 300.00\",\"item_name\":\"Ceylon Tea\",\"quantity\":1,\"unit_cost\":300.00,\"line_total\":300.00,\"confidence\":0.91}]}"
                    }
                    """,
                    Encoding.UTF8,
                    "application/json")
            });

        var provider = BuildProvider(httpClient);
        var imageBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x42 };

        var result = await provider.ExtractAsync(
            new BillFileData("supplier-bill.png", "image/png", imageBytes),
            CancellationToken.None);

        Assert.Equal("openai", result.ProviderName);
        Assert.Equal("Acme Traders", result.SupplierName);
        Assert.Equal("INV-OPENAI-1001", result.InvoiceNumber);
        Assert.Equal(300.00m, result.Subtotal);
        Assert.Equal(0.00m, result.TaxTotal);
        Assert.Equal(300.00m, result.GrandTotal);
        Assert.Equal(0.92m, result.OverallConfidence);
        Assert.Single(result.Lines);
        Assert.Equal("Ceylon Tea", result.Lines[0].ItemName);
    }

    [Fact]
    public async Task OpenAiOcrProvider_ShouldMergeFallbackFields_ForPartialOpenAiPayload()
    {
        using var httpClient = BuildHttpClient(_ =>
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    """
                    {
                      "output_text": "{\"supplier_name\":null,\"invoice_number\":\"INV-OPENAI-PARTIAL-1\",\"currency\":\"LKR\",\"lines\":[]}"
                    }
                    """,
                    Encoding.UTF8,
                    "application/json")
            });

        var provider = BuildProvider(httpClient);
        var pdfPayload = """
            %PDF-1.7
            Supplier: Local Parsed Supplier
            Invoice No: INV-OPENAI-PARTIAL-1
            Soap Bar 2 120.00 240.00
            Subtotal: 240.00
            Tax: 0.00
            Total: 240.00
            /Type /Page
            """;

        var result = await provider.ExtractAsync(
            new BillFileData("supplier-bill.pdf", "application/pdf", Encoding.UTF8.GetBytes(pdfPayload)),
            CancellationToken.None);

        Assert.Equal("openai", result.ProviderName);
        Assert.Equal("Local Parsed Supplier", result.SupplierName);
        Assert.Equal("INV-OPENAI-PARTIAL-1", result.InvoiceNumber);
        Assert.Single(result.Lines);
        Assert.Equal("Soap Bar", result.Lines[0].ItemName);
    }

    [Fact]
    public async Task OpenAiOcrProvider_ShouldThrowUnavailable_WhenApiKeyMissing()
    {
        using var httpClient = BuildHttpClient(_ =>
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"output_text\":\"{}\"}", Encoding.UTF8, "application/json")
            });

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [$"{PurchasingOptions.SectionName}:OpenAiApiKey"] = string.Empty
            })
            .Build();
        var options = Options.Create(new PurchasingOptions
        {
            OcrProvider = "openai",
            OpenAiApiBaseUrl = "https://api.openai.com/v1",
            OpenAiApiKey = string.Empty,
            OpenAiApiKeyEnvironmentVariable = "OPENAI_API_KEY_TEST_UNSET_2026_04_06"
        });

        var provider = new OpenAiOcrProvider(
            new StubHttpClientFactory(httpClient),
            configuration,
            new BasicTextOcrProvider(),
            options,
            NullLogger<OpenAiOcrProvider>.Instance);

        await Assert.ThrowsAsync<OcrProviderUnavailableException>(() =>
            provider.ExtractAsync(
                new BillFileData("supplier-bill.png", "image/png", new byte[] { 0x89, 0x50, 0x4E, 0x47 }),
                CancellationToken.None));
    }

    private static OpenAiOcrProvider BuildProvider(HttpClient httpClient)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                [$"{PurchasingOptions.SectionName}:OpenAiApiKey"] = "test-openai-key"
            })
            .Build();

        var options = Options.Create(new PurchasingOptions
        {
            OcrProvider = "openai",
            OpenAiApiBaseUrl = "https://api.openai.com/v1",
            OpenAiApiKey = "test-openai-key",
            OpenAiApiKeyEnvironmentVariable = "OPENAI_API_KEY_TEST_2026_04_06",
            OpenAiModel = "gpt-5.4-mini",
            OpenAiRequestTimeoutMs = 20000,
            OpenAiMaxOutputTokens = 1200
        });

        return new OpenAiOcrProvider(
            new StubHttpClientFactory(httpClient),
            configuration,
            new BasicTextOcrProvider(),
            options,
            NullLogger<OpenAiOcrProvider>.Instance);
    }

    private static HttpClient BuildHttpClient(Func<HttpRequestMessage, HttpResponseMessage> responder)
    {
        var handler = new StubHttpMessageHandler((request, _) =>
        {
            var response = responder(request);
            return Task.FromResult(response);
        });

        return new HttpClient(handler);
    }

    private sealed class StubHttpClientFactory(HttpClient client) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
        {
            return client;
        }
    }

    private sealed class StubHttpMessageHandler(
        Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            return handler(request, cancellationToken);
        }
    }
}
