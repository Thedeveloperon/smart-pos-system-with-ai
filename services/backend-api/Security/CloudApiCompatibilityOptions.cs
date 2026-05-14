namespace SmartPos.Backend.Security;

public sealed class CloudApiCompatibilityOptions
{
    public const string SectionName = "CloudApi";

    public string ApiVersion { get; set; } = "v1";
    public bool EnforceMinimumSupportedPosVersion { get; set; } = true;
    public string MinimumSupportedPosVersion { get; set; } = "1.0.0";
    public string LatestPosVersion { get; set; } = "1.0.0";
    public bool LegacyApiDeprecationEnabled { get; set; } = true;
    public string LegacyApiDeprecationDateUtc { get; set; } = "2026-04-08T00:00:00Z";
    public string LegacyApiSunsetDateUtc { get; set; } = "2026-07-08T00:00:00Z";
    public string LegacyApiMigrationGuideUrl { get; set; } = "/cloud/v1/meta/contracts";
    public string DefaultReleaseChannel { get; set; } = "stable";
    public bool RequireInstallerChecksumInReleaseMetadata { get; set; } = true;
    public bool RequireInstallerSignatureInReleaseMetadata { get; set; } = true;
    public bool AllowRollbackToPreviousStable { get; set; } = true;
    public string? MinimumRollbackTargetVersion { get; set; }
    public List<CloudApiReleaseChannelOptions> ReleaseChannels { get; set; } =
    [
        new()
        {
            Channel = "stable",
            LatestPosVersion = "1.0.0",
            MinimumSupportedPosVersion = "1.0.0",
            InstallerDownloadUrl = "https://downloads.smartpos.test/stable/SmartPOS-Setup.exe",
            InstallerChecksumSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            InstallerSignatureSha256 = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            InstallerSignatureAlgorithm = "sha256-rsa",
            ReleaseNotesUrl = "https://docs.smartpos.test/releases/stable/1.0.0",
            PublishedAtUtc = "2026-04-08T00:00:00Z",
            RollbackTargetVersion = "1.0.0"
        },
        new()
        {
            Channel = "beta",
            LatestPosVersion = "1.1.0-beta.1",
            MinimumSupportedPosVersion = "1.0.0",
            InstallerDownloadUrl = "https://downloads.smartpos.test/beta/SmartPOS-Setup.exe",
            InstallerChecksumSha256 = "1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            InstallerSignatureSha256 = "bbcd1234567890abcdef0123456789abcdef0123456789abcdef0123456789ab",
            InstallerSignatureAlgorithm = "sha256-rsa",
            ReleaseNotesUrl = "https://docs.smartpos.test/releases/beta/1.1.0-beta.1",
            PublishedAtUtc = "2026-04-08T00:00:00Z"
        },
        new()
        {
            Channel = "internal",
            LatestPosVersion = "1.1.0-internal.1",
            MinimumSupportedPosVersion = "1.0.0",
            InstallerDownloadUrl = "https://downloads.smartpos.test/internal/SmartPOS-Setup.exe",
            InstallerChecksumSha256 = "2123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            InstallerSignatureSha256 = "ccde1234567890abcdef0123456789abcdef0123456789abcdef0123456789ab",
            InstallerSignatureAlgorithm = "sha256-rsa",
            ReleaseNotesUrl = "https://docs.smartpos.test/releases/internal/1.1.0-internal.1",
            PublishedAtUtc = "2026-04-08T00:00:00Z"
        }
    ];
    public string[] RequiredWriteHeaders { get; set; } =
    [
        CloudWriteRequestContract.IdempotencyHeaderName,
        CloudWriteRequestContract.DeviceIdHeaderName,
        CloudWriteRequestContract.PosVersionHeaderName
    ];
}

public sealed class CloudApiReleaseChannelOptions
{
    public string Channel { get; set; } = string.Empty;
    public string LatestPosVersion { get; set; } = "1.0.0";
    public string MinimumSupportedPosVersion { get; set; } = "1.0.0";
    public string InstallerDownloadUrl { get; set; } = string.Empty;
    public string InstallerChecksumSha256 { get; set; } = string.Empty;
    public string InstallerSignatureSha256 { get; set; } = string.Empty;
    public string InstallerSignatureAlgorithm { get; set; } = "sha256-rsa";
    public string? ReleaseNotesUrl { get; set; }
    public string? PublishedAtUtc { get; set; }
    public string? RollbackTargetVersion { get; set; }
}
