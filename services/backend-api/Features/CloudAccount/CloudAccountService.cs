using System.Net.Http.Headers;
using System.Security.Claims;
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
    IHttpContextAccessor httpContextAccessor)
{
    private const string CloudAccountLinkClientName = "cloud-account-link";
    private const string CloudAuthCookieName = "smartpos_auth";
    private const string CloudUserIdCookieName = "smartpos_user_id";
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
        var client = httpClientFactory.CreateClient(CloudAccountLinkClientName);

        var loginPayload = new
        {
            username = normalizedUsername,
            password
        };

        var loginResult = await LoginToCloudAsync(
            client,
            cloudBaseUrl,
            loginPayload,
            cancellationToken);
        var cloudLogin = loginResult.Login;
        CloudTenantContextResponse tenantContext;
        try
        {
            tenantContext = await ResolveTenantContextAsync(
                client,
                cloudBaseUrl,
                loginResult.CookieHeader,
                cloudLogin,
                cancellationToken);
        }
        catch (InvalidOperationException)
        {
            // Credential-only linking mode: shop/tenant mapping issues must not block successful cloud auth.
            tenantContext = new CloudTenantContextResponse
            {
                ShopCode = localShopCode,
                Username = NormalizeOptionalValue(cloudLogin.Username) ?? string.Empty,
                FullName = NormalizeOptionalValue(cloudLogin.FullName) ?? string.Empty,
                Role = NormalizeOptionalValue(cloudLogin.Role) ?? string.Empty
            };
        }

        var normalizedCloudShopCode = NormalizeOptionalValue(tenantContext.ShopCode) ?? localShopCode;

        var now = DateTimeOffset.UtcNow;
        var existingRows = (await dbContext.CloudAccountLinks
            .ToListAsync(cancellationToken))
            .OrderByDescending(x => x.LinkedAtUtc.UtcDateTime.Ticks)
            .ToList();
        var link = existingRows.FirstOrDefault();
        var encryptedToken = ProtectSensitiveValue(loginResult.AuthToken);
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
        var principal = httpContextAccessor.HttpContext?.User;
        var userId = ParseGuid(
            principal?.FindFirstValue(ClaimTypes.NameIdentifier) ??
            principal?.FindFirstValue("sub"));
        if (!userId.HasValue)
        {
            throw new InvalidOperationException("Authenticated user is invalid.");
        }

        var user = await dbContext.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == userId.Value && x.IsActive, cancellationToken);
        if (user is null)
        {
            throw new InvalidOperationException("Authenticated user is not available.");
        }

        if (!user.StoreId.HasValue || user.StoreId == Guid.Empty)
        {
            throw new InvalidOperationException("Local user is not mapped to a shop.");
        }

        var shop = await dbContext.Shops
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == user.StoreId.Value && x.IsActive, cancellationToken);
        if (shop is null)
        {
            throw new InvalidOperationException("Local shop mapping is invalid.");
        }

        var localShopCode = NormalizeOptionalValue(shop.Code);
        if (string.IsNullOrWhiteSpace(localShopCode))
        {
            throw new InvalidOperationException("Local shop code could not be resolved.");
        }

        return localShopCode;
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

    private async Task<CloudLoginResult> LoginToCloudAsync(
        HttpClient client,
        string cloudBaseUrl,
        object loginPayload,
        CancellationToken cancellationToken)
    {
        var payloadJson = JsonSerializer.Serialize(loginPayload, JsonOptions);
        var loginPaths = new[]
        {
            "/api/auth/login",
            "/api/account/login",
            "/auth/json-login"
        };
        var encounteredProvisioningBoundLoginError = false;

        foreach (var path in loginPaths)
        {
            using var loginRequest = BuildRequest(
                client,
                HttpMethod.Post,
                cloudBaseUrl,
                path,
                payloadJson);
            using var loginResponse = await SendAsync(client, loginRequest, cancellationToken);
            var loginBody = await loginResponse.Content.ReadAsStringAsync(cancellationToken);

            if (!loginResponse.IsSuccessStatusCode)
            {
                if (loginResponse.StatusCode == System.Net.HttpStatusCode.NotFound ||
                    loginResponse.StatusCode == System.Net.HttpStatusCode.MethodNotAllowed)
                {
                    continue;
                }

                var parsedLoginError = ParseCloudErrorMessage(
                    loginResponse.StatusCode,
                    loginBody,
                    "Cloud login failed.");
                if (IsProvisioningBoundError(parsedLoginError))
                {
                    encounteredProvisioningBoundLoginError = true;
                    continue;
                }

                throw new InvalidOperationException(parsedLoginError);
            }

            var cloudLogin = BuildCloudLoginResponse(loginBody);
            if (!TryBuildCookieHeader(loginResponse.Headers, loginBody, out var cookieHeader))
            {
                throw new InvalidOperationException("Cloud login succeeded but auth session cookie was not returned.");
            }

            var cloudAuthToken = ResolveCloudAuthToken(cookieHeader, loginBody);
            if (string.IsNullOrWhiteSpace(cloudAuthToken))
            {
                throw new InvalidOperationException("Cloud login succeeded but auth session token could not be resolved.");
            }

            if (cloudLogin.ExpiresAt <= DateTimeOffset.UtcNow.AddMinutes(1))
            {
                cloudLogin.ExpiresAt = TryExtractJwtExpiry(cloudAuthToken)
                                       ?? DateTimeOffset.UtcNow.AddHours(12);
            }

            if (string.IsNullOrWhiteSpace(cloudLogin.Username))
            {
                cloudLogin.Username = NormalizeOptionalValue(
                    TryExtractJsonString(loginBody, "username", "user.username", "profile.username", "email"))
                    ?? string.Empty;
            }

            if (string.IsNullOrWhiteSpace(cloudLogin.FullName))
            {
                cloudLogin.FullName = NormalizeOptionalValue(
                    TryExtractJsonString(loginBody, "full_name", "user.full_name", "profile.full_name", "name", "user.name"))
                    ?? string.Empty;
            }

            if (string.IsNullOrWhiteSpace(cloudLogin.Role))
            {
                cloudLogin.Role = NormalizeOptionalValue(
                    TryExtractJsonString(loginBody, "role", "user.role", "profile.role"))
                    ?? string.Empty;
            }

            return new CloudLoginResult(cloudLogin, cloudAuthToken, cookieHeader);
        }

        if (encounteredProvisioningBoundLoginError)
        {
            throw new InvalidOperationException(
                "Cloud login in the current deployment is tied to device provisioning. " +
                "Use/deploy a credential-only login route (for example '/api/auth/login' or '/auth/json-login' without device provisioning checks) and try again.");
        }

        throw new InvalidOperationException(
            "Configured cloud service does not expose a supported login endpoint. Expected '/api/auth/login', '/api/account/login', or '/auth/json-login'.");
    }

    private async Task<CloudTenantContextResponse> ResolveTenantContextAsync(
        HttpClient client,
        string cloudBaseUrl,
        string cloudCookieHeader,
        CloudLoginResponse cloudLogin,
        CancellationToken cancellationToken)
    {
        using var tenantRequest = BuildRequest(
            client,
            HttpMethod.Get,
            cloudBaseUrl,
            "/api/account/tenant-context");
        tenantRequest.Headers.TryAddWithoutValidation("Cookie", cloudCookieHeader);
        using var tenantResponse = await SendAsync(client, tenantRequest, cancellationToken);
        var tenantBody = await tenantResponse.Content.ReadAsStringAsync(cancellationToken);

        if (tenantResponse.IsSuccessStatusCode)
        {
            return DeserializePayload<CloudTenantContextResponse>(
                tenantBody,
                "Cloud tenant context response is invalid.");
        }

        if (tenantResponse.StatusCode != System.Net.HttpStatusCode.NotFound)
        {
            var parsedTenantContextError = ParseCloudErrorMessage(
                tenantResponse.StatusCode,
                tenantBody,
                "Unable to resolve cloud account tenant context.");
            if (!IsProvisioningBoundError(parsedTenantContextError))
            {
                throw new InvalidOperationException(parsedTenantContextError);
            }
        }

        var fallbackPaths = new[]
        {
            "/api/account/license-portal",
            "/api/license/account/licenses",
            "/api/account/me",
            "/users/me"
        };
        var encounteredProvisioningBoundFallbackError = false;
        foreach (var path in fallbackPaths)
        {
            using var fallbackRequest = BuildRequest(
                client,
                HttpMethod.Get,
                cloudBaseUrl,
                path);
            fallbackRequest.Headers.TryAddWithoutValidation("Cookie", cloudCookieHeader);
            if (path.Equals("/users/me", StringComparison.OrdinalIgnoreCase) &&
                TryExtractCookieValue(cloudCookieHeader, CloudUserIdCookieName) is { } cloudUserId)
            {
                fallbackRequest.Headers.TryAddWithoutValidation("x-user-id", cloudUserId);
            }
            using var fallbackResponse = await SendAsync(client, fallbackRequest, cancellationToken);
            var fallbackBody = await fallbackResponse.Content.ReadAsStringAsync(cancellationToken);

            if (!fallbackResponse.IsSuccessStatusCode)
            {
                if (fallbackResponse.StatusCode == System.Net.HttpStatusCode.NotFound)
                {
                    continue;
                }

                var parsedFallbackError = ParseCloudErrorMessage(
                    fallbackResponse.StatusCode,
                    fallbackBody,
                    "Unable to resolve cloud account tenant context.");
                if (IsProvisioningBoundError(parsedFallbackError))
                {
                    encounteredProvisioningBoundFallbackError = true;
                    continue;
                }

                throw new InvalidOperationException(parsedFallbackError);
            }

            var fallbackTenantContext = TryExtractTenantContextFromFallback(fallbackBody, cloudLogin);
            if (fallbackTenantContext is null || string.IsNullOrWhiteSpace(fallbackTenantContext.ShopCode))
            {
                throw new InvalidOperationException("Cloud account tenant mapping is missing shop code.");
            }

            return fallbackTenantContext;
        }

        if (encounteredProvisioningBoundFallbackError)
        {
            throw new InvalidOperationException(
                "Cloud tenant mapping is unavailable in the current deployment. " +
                "Deploy '/api/account/tenant-context' in cloud backend (or update account portal tenant mapping to avoid device provisioning dependency) and try again.");
        }

        throw new InvalidOperationException(
            "Configured cloud service does not expose tenant context. Expected '/api/account/tenant-context' or '/api/account/license-portal'.");
    }

    private static CloudTenantContextResponse? TryExtractTenantContextFromFallback(
        string payload,
        CloudLoginResponse cloudLogin)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(payload);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var shopCode = TryExtractJsonString(root,
                "shop_code",
                "shopCode",
                "store_code",
                "storeCode",
                "user.shop_code",
                "profile.shop_code");
            if (string.IsNullOrWhiteSpace(shopCode))
            {
                return null;
            }

            var shopIdText = TryExtractJsonString(root, "shop_id", "shopId", "user.shop_id", "profile.shop_id");
            var parsedShopId = ParseGuid(shopIdText) ?? Guid.Empty;

            return new CloudTenantContextResponse
            {
                ShopId = parsedShopId,
                ShopCode = shopCode,
                Username = NormalizeOptionalValue(
                    TryExtractJsonString(root, "username", "user.username", "profile.username", "email"))
                    ?? NormalizeOptionalValue(cloudLogin.Username)
                    ?? string.Empty,
                FullName = NormalizeOptionalValue(
                    TryExtractJsonString(root, "full_name", "fullName", "name", "user.full_name", "profile.full_name"))
                    ?? NormalizeOptionalValue(cloudLogin.FullName)
                    ?? string.Empty,
                Role = NormalizeOptionalValue(
                    TryExtractJsonString(root, "role", "user.role", "profile.role"))
                    ?? NormalizeOptionalValue(cloudLogin.Role)
                    ?? string.Empty
            };
        }
        catch (JsonException)
        {
            return null;
        }
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

    private static bool IsProvisioningBoundError(string? errorMessage)
    {
        if (string.IsNullOrWhiteSpace(errorMessage))
        {
            return false;
        }

        return errorMessage.Contains("not provisioned", StringComparison.OrdinalIgnoreCase)
               || errorMessage.Contains("provisioned yet", StringComparison.OrdinalIgnoreCase);
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

    private static CloudLoginResponse BuildCloudLoginResponse(string loginBody)
    {
        CloudLoginResponse? parsed = null;
        if (!string.IsNullOrWhiteSpace(loginBody))
        {
            try
            {
                parsed = JsonSerializer.Deserialize<CloudLoginResponse>(loginBody, JsonOptions);
            }
            catch (JsonException)
            {
                parsed = null;
            }
        }

        parsed ??= new CloudLoginResponse();
        return parsed;
    }

    private static DateTimeOffset? TryExtractJwtExpiry(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        var parts = token.Split('.');
        if (parts.Length < 2)
        {
            return null;
        }

        try
        {
            var payload = parts[1]
                .Replace('-', '+')
                .Replace('_', '/');
            var remainder = payload.Length % 4;
            if (remainder is > 0 and < 4)
            {
                payload = payload.PadRight(payload.Length + (4 - remainder), '=');
            }

            var bytes = Convert.FromBase64String(payload);
            using var doc = JsonDocument.Parse(bytes);
            if (!doc.RootElement.TryGetProperty("exp", out var expNode))
            {
                return null;
            }

            if (expNode.ValueKind == JsonValueKind.Number &&
                expNode.TryGetInt64(out var expSeconds))
            {
                return DateTimeOffset.FromUnixTimeSeconds(expSeconds);
            }

            return null;
        }
        catch
        {
            return null;
        }
    }

    private static string? TryExtractJsonString(string payload, params string[] paths)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(payload);
            return TryExtractJsonString(doc.RootElement, paths);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? TryExtractJsonString(JsonElement element, params string[] paths)
    {
        if (element.ValueKind != JsonValueKind.Object || paths.Length == 0)
        {
            return null;
        }

        foreach (var path in paths)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                continue;
            }

            var current = element;
            var found = true;
            foreach (var rawSegment in path.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (current.ValueKind != JsonValueKind.Object ||
                    !TryGetPropertyCaseInsensitive(current, rawSegment, out var next))
                {
                    found = false;
                    break;
                }

                current = next;
            }

            if (!found || current.ValueKind != JsonValueKind.String)
            {
                continue;
            }

            var normalized = NormalizeOptionalValue(current.GetString());
            if (!string.IsNullOrWhiteSpace(normalized))
            {
                return normalized;
            }
        }

        return null;
    }

    private static bool TryGetPropertyCaseInsensitive(JsonElement element, string propertyName, out JsonElement value)
    {
        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }

        value = default;
        return false;
    }

    private static bool TryBuildCookieHeader(
        HttpResponseHeaders headers,
        string loginBody,
        out string cookieHeader)
    {
        cookieHeader = string.Empty;
        var cookieSegments = new List<string>();
        if (!headers.TryGetValues("Set-Cookie", out var values))
        {
            return TryBuildSyntheticCookieHeader(loginBody, out cookieHeader);
        }

        foreach (var headerValue in values)
        {
            var firstSegment = headerValue
                .Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(firstSegment))
            {
                cookieSegments.Add(firstSegment);
            }
        }

        if (cookieSegments.Count == 0)
        {
            return TryBuildSyntheticCookieHeader(loginBody, out cookieHeader);
        }

        cookieHeader = string.Join("; ", cookieSegments);
        return true;
    }

    private static bool TryBuildSyntheticCookieHeader(string loginBody, out string cookieHeader)
    {
        cookieHeader = string.Empty;
        var authToken = TryExtractJsonString(
            loginBody,
            "smartpos_auth",
            "auth_token",
            "token",
            "access_token",
            "session.token",
            "session.access_token",
            "data.token");
        if (string.IsNullOrWhiteSpace(authToken))
        {
            return false;
        }

        var cookieParts = new List<string> { $"{CloudAuthCookieName}={authToken}" };
        var userId = TryExtractJsonString(loginBody, "user_id", "user.id", "profile.id", "id");
        if (!string.IsNullOrWhiteSpace(userId))
        {
            cookieParts.Add($"{CloudUserIdCookieName}={userId}");
        }

        cookieHeader = string.Join("; ", cookieParts);
        return true;
    }

    private static string? ResolveCloudAuthToken(string cookieHeader, string loginBody)
    {
        return TryExtractCookieValue(cookieHeader, CloudAuthCookieName)
               ?? TryExtractCookieValue(cookieHeader, "auth_token")
               ?? TryExtractCookieValue(cookieHeader, "access_token")
               ?? TryExtractCookieValue(cookieHeader, "token")
               ?? TryExtractJsonString(
                   loginBody,
                   "smartpos_auth",
                   "auth_token",
                   "token",
                   "access_token",
                   "session.token",
                   "session.access_token",
                   "data.token");
    }

    private static string? TryExtractCookieValue(string cookieHeader, string cookieName)
    {
        if (string.IsNullOrWhiteSpace(cookieHeader))
        {
            return null;
        }

        var segments = cookieHeader.Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        foreach (var segment in segments)
        {
            var separator = segment.IndexOf('=');
            if (separator <= 0)
            {
                continue;
            }

            var key = segment[..separator].Trim();
            if (!string.Equals(key, cookieName, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var value = segment[(separator + 1)..].Trim().Trim('"');
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        return null;
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

    private static Guid? ParseGuid(string? value)
    {
        return Guid.TryParse(value, out var parsed) ? parsed : null;
    }

    private sealed record CloudLoginResult(
        CloudLoginResponse Login,
        string AuthToken,
        string CookieHeader);
}
