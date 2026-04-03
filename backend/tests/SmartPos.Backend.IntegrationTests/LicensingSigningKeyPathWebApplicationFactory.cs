using System.Security.Cryptography;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingSigningKeyPathWebApplicationFactory : CustomWebApplicationFactory
{
    private const string SigningKeyPathEnvVar = "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_TEST_FILE";

    private readonly string signingKeyFilePath;
    private readonly string verificationPublicKeyPem;

    public LicensingSigningKeyPathWebApplicationFactory()
    {
        using var rsa = RSA.Create(2048);
        var privateKeyPem = rsa.ExportRSAPrivateKeyPem();
        verificationPublicKeyPem = rsa.ExportSubjectPublicKeyInfoPem();

        signingKeyFilePath = Path.Combine(
            Path.GetTempPath(),
            $"smartpos-license-it-signing-key-{Guid.NewGuid():N}.pem");

        File.WriteAllText(signingKeyFilePath, privateKeyPem);
        Environment.SetEnvironmentVariable(SigningKeyPathEnvVar, signingKeyFilePath);
    }

    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["Licensing:DisallowInlinePrivateKey"] = "true",
            ["Licensing:SigningPrivateKeyPem"] = string.Empty,
            ["Licensing:SigningPrivateKeyEnvironmentVariable"] = SigningKeyPathEnvVar,
            ["Licensing:SigningKeyId"] = "it-file",
            ["Licensing:ActiveSigningKeyId"] = "it-file",
            ["Licensing:VerificationPublicKeyPem"] = verificationPublicKeyPem,
            ["Licensing:SigningKeys:0:KeyId"] = string.Empty,
            ["Licensing:SigningKeys:0:PrivateKeyPem"] = string.Empty,
            ["Licensing:SigningKeys:0:PublicKeyPem"] = string.Empty,
            ["Licensing:SigningKeys:1:KeyId"] = string.Empty,
            ["Licensing:SigningKeys:1:PrivateKeyPem"] = string.Empty,
            ["Licensing:SigningKeys:1:PublicKeyPem"] = string.Empty
        };
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (!disposing)
        {
            return;
        }

        Environment.SetEnvironmentVariable(SigningKeyPathEnvVar, null);

        try
        {
            if (File.Exists(signingKeyFilePath))
            {
                File.Delete(signingKeyFilePath);
            }
        }
        catch
        {
            // Best-effort cleanup for temp key file.
        }
    }
}
