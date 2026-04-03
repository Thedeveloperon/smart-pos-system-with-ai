using System.Security.Cryptography;
using System.Text;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingSigningKeyBase64WebApplicationFactory : CustomWebApplicationFactory
{
    private const string SigningKeyBase64EnvVar = "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_TEST_BASE64";

    private readonly string verificationPublicKeyPem;

    public LicensingSigningKeyBase64WebApplicationFactory()
    {
        using var rsa = RSA.Create(2048);
        var privateKeyPkcs8Base64 = Convert.ToBase64String(rsa.ExportPkcs8PrivateKey());
        var wrappedPrivateKeyPkcs8Base64 = WrapAt(privateKeyPkcs8Base64, 64);
        verificationPublicKeyPem = rsa.ExportSubjectPublicKeyInfoPem();

        Environment.SetEnvironmentVariable(SigningKeyBase64EnvVar, wrappedPrivateKeyPkcs8Base64);
    }

    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["Licensing:DisallowInlinePrivateKey"] = "true",
            ["Licensing:SigningPrivateKeyPem"] = string.Empty,
            ["Licensing:SigningPrivateKeyEnvironmentVariable"] = SigningKeyBase64EnvVar,
            ["Licensing:SigningKeyId"] = "it-base64",
            ["Licensing:ActiveSigningKeyId"] = "it-base64",
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

        Environment.SetEnvironmentVariable(SigningKeyBase64EnvVar, null);
    }

    private static string WrapAt(string value, int length)
    {
        var builder = new StringBuilder(capacity: value.Length + (value.Length / length) + 8);
        for (var index = 0; index < value.Length; index += length)
        {
            var take = Math.Min(length, value.Length - index);
            builder.AppendLine(value.Substring(index, take));
        }

        return builder.ToString().Trim();
    }
}
