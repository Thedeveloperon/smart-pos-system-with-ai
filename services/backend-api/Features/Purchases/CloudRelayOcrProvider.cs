using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Features.CloudAccount;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Features.Purchases;

public sealed class CloudRelayOcrProvider(
    IHttpClientFactory httpClientFactory,
    IOptions<AiInsightOptions> aiOptionsAccessor,
    IOptions<LicenseOptions> licenseOptionsAccessor,
    IServiceScopeFactory serviceScopeFactory,
    IHttpContextAccessor httpContextAccessor,
    ILogger<CloudRelayOcrProvider> logger) : IOcrProviderCore
{
    private const string CloudRelayClientName = "cloud-ai-relay";
    private const string CloudAuthCookieName = "smartpos_auth";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    public async Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken)
    {
        var baseUrl = ResolveCloudRelayBaseUrl();
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            throw new OcrProviderUnavailableException(
                "Cloud OCR relay base URL is not configured.");
        }

        var cloudAuthToken = await ResolveLinkedCloudAuthTokenAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(cloudAuthToken))
        {
            throw new OcrProviderUnavailableException(
                "Cloud account is not linked or token expired. Re-link cloud account and retry.");
        }

        var httpClient = httpClientFactory.CreateClient(CloudRelayClientName);
        using var request = new HttpRequestMessage(HttpMethod.Post, "cloud/v1/purchases/ocr/extract");
        request.Headers.TryAddWithoutValidation("Cookie", $"{CloudAuthCookieName}={cloudAuthToken}");

        var sourceRequest = httpContextAccessor.HttpContext?.Request;
        var forwardedLicenseToken = sourceRequest?.Headers["X-License-Token"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwardedLicenseToken))
        {
            request.Headers.TryAddWithoutValidation("X-License-Token", forwardedLicenseToken);
        }

        var forwardedPosVersion = sourceRequest?.Headers["X-POS-Version"].FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(forwardedPosVersion))
        {
            request.Headers.TryAddWithoutValidation("X-POS-Version", forwardedPosVersion);
        }

        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(file.Bytes);
        if (!string.IsNullOrWhiteSpace(file.ContentType))
        {
            fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse(file.ContentType);
        }

        form.Add(fileContent, "file", file.FileName);
        request.Content = form;

        HttpResponseMessage response;
        try
        {
            response = await httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new OcrProviderUnavailableException("Cloud OCR relay timed out.");
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Cloud OCR relay request failed to reach upstream.");
            throw new OcrProviderUnavailableException(
                "Cloud OCR relay is unreachable.",
                exception);
        }

        using (response)
        {
            var responseBody = response.Content is null
                ? string.Empty
                : await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var message = TryExtractErrorMessage(responseBody) ??
                              $"Cloud OCR relay request failed with HTTP {(int)response.StatusCode}.";
                throw new OcrProviderUnavailableException(message);
            }

            if (string.IsNullOrWhiteSpace(responseBody))
            {
                throw new OcrProviderUnavailableException("Cloud OCR relay returned an empty response.");
            }

            PurchaseOcrExtractionResult? extraction;
            try
            {
                extraction = JsonSerializer.Deserialize<PurchaseOcrExtractionResult>(responseBody, JsonOptions);
            }
            catch (JsonException exception)
            {
                throw new OcrProviderUnavailableException(
                    "Cloud OCR relay returned invalid JSON.",
                    exception);
            }

            if (extraction is null)
            {
                throw new OcrProviderUnavailableException("Cloud OCR relay returned an invalid payload.");
            }

            extraction.ProviderName = string.IsNullOrWhiteSpace(extraction.ProviderName)
                ? "cloud-relay"
                : extraction.ProviderName;
            return extraction;
        }
    }

    private async Task<string?> ResolveLinkedCloudAuthTokenAsync(CancellationToken cancellationToken)
    {
        using var scope = serviceScopeFactory.CreateScope();
        var cloudAccountService = scope.ServiceProvider.GetRequiredService<CloudAccountService>();
        return await cloudAccountService.TryGetLinkedAuthTokenAsync(cancellationToken);
    }

    private string ResolveCloudRelayBaseUrl()
    {
        var aiBaseUrl = NormalizeOptionalValue(aiOptionsAccessor.Value.CloudRelayBaseUrl);
        if (!string.IsNullOrWhiteSpace(aiBaseUrl))
        {
            return aiBaseUrl;
        }

        return NormalizeOptionalValue(licenseOptionsAccessor.Value.CloudRelayBaseUrl) ?? string.Empty;
    }

    private static string? TryExtractErrorMessage(string? payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(payload);
            if (document.RootElement.ValueKind == JsonValueKind.Object)
            {
                if (document.RootElement.TryGetProperty("message", out var messageElement) &&
                    messageElement.ValueKind == JsonValueKind.String)
                {
                    var message = messageElement.GetString();
                    return string.IsNullOrWhiteSpace(message) ? null : message.Trim();
                }

                if (document.RootElement.TryGetProperty("error", out var errorElement) &&
                    errorElement.ValueKind == JsonValueKind.Object &&
                    errorElement.TryGetProperty("message", out var nestedMessageElement) &&
                    nestedMessageElement.ValueKind == JsonValueKind.String)
                {
                    var message = nestedMessageElement.GetString();
                    return string.IsNullOrWhiteSpace(message) ? null : message.Trim();
                }
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    private static string? NormalizeOptionalValue(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length == 0 ? null : trimmed;
    }
}
