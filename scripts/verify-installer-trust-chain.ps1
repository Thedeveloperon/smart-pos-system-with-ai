param(
    [Parameter(Mandatory = $true)][string]$InstallerPath,
    [string]$AppVersion = "0.0.0",
    [string]$Channel = "stable",
    [string]$ExpectedSha256 = "",
    [switch]$RequireAuthenticodeSignature,
    [string[]]$AllowedSignerThumbprints = @(),
    [string]$ManifestOutputPath = "",
    [string]$SignatureAlgorithm = "sha256-rsa",
    [string]$ReleaseNotesUrl = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Normalize-Optional {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    return $Value.Trim()
}

if (-not (Test-Path -LiteralPath $InstallerPath)) {
    throw "Installer not found: $InstallerPath"
}

$resolvedInstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
$hash = Get-FileHash -LiteralPath $resolvedInstallerPath -Algorithm SHA256
$computedSha256 = $hash.Hash.ToLowerInvariant()
$expectedSha256Normalized = Normalize-Optional -Value $ExpectedSha256

if ($expectedSha256Normalized -and
    -not [string]::Equals($computedSha256, $expectedSha256Normalized.ToLowerInvariant(), [System.StringComparison]::Ordinal)) {
    throw "Installer SHA-256 mismatch. expected=$expectedSha256Normalized actual=$computedSha256"
}

$signature = Get-AuthenticodeSignature -FilePath $resolvedInstallerPath
$signatureStatus = $signature.Status.ToString()
$signerThumbprint = Normalize-Optional -Value $signature.SignerCertificate?.Thumbprint
$signerSubject = Normalize-Optional -Value $signature.SignerCertificate?.Subject
$timestampSubject = Normalize-Optional -Value $signature.TimeStamperCertificate?.Subject

$thumbprints = @($AllowedSignerThumbprints |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_.Trim().ToLowerInvariant() })

if ($RequireAuthenticodeSignature) {
    if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
        throw "Authenticode signature is required but signature status is '$signatureStatus'."
    }

    if ($thumbprints.Count -gt 0) {
        if (-not $signerThumbprint) {
            throw "Authenticode signature is valid but signer thumbprint is missing."
        }

        $signerThumbprintNormalized = $signerThumbprint.ToLowerInvariant()
        if ($thumbprints -notcontains $signerThumbprintNormalized) {
            throw "Signer thumbprint '$signerThumbprint' is not in allowed signer list."
        }
    }
}

$normalizedChannel = Normalize-Optional -Value $Channel
if (-not $normalizedChannel) {
    $normalizedChannel = "stable"
}

$normalizedAppVersion = Normalize-Optional -Value $AppVersion
if (-not $normalizedAppVersion) {
    $normalizedAppVersion = "0.0.0"
}

$normalizedSignatureAlgorithm = Normalize-Optional -Value $SignatureAlgorithm
if (-not $normalizedSignatureAlgorithm) {
    $normalizedSignatureAlgorithm = "sha256-rsa"
}

$manifest = [ordered]@{
    generated_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    channel = $normalizedChannel
    app_version = $normalizedAppVersion
    installer_path = $resolvedInstallerPath
    installer_file_name = [System.IO.Path]::GetFileName($resolvedInstallerPath)
    installer_sha256 = $computedSha256
    expected_sha256 = $expectedSha256Normalized
    installer_signature_algorithm = $normalizedSignatureAlgorithm
    release_notes_url = (Normalize-Optional -Value $ReleaseNotesUrl)
    authenticode = [ordered]@{
        required = [bool]$RequireAuthenticodeSignature
        status = $signatureStatus
        signer_thumbprint = $signerThumbprint
        signer_subject = $signerSubject
        timestamp_subject = $timestampSubject
    }
    trust_chain_verified = $true
}

if (-not [string]::IsNullOrWhiteSpace($ManifestOutputPath)) {
    $resolvedManifestPath = $ManifestOutputPath
    $manifestDirectory = Split-Path -Parent $resolvedManifestPath
    if (-not [string]::IsNullOrWhiteSpace($manifestDirectory)) {
        New-Item -ItemType Directory -Path $manifestDirectory -Force | Out-Null
    }

    $manifestJson = $manifest | ConvertTo-Json -Depth 6
    Set-Content -LiteralPath $resolvedManifestPath -Value $manifestJson -NoNewline
    Write-Host "Trust manifest written: $resolvedManifestPath" -ForegroundColor Green
}

Write-Host "Installer trust-chain verification passed." -ForegroundColor Green
Write-Host "Installer: $resolvedInstallerPath" -ForegroundColor Green
Write-Host "SHA256:    $computedSha256" -ForegroundColor Green
Write-Host "Signature: $signatureStatus" -ForegroundColor Green
