using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class SensitiveActionDeviceProofTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task SensitiveMutation_WithValidProof_ShouldSucceed_AndReplayShouldFail()
    {
        await RunSensitiveMutationReplayScenarioAsync(DSASignatureFormat.Rfc3279DerSequence);
    }

    [Fact]
    public async Task SensitiveMutation_WithIeeeP1363Proof_ShouldSucceed_AndReplayShouldFail()
    {
        await RunSensitiveMutationReplayScenarioAsync(DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
    }

    [Fact]
    public async Task SensitiveMutation_WithTamperedProof_ShouldReturnInvalidDeviceProof()
    {
        var deviceCode = $"sensitive-proof-tamper-it-{Guid.NewGuid():N}";
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        await ActivateWithDeviceKeyAsync(deviceCode, ecdsa, DSASignatureFormat.Rfc3279DerSequence);

        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "manager",
            password = "manager123",
            device_code = deviceCode,
            device_name = "Sensitive Proof Tamper IT"
        });
        loginResponse.EnsureSuccessStatusCode();

        var productSearch = await TestJson.ReadObjectAsync(await client.GetAsync("/api/products/search"));
        var firstProduct = productSearch["items"]?.AsArray().OfType<JsonObject>().FirstOrDefault()
                           ?? throw new InvalidOperationException("No products found.");
        var productId = Guid.Parse(TestJson.GetString(firstProduct, "id"));

        var holdPayload = new
        {
            items = new[]
            {
                new
                {
                    product_id = productId,
                    quantity = 1m
                }
            },
            discount_percent = 0m,
            role = "cashier"
        };
        var holdBody = JsonSerializer.Serialize(holdPayload);

        var challenge = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/security/challenge", new { device_code = deviceCode }));
        var challengeId = TestJson.GetString(challenge, "challenge_id");
        var nonce = TestJson.GetString(challenge, "nonce");
        var timestampUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var bodyHash = ComputeHashHex(Encoding.UTF8.GetBytes(holdBody));
        var canonicalPayload = BuildApiProofPayload(
            challengeId,
            nonce,
            deviceCode,
            timestampUnix,
            "POST",
            "/api/checkout/hold",
            bodyHash);
        var signature = ecdsa.SignData(
            Encoding.UTF8.GetBytes(canonicalPayload),
            HashAlgorithmName.SHA256,
            DSASignatureFormat.Rfc3279DerSequence);
        signature[0] ^= 0x01;

        var request = new HttpRequestMessage(HttpMethod.Post, "/api/checkout/hold")
        {
            Content = new StringContent(holdBody, Encoding.UTF8, "application/json")
        };
        request.Headers.TryAddWithoutValidation("X-Device-Code", deviceCode);
        request.Headers.TryAddWithoutValidation("X-Device-Nonce-Id", challengeId);
        request.Headers.TryAddWithoutValidation("X-Device-Timestamp", timestampUnix.ToString());
        request.Headers.TryAddWithoutValidation("X-Device-Signature", Base64UrlEncode(signature));

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("INVALID_DEVICE_PROOF", payload?["error"]?["code"]?.GetValue<string>());
    }

    private async Task RunSensitiveMutationReplayScenarioAsync(DSASignatureFormat signatureFormat)
    {
        var deviceCode = $"sensitive-proof-it-{Guid.NewGuid():N}";
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        await ActivateWithDeviceKeyAsync(deviceCode, ecdsa, signatureFormat);

        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new
        {
            username = "manager",
            password = "manager123",
            device_code = deviceCode,
            device_name = "Sensitive Proof IT"
        });
        loginResponse.EnsureSuccessStatusCode();

        var productSearch = await TestJson.ReadObjectAsync(await client.GetAsync("/api/products/search"));
        var firstProduct = productSearch["items"]?.AsArray().OfType<JsonObject>().FirstOrDefault()
                           ?? throw new InvalidOperationException("No products found.");
        var productId = Guid.Parse(TestJson.GetString(firstProduct, "id"));

        var holdPayload = new
        {
            items = new[]
            {
                new
                {
                    product_id = productId,
                    quantity = 1m
                }
            },
            discount_percent = 0m,
            role = "cashier"
        };
        var holdBody = JsonSerializer.Serialize(holdPayload);

        var challenge = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/security/challenge", new { device_code = deviceCode }));
        var challengeId = TestJson.GetString(challenge, "challenge_id");
        var nonce = TestJson.GetString(challenge, "nonce");
        var timestampUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var bodyHash = ComputeHashHex(Encoding.UTF8.GetBytes(holdBody));
        var canonicalPayload = BuildApiProofPayload(
            challengeId,
            nonce,
            deviceCode,
            timestampUnix,
            "POST",
            "/api/checkout/hold",
            bodyHash);
        var signature = ecdsa.SignData(
            Encoding.UTF8.GetBytes(canonicalPayload),
            HashAlgorithmName.SHA256,
            signatureFormat);

        var firstRequest = new HttpRequestMessage(HttpMethod.Post, "/api/checkout/hold")
        {
            Content = new StringContent(holdBody, Encoding.UTF8, "application/json")
        };
        firstRequest.Headers.TryAddWithoutValidation("X-Device-Code", deviceCode);
        firstRequest.Headers.TryAddWithoutValidation("X-Device-Nonce-Id", challengeId);
        firstRequest.Headers.TryAddWithoutValidation("X-Device-Timestamp", timestampUnix.ToString());
        firstRequest.Headers.TryAddWithoutValidation("X-Device-Signature", Base64UrlEncode(signature));
        var firstResult = await client.SendAsync(firstRequest);
        Assert.Equal(HttpStatusCode.OK, firstResult.StatusCode);

        var replayRequest = new HttpRequestMessage(HttpMethod.Post, "/api/checkout/hold")
        {
            Content = new StringContent(holdBody, Encoding.UTF8, "application/json")
        };
        replayRequest.Headers.TryAddWithoutValidation("X-Device-Code", deviceCode);
        replayRequest.Headers.TryAddWithoutValidation("X-Device-Nonce-Id", challengeId);
        replayRequest.Headers.TryAddWithoutValidation("X-Device-Timestamp", timestampUnix.ToString());
        replayRequest.Headers.TryAddWithoutValidation("X-Device-Signature", Base64UrlEncode(signature));
        var replayResult = await client.SendAsync(replayRequest);
        Assert.Equal(HttpStatusCode.Conflict, replayResult.StatusCode);

        var replayPayload = await replayResult.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("CHALLENGE_CONSUMED", replayPayload?["error"]?["code"]?.GetValue<string>());
    }

    private async Task ActivateWithDeviceKeyAsync(string deviceCode, ECDsa ecdsa, DSASignatureFormat signatureFormat)
    {
        var publicKeySpki = ecdsa.ExportSubjectPublicKeyInfo();
        var keyFingerprint = ComputeHashHex(publicKeySpki);
        var challengePayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/challenge", new
            {
                device_code = deviceCode
            }));
        var challengeId = TestJson.GetString(challengePayload, "challenge_id");
        var nonce = TestJson.GetString(challengePayload, "nonce");
        var activationPayload = BuildActivationPayload(challengeId, nonce, deviceCode);
        var signature = ecdsa.SignData(
            Encoding.UTF8.GetBytes(activationPayload),
            HashAlgorithmName.SHA256,
            signatureFormat);

        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Sensitive Action Proof Device",
            actor = "integration-tests",
            key_fingerprint = keyFingerprint,
            public_key_spki = Base64UrlEncode(publicKeySpki),
            key_algorithm = "ECDSA_P256_SHA256",
            challenge_id = challengeId,
            challenge_signature = Base64UrlEncode(signature)
        });

        activationResponse.EnsureSuccessStatusCode();
    }

    private static string BuildActivationPayload(string challengeId, string nonce, string deviceCode)
    {
        return $"smartpos.provision.activate|{challengeId.Replace("-", string.Empty, StringComparison.Ordinal).ToLowerInvariant()}|{nonce}|{deviceCode.Trim()}";
    }

    private static string BuildApiProofPayload(
        string nonceId,
        string nonce,
        string deviceCode,
        long timestampUnix,
        string method,
        string pathAndQuery,
        string bodyHash)
    {
        return $"smartpos.api.request|{nonceId.Replace("-", string.Empty, StringComparison.Ordinal).ToLowerInvariant()}|{nonce}|{deviceCode.Trim()}|{timestampUnix}|{method.ToUpperInvariant()}|{pathAndQuery}|{bodyHash.ToLowerInvariant()}";
    }

    private static string ComputeHashHex(byte[] bytes)
    {
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
