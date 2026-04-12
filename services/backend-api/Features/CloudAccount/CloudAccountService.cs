using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.CloudAccount;

public sealed class CloudAccountService(
    SmartPosDbContext dbContext,
    IHttpClientFactory httpClientFactory,
    IOptions<AiInsightOptions> aiInsightOptionsAccessor,
    IOptions<LicenseOptions> licenseOptionsAccessor,
    LicenseService licenseService,
    IHttpContextAccessor httpContextAccessor)
{
    private const string CloudAccountLinkClientName = "cloud-account-link";
    private const string CloudAuthCookieName = "smartpos_auth";
    private const string EncryptedValuePrefix = "enc:v1:";
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly AiInsightOptions aiOptions = aiInsightOptionsAccessor.Value;
    private readonly LicenseOptions licenseOptions = licenseOptionsAccessor.Value;

    public async Task<CloudAccountStatusResponse> GetStatusAsync(CancellationToken cancellationToken)
    {
        var configured = TryResolveCloudBaseUrl(out _);
        var linkRows = await dbContext.CloudAccountLinks
            .AsNoTracking()
            .ToListAsync(cancellationToken);
        var link = linkRows
            .OrderByDescending(x => x.LinkedAtUtc.UtcDateTime.Ticks)
            .FirstOrDefault();

        if (link is null)
        {
            return new CloudAccountStatusResponse
            {
                IsLinked = false,
                IsTokenExpired = false,
                CloudRelayConfigured = configured
            };
        }

        return new CloudAccountStatusResponse
        {
            IsLinked = true,
            CloudUsername = link.CloudUsername,
            CloudFullName = link.CloudFullName,
            CloudRole = link.CloudRole,
            CloudShopCode = link.CloudShopCode,
            TokenExpiresAt = link.TokenExpiresAtUtc,
            IsTokenExpired = DateTimeOffset.UtcNow >= link.TokenExpiresAtUtc,
            LinkedAt = link.LinkedAtUtc,
            CloudRelayConfigured = configured
        };
    }

    public async Task<CloudAccountLinkResponse> LinkAsync(
        string username,
        string password,
        CancellationToken cancellationToken)
    {
        var normalizedUsername = NormalizeOptionalValue(username);
        if (string.IsNullOrWhiteSpace(normalizedUsername))
        {
            throw new InvalidOperationException("Cloud username is required.");
        }

        if (string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException("Cloud password is required.");
        }

        if (!TryResolveCloudBaseUrl(out var cloudBaseUrl))
        {
            throw new InvalidOperationException("Cloud relay base URL is not configured.");
        }

        var localShopCode = await ResolveLocalShopCodeAsync(cancellationToken);
        var resolvedDeviceCode = ResolveLinkDeviceCode();
        var client = httpClientFactory.CreateClient(CloudAccountLinkClientName);

        var loginPayload = new
        {
            username = normalizedUsername,
            password,
            device_code = resolvedDeviceCode,
            device_name = "SmartPOS Local Backend"
        };

        using var loginRequest = BuildRequest(
            client,
            HttpMethod.Post,
            cloudBaseUrl,
            "/api/auth/login",
            JsonSerializer.Serialize(loginPayload, JsonOptions));

        using var loginResponse = await SendAsync(client, loginRequest, cancellationToken);
        var loginBody = await loginResponse.Content.ReadAsStringAsync(cancellationToken);
        if (!loginResponse.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                ParseCloudErrorMessage(loginResponse.StatusCode, loginBody, "Cloud login failed."));
        }

        var cloudLogin = DeserializePayload<CloudLoginResponse>(
            loginBody,
            "Cloud login returned an invalid response.");

        if (!TryExtractAuthCookie(loginResponse.Headers, out var cloudAuthToken))
        {
            throw new InvalidOperationException("Cloud login succeeded but auth session cookie was not returned.");
        }

        using var tenantRequest = BuildRequest(
            client,
            HttpMethod.Get,
            cloudBaseUrl,
            "/api/account/tenant-context");
        tenantRequest.Headers.TryAddWithoutValidation("Cookie", $"{CloudAuthCookieName}={cloudAuthToken}");
        using var tenantResponse = await SendAsync(client, tenantRequest, cancellationToken);
        var tenantBody = await tenantResponse.Content.ReadAsStringAsync(cancellationToken);
        if (!tenantResponse.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                ParseCloudErrorMessage(tenantResponse.StatusCode, tenantBody, "Unable to resolve cloud account tenant context."));
        }

        var tenantContext = DeserializePayload<CloudTenantContextResponse>(
            tenantBody,
            "Cloud tenant context response is invalid.");

        var normalizedCloudShopCode = NormalizeOptionalValue(tenantContext.ShopCode);
        if (string.IsNullOrWhiteSpace(normalizedCloudShopCode))
        {
            throw new InvalidOperationException("Cloud account is missing shop mapping.");
        }

        if (!string.Equals(
                localShopCode,
                normalizedCloudShopCode,
                StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Cloud shop code '{normalizedCloudShopCode}' does not match local shop code '{localShopCode}'.");
        }

        if (!string.Equals(tenantContext.Role, SmartPosRoles.Owner, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Cloud account must have owner access.");
        }

        var now = DateTimeOffset.UtcNow;
        var existingRows = (await dbContext.CloudAccountLinks
            .ToListAsync(cancellationToken))
            .OrderByDescending(x => x.LinkedAtUtc.UtcDateTime.Ticks)
            .ToList();
        var link = existingRows.FirstOrDefault();
        var encryptedToken = ProtectSensitiveValue(cloudAuthToken);
        if (link is null)
        {
            link = new CloudAccountLink
            {
                Id = Guid.NewGuid(),
                CloudUsername = NormalizeOptionalValue(tenantContext.Username)
                    ?? NormalizeOptionalValue(cloudLogin.Username)
                    ?? normalizedUsername,
                CloudFullName = NormalizeOptionalValue(tenantContext.FullName)
                    ?? NormalizeOptionalValue(cloudLogin.FullName)
                    ?? string.Empty,
                CloudRole = NormalizeOptionalValue(tenantContext.Role)
                    ?? NormalizeOptionalValue(cloudLogin.Role)
                    ?? string.Empty,
                CloudShopCode = normalizedCloudShopCode,
                CloudAuthToken = encryptedToken,
                TokenExpiresAtUtc = cloudLogin.ExpiresAt,
                LinkedAtUtc = now,
                UpdatedAtUtc = null
            };
            dbContext.CloudAccountLinks.Add(link);
        }
        else
        {
            link.CloudUsername = NormalizeOptionalValue(tenantContext.Username)
                ?? NormalizeOptionalValue(cloudLogin.Username)
                ?? normalizedUsername;
            link.CloudFullName = NormalizeOptionalValue(tenantContext.FullName)
                ?? NormalizeOptionalValue(cloudLogin.FullName)
                ?? string.Empty;
            link.CloudRole = NormalizeOptionalValue(tenantContext.Role)
                ?? NormalizeOptionalValue(cloudLogin.Role)
                ?? string.Empty;
            link.CloudShopCode = normalizedCloudShopCode;
            link.CloudAuthToken = encryptedToken;
            link.TokenExpiresAtUtc = cloudLogin.ExpiresAt;
            link.LinkedAtUtc = now;
            link.UpdatedAtUtc = now;

            if (existingRows.Count > 1)
            {
                dbContext.CloudAccountLinks.RemoveRange(existingRows.Skip(1));
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return new CloudAccountLinkResponse
        {
            CloudUsername = link.CloudUsername,
            CloudFullName = link.CloudFullName,
            CloudRole = link.CloudRole,
            CloudShopCode = link.CloudShopCode,
            TokenExpiresAt = link.TokenExpiresAtUtc,
            LinkedAt = link.LinkedAtUtc
        };
    }

    public async Task UnlinkAsync(CancellationToken cancellationToken)
    {
        var rows = await dbContext.CloudAccountLinks.ToListAsync(cancellationToken);
        if (rows.Count == 0)
        {
            return;
        }

        dbContext.CloudAccountLinks.RemoveRange(rows);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<string> ResolveLocalShopCodeAsync(CancellationToken cancellationToken)
    {
        try
        {
            var portal = await licenseService.GetCustomerLicensePortalAsync(cancellationToken);
            var localShopCode = NormalizeOptionalValue(portal.ShopCode);
            if (string.IsNullOrWhiteSpace(localShopCode))
            {
                throw new InvalidOperationException("Local shop code could not be resolved.");
            }

            return localShopCode;
        }
        catch (LicenseException exception)
        {
            throw new InvalidOperationException(exception.Message);
        }
    }

    private static HttpRequestMessage BuildRequest(
        HttpClient client,
        HttpMethod method,
        string cloudBaseUrl,
        string relativePath,
        string? body = null)
    {
        var normalizedPath = relativePath.TrimStart('/');
        var requestUri = client.BaseAddress is null
            ? $"{cloudBaseUrl.TrimEnd('/')}/{normalizedPath}"
            : new Uri(client.BaseAddress, normalizedPath).ToString();
        var request = new HttpRequestMessage(method, requestUri);
        if (body is not null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }

        return request;
    }

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client,
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        try
        {
            return await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            throw new InvalidOperationException(
                $"Unable to reach cloud account service. {exception.Message}");
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new InvalidOperationException("Cloud account service timed out.");
        }
    }

    private static string ParseCloudErrorMessage(
        System.Net.HttpStatusCode statusCode,
        string payload,
        string fallback)
    {
        if (!string.IsNullOrWhiteSpace(payload))
        {
            try
            {
                using var doc = JsonDocument.Parse(payload);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    if (doc.RootElement.TryGetProperty("error", out var errorNode) &&
                        errorNode.ValueKind == JsonValueKind.Object &&
                        errorNode.TryGetProperty("message", out var errorMessageNode) &&
                        errorMessageNode.ValueKind == JsonValueKind.String)
                    {
                        var errorMessage = NormalizeOptionalValue(errorMessageNode.GetString());
                        if (!string.IsNullOrWhiteSpace(errorMessage))
                        {
                            return errorMessage;
                        }
                    }

                    if (doc.RootElement.TryGetProperty("message", out var messageNode) &&
                        messageNode.ValueKind == JsonValueKind.String)
                    {
                        var message = NormalizeOptionalValue(messageNode.GetString());
                        if (!string.IsNullOrWhiteSpace(message))
                        {
                            return message;
                        }
                    }
                }
            }
            catch (JsonException)
            {
                var rawMessage = NormalizeOptionalValue(payload);
                if (!string.IsNullOrWhiteSpace(rawMessage))
                {
                    return rawMessage;
                }
            }
        }

        return statusCode switch
        {
            System.Net.HttpStatusCode.Unauthorized => "Cloud username or password is incorrect.",
            System.Net.HttpStatusCode.Forbidden => "Cloud account does not have permission for this operation.",
            _ => fallback
        };
    }

    private static T DeserializePayload<T>(string payload, string errorMessage)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            throw new InvalidOperationException(errorMessage);
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<T>(payload, JsonOptions);
            return parsed ?? throw new InvalidOperationException(errorMessage);
        }
        catch (JsonException)
        {
            throw new InvalidOperationException(errorMessage);
        }
    }

    private static bool TryExtractAuthCookie(HttpResponseHeaders headers, out string token)
    {
        token = string.Empty;
        if (!headers.TryGetValues("Set-Cookie", out var values))
        {
            return false;
        }

        foreach (var headerValue in values)
        {
            var parsed = TryExtractCookieValue(headerValue, CloudAuthCookieName);
            if (!string.IsNullOrWhiteSpace(parsed))
            {
                token = parsed;
                return true;
            }
        }

        return false;
    }

    private static string? TryExtractCookieValue(string headerValue, string cookieName)
    {
        if (string.IsNullOrWhiteSpace(headerValue))
        {
            return null;
        }

        var firstSegment = headerValue
            .Split(';', StringSplitOptions.TrimEntries)
            .FirstOrDefault();
        if (string.IsNullOrWhiteSpace(firstSegment))
        {
            return null;
        }

        var separator = firstSegment.IndexOf('=');
        if (separator <= 0)
        {
            return null;
        }

        var key = firstSegment[..separator].Trim();
        if (!string.Equals(key, cookieName, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var value = firstSegment[(separator + 1)..].Trim().Trim('"');
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private bool TryResolveCloudBaseUrl(out string baseUrl)
    {
        var aiUrl = NormalizeOptionalValue(aiOptions.CloudRelayBaseUrl);
        var licenseUrl = NormalizeOptionalValue(licenseOptions.CloudRelayBaseUrl);
        var candidate = aiUrl ?? licenseUrl;
        if (string.IsNullOrWhiteSpace(candidate) ||
            !Uri.TryCreate(candidate, UriKind.Absolute, out var uri))
        {
            baseUrl = string.Empty;
            return false;
        }

        baseUrl = uri.ToString().TrimEnd('/');
        return true;
    }

    private string ResolveLinkDeviceCode()
    {
        var httpContext = httpContextAccessor.HttpContext;
        if (httpContext is null)
        {
            return "LOCAL-CLOUD-LINK";
        }

        var resolved = NormalizeOptionalValue(licenseService.ResolveDeviceCode(null, httpContext));
        return string.IsNullOrWhiteSpace(resolved) ? "LOCAL-CLOUD-LINK" : resolved;
    }

    private string ProtectSensitiveValue(string? value)
    {
        var normalized = NormalizeOptionalValue(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return string.Empty;
        }

        if (!licenseOptions.EncryptSensitiveDataAtRest ||
            normalized.StartsWith(EncryptedValuePrefix, StringComparison.Ordinal))
        {
            return normalized;
        }

        var key = ResolveDataEncryptionKey();
        var nonce = RandomNumberGenerator.GetBytes(12);
        var plaintextBytes = Encoding.UTF8.GetBytes(normalized);
        var ciphertextBytes = new byte[plaintextBytes.Length];
        var tagBytes = new byte[16];

        using var aes = new AesGcm(key, 16);
        aes.Encrypt(nonce, plaintextBytes, ciphertextBytes, tagBytes);
        return $"{EncryptedValuePrefix}{Base64UrlEncode(nonce)}.{Base64UrlEncode(ciphertextBytes)}.{Base64UrlEncode(tagBytes)}";
    }

    private byte[] ResolveDataEncryptionKey()
    {
        var keyMaterial = ResolveDataEncryptionKeyMaterial();
        if (string.IsNullOrWhiteSpace(keyMaterial))
        {
            throw new InvalidOperationException("Licensing data encryption key is not configured.");
        }

        return SHA256.HashData(Encoding.UTF8.GetBytes(keyMaterial));
    }

    private string ResolveDataEncryptionKeyMaterial()
    {
        var fromConfig = NormalizeOptionalValue(licenseOptions.DataEncryptionKey);
        var envVarName = NormalizeOptionalValue(licenseOptions.DataEncryptionKeyEnvironmentVariable)
                         ?? "SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY";
        var fromEnvironment = NormalizeOptionalValue(Environment.GetEnvironmentVariable(envVarName));
        return fromEnvironment ?? fromConfig ?? string.Empty;
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static string? NormalizeOptionalValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}
