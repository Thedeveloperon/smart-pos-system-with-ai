namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingMissingSigningKeyWebApplicationFactory : CustomWebApplicationFactory
{
    protected override IReadOnlyDictionary<string, string?> GetAdditionalConfigurationOverrides()
    {
        return new Dictionary<string, string?>
        {
            ["Licensing:DisallowInlinePrivateKey"] = "true",
            ["Licensing:SigningPrivateKeyPem"] = string.Empty,
            ["Licensing:SigningPrivateKeyEnvironmentVariable"] = "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_TEST_UNSET",
            ["Licensing:SigningKeys:0:KeyId"] = string.Empty,
            ["Licensing:SigningKeys:0:PrivateKeyPem"] = string.Empty,
            ["Licensing:SigningKeys:0:PublicKeyPem"] = string.Empty,
            ["Licensing:SigningKeys:1:KeyId"] = string.Empty,
            ["Licensing:SigningKeys:1:PrivateKeyPem"] = string.Empty,
            ["Licensing:SigningKeys:1:PublicKeyPem"] = string.Empty
        };
    }
}
