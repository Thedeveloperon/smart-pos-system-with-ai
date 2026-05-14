using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingKeyRotationTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;

    [Fact]
    public async Task GetStatusAsync_ShouldValidateTokenSignedWithPreviousKeyId()
    {
        await using var scope = appFactory.Services.CreateAsyncScope();
        var licenseService = scope.ServiceProvider.GetRequiredService<LicenseService>();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var options = scope.ServiceProvider.GetRequiredService<IOptions<LicenseOptions>>().Value;

        var deviceCode = $"rotate-kid-it-{Guid.NewGuid():N}";
        await licenseService.ActivateAsync(new ProvisionActivateRequest
        {
            DeviceCode = deviceCode,
            DeviceName = "Key Rotation Test Device",
            Actor = "integration-tests"
        }, CancellationToken.None);

        var previousKey = options.SigningKeys
            .Single(x => string.Equals(x.KeyId, "it-k1", StringComparison.Ordinal));
        var previousPrivateKeyPem = previousKey.PrivateKeyPem
            ?? throw new InvalidOperationException("Expected test key it-k1 to have a private key.");

        var provisionedDevice = await dbContext.ProvisionedDevices
            .Include(x => x.Shop)
            .SingleAsync(x => x.DeviceCode == deviceCode);
        var subscription = await dbContext.Subscriptions
            .SingleAsync(x => x.ShopId == provisionedDevice.ShopId);

        var now = DateTimeOffset.UtcNow;
        var validUntil = now.AddHours(1);
        var legacyLicenseId = Guid.NewGuid();
        var legacyJti = $"legacy-jti-{Guid.NewGuid():N}";
        var legacyPayload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            licenseId = legacyLicenseId,
            shopId = provisionedDevice.ShopId,
            deviceCode,
            validUntil,
            issuedAt = now,
            keyId = "it-k1",
            subscriptionStatus = subscription.Status.ToString().ToLowerInvariant(),
            plan = subscription.Plan,
            seatLimit = subscription.SeatLimit,
            jti = legacyJti
        });

        var payloadSegment = Base64UrlEncode(legacyPayload);
        var signatureBytes = SignPayload(payloadSegment, previousPrivateKeyPem);
        var signatureSegment = Base64UrlEncode(signatureBytes);
        var legacyToken = $"{payloadSegment}.{signatureSegment}";

        dbContext.Licenses.Add(new LicenseRecord
        {
            Id = legacyLicenseId,
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            Token = legacyToken,
            ValidUntil = validUntil,
            GraceUntil = validUntil.AddDays(7),
            SignatureAlgorithm = "RS256",
            SignatureKeyId = "it-k1",
            Signature = signatureSegment,
            Status = LicenseRecordStatus.Active,
            IssuedAtUtc = now,
            Shop = provisionedDevice.Shop,
            ProvisionedDevice = provisionedDevice
        });
        dbContext.LicenseTokenSessions.Add(new LicenseTokenSession
        {
            ShopId = provisionedDevice.ShopId,
            ProvisionedDeviceId = provisionedDevice.Id,
            LicenseId = legacyLicenseId,
            Jti = legacyJti,
            IssuedAtUtc = now,
            ExpiresAtUtc = validUntil,
            RejectAfterUtc = validUntil
        });

        await dbContext.SaveChangesAsync();

        var status = await licenseService.GetStatusAsync(deviceCode, legacyToken, CancellationToken.None);
        Assert.Equal("active", status.State);
    }

    private static byte[] SignPayload(string payloadSegment, string privateKeyPem)
    {
        using var rsa = RSA.Create();
        rsa.ImportFromPem(privateKeyPem.AsSpan());
        return rsa.SignData(
            Encoding.UTF8.GetBytes(payloadSegment),
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
