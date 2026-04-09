using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingDeviceKeyBindingTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task Activation_WithValidChallengeProof_ShouldBindDeviceKeyAndIssueFingerprintClaim()
    {
        var deviceCode = $"device-key-it-{Guid.NewGuid():N}";
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var publicKeySpki = key.ExportSubjectPublicKeyInfo();
        var keyFingerprint = ComputeFingerprint(publicKeySpki);

        var challengePayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/challenge", new
            {
                device_code = deviceCode
            }));

        var challengeId = TestJson.GetString(challengePayload, "challenge_id");
        var nonce = TestJson.GetString(challengePayload, "nonce");
        var proofPayload = BuildActivationPayload(challengeId, nonce, deviceCode);
        var signature = key.SignData(
            Encoding.UTF8.GetBytes(proofPayload),
            HashAlgorithmName.SHA256,
            DSASignatureFormat.Rfc3279DerSequence);

        var activation = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = deviceCode,
                device_name = "Device Key IT",
                actor = "integration-tests",
                key_fingerprint = keyFingerprint,
                public_key_spki = Base64UrlEncode(publicKeySpki),
                key_algorithm = "ECDSA_P256_SHA256",
                challenge_id = challengeId,
                challenge_signature = Base64UrlEncode(signature)
            }));

        Assert.Equal("active", TestJson.GetString(activation, "state"));
        Assert.Equal(keyFingerprint, TestJson.GetString(activation, "device_key_fingerprint"));

        var issuedToken = TestJson.GetString(activation, "license_token");
        Assert.False(string.IsNullOrWhiteSpace(issuedToken));
        var tokenPayload = ParseTokenPayload(issuedToken);
        Assert.Equal(keyFingerprint, tokenPayload.DeviceKeyFingerprint);
    }

    [Fact]
    public async Task Activation_WithIeeeP1363ChallengeProof_ShouldBindDeviceKey()
    {
        var deviceCode = $"device-key-p1363-it-{Guid.NewGuid():N}";
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var publicKeySpki = key.ExportSubjectPublicKeyInfo();
        var keyFingerprint = ComputeFingerprint(publicKeySpki);

        var challengePayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/challenge", new
            {
                device_code = deviceCode
            }));

        var challengeId = TestJson.GetString(challengePayload, "challenge_id");
        var nonce = TestJson.GetString(challengePayload, "nonce");
        var proofPayload = BuildActivationPayload(challengeId, nonce, deviceCode);
        var signature = key.SignData(
            Encoding.UTF8.GetBytes(proofPayload),
            HashAlgorithmName.SHA256,
            DSASignatureFormat.IeeeP1363FixedFieldConcatenation);

        var activationResponse = await client.PostAsJsonAsync("/api/provision/activate", new
        {
            device_code = deviceCode,
            device_name = "Device Key P1363 IT",
            actor = "integration-tests",
            key_fingerprint = keyFingerprint,
            public_key_spki = Base64UrlEncode(publicKeySpki),
            key_algorithm = "ECDSA_P256_SHA256",
            challenge_id = challengeId,
            challenge_signature = Base64UrlEncode(signature)
        });

        activationResponse.EnsureSuccessStatusCode();
        var activation = await TestJson.ReadObjectAsync(activationResponse);
        Assert.Equal("active", TestJson.GetString(activation, "state"));
        Assert.Equal(keyFingerprint, TestJson.GetString(activation, "device_key_fingerprint"));
    }

    [Fact]
    public async Task Activation_WithReplayedChallenge_ShouldReturnChallengeConsumed()
    {
        var deviceCode = $"device-key-replay-it-{Guid.NewGuid():N}";
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var publicKeySpki = key.ExportSubjectPublicKeyInfo();
        var keyFingerprint = ComputeFingerprint(publicKeySpki);

        var challengePayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/challenge", new
            {
                device_code = deviceCode
            }));

        var challengeId = TestJson.GetString(challengePayload, "challenge_id");
        var nonce = TestJson.GetString(challengePayload, "nonce");
        var proofPayload = BuildActivationPayload(challengeId, nonce, deviceCode);
        var signature = key.SignData(
            Encoding.UTF8.GetBytes(proofPayload),
            HashAlgorithmName.SHA256,
            DSASignatureFormat.Rfc3279DerSequence);

        var requestPayload = new
        {
            device_code = deviceCode,
            device_name = "Device Key Replay IT",
            actor = "integration-tests",
            key_fingerprint = keyFingerprint,
            public_key_spki = Base64UrlEncode(publicKeySpki),
            key_algorithm = "ECDSA_P256_SHA256",
            challenge_id = challengeId,
            challenge_signature = Base64UrlEncode(signature)
        };

        var firstResponse = await client.PostAsJsonAsync("/api/provision/activate", requestPayload);
        firstResponse.EnsureSuccessStatusCode();

        var replayResponse = await client.PostAsJsonAsync("/api/provision/activate", requestPayload);
        Assert.Equal(HttpStatusCode.Conflict, replayResponse.StatusCode);

        var replayPayload = await ReadJsonAsync(replayResponse);
        Assert.Equal("CHALLENGE_CONSUMED", replayPayload["error"]?["code"]?.GetValue<string>());
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }

    private static string BuildActivationPayload(string challengeId, string nonce, string deviceCode)
    {
        return $"smartpos.provision.activate|{challengeId.Replace("-", string.Empty, StringComparison.Ordinal).ToLowerInvariant()}|{nonce}|{deviceCode.Trim()}";
    }

    private static string ComputeFingerprint(byte[] publicKeySpki)
    {
        var digest = SHA256.HashData(publicKeySpki);
        return Convert.ToHexString(digest).ToLowerInvariant();
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
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
            DeviceKeyFingerprint = root.TryGetProperty("deviceKeyFingerprint", out var claim)
                ? claim.GetString() ?? string.Empty
                : string.Empty
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
        public string DeviceKeyFingerprint { get; set; } = string.Empty;
    }
}
