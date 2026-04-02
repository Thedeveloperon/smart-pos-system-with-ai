using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingTokenIssuanceTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task ActivateAsync_ShouldIssueShortLivedTokenWithSubscriptionClaims()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var deviceCode = $"token-issue-it-{Guid.NewGuid():N}";
        var activation = await licenseService.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = deviceCode,
            DeviceName = "Token Issuance Test Device",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var token = activation.LicenseToken
                    ?? throw new InvalidOperationException("Activation did not return a license token.");
        var payload = ParseTokenPayload(token);

        Assert.Equal("trialing", payload.SubscriptionStatus);
        Assert.Equal("trial", payload.Plan);
        Assert.Equal(3, payload.SeatLimit);
        Assert.False(string.IsNullOrWhiteSpace(payload.Jti));
        Assert.True(payload.ValidUntil > payload.IssuedAt);
        Assert.True(payload.ValidUntil <= payload.IssuedAt.AddMinutes(16));

        var licenseRecord = await dbContext.Licenses
            .AsNoTracking()
            .Include(x => x.ProvisionedDevice)
            .SingleAsync(x => x.ProvisionedDevice.DeviceCode == deviceCode && x.Status == LicenseRecordStatus.Active);
        Assert.Equal("RS256", licenseRecord.SignatureAlgorithm);
        Assert.Equal("it-k2", licenseRecord.SignatureKeyId);
    }

    [Fact]
    public async Task HeartbeatAsync_AfterSubscriptionReconciliation_ShouldIssueTokenFromUpdatedState()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var deviceCode = $"token-reconcile-it-{Guid.NewGuid():N}";
        var activation = await licenseService.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = deviceCode,
            DeviceName = "Token Reconcile Device",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var reconciledPeriodEnd = DateTimeOffset.UtcNow.AddHours(2);
        await licenseService.ReconcileSubscriptionStateAsync(new SubscriptionReconciliationRequest
        {
            ShopCode = "default",
            SubscriptionStatus = "active",
            Plan = "growth",
            PeriodStart = DateTimeOffset.UtcNow.AddDays(-1),
            PeriodEnd = reconciledPeriodEnd,
            Actor = "integration-tests",
            Reason = "token issuance state coverage"
        }, CancellationToken.None);

        var reissuedStatus = await licenseService.GetStatusAsync(deviceCode, null, CancellationToken.None);
        var reissuedToken = reissuedStatus.LicenseToken
                            ?? throw new InvalidOperationException("Expected a reissued active token after reconciliation.");

        var heartbeat = await licenseService.HeartbeatAsync(new LicenseHeartbeatRequest
        {
            DeviceCode = deviceCode,
            LicenseToken = reissuedToken
        }, CancellationToken.None);

        var refreshedToken = heartbeat.LicenseToken
                            ?? throw new InvalidOperationException("Heartbeat did not return a license token.");
        var payload = ParseTokenPayload(refreshedToken);

        Assert.Equal("active", payload.SubscriptionStatus);
        Assert.Equal("growth", payload.Plan);
        Assert.Equal(5, payload.SeatLimit);
        Assert.False(string.IsNullOrWhiteSpace(payload.Jti));
        Assert.True(payload.ValidUntil <= reconciledPeriodEnd.AddMinutes(1));
        Assert.True(payload.ValidUntil > payload.IssuedAt);
    }

    private static TokenPayloadSnapshot ParseTokenPayload(string token)
    {
        var parts = token.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2)
        {
            throw new InvalidOperationException("license_token format is invalid.");
        }

        var payloadBytes = Base64UrlDecode(parts[0]);
        using var document = JsonDocument.Parse(payloadBytes);
        var root = document.RootElement;

        return new TokenPayloadSnapshot
        {
            IssuedAt = root.GetProperty("issuedAt").GetDateTimeOffset(),
            ValidUntil = root.GetProperty("validUntil").GetDateTimeOffset(),
            SubscriptionStatus = root.GetProperty("subscriptionStatus").GetString() ?? string.Empty,
            Plan = root.GetProperty("plan").GetString() ?? string.Empty,
            SeatLimit = root.GetProperty("seatLimit").GetInt32(),
            Jti = root.GetProperty("jti").GetString() ?? string.Empty
        };
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        var padding = 4 - (normalized.Length % 4);
        if (padding is > 0 and < 4)
        {
            normalized += new string('=', padding);
        }

        return Convert.FromBase64String(normalized);
    }

    private sealed class TokenPayloadSnapshot
    {
        public DateTimeOffset IssuedAt { get; set; }
        public DateTimeOffset ValidUntil { get; set; }
        public string SubscriptionStatus { get; set; } = string.Empty;
        public string Plan { get; set; } = string.Empty;
        public int SeatLimit { get; set; }
        public string Jti { get; set; } = string.Empty;
    }
}
