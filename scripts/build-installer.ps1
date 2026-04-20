param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release",
    [string]$PackageOutputDir = "release/lanka-pos-win-x64",
    [string]$InstallerOutputDir = "release/installer",
    [string]$FrontendApiBaseUrl = "http://127.0.0.1:5080",
    [string]$AppVersion = "1.0.0",
    [string]$ReleaseChannel = "stable",
    [string]$ReleaseNotesUrl = "",
    [string]$ExpectedInstallerSha256 = "",
    [string]$TrustManifestPath = "",
    [string[]]$AllowedSignerThumbprints = @(),
    [string]$IsccPath,
    [string]$SignTool,
    [switch]$SkipPackaging,
    [switch]$SkipNpmCi,
    [switch]$FrameworkDependent,
    [switch]$NoZipPackage,
    [switch]$VerifyTrustChain,
    [switch]$RequireAuthenticodeSignature
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Write-Host "`n==> $Label" -ForegroundColor Cyan

    $previousDir = Get-Location
    try {
        if ($WorkingDirectory) {
            Set-Location $WorkingDirectory
        }

        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Label failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        if ($WorkingDirectory) {
            Set-Location $previousDir
        }
    }
}

function Resolve-IsccPath {
    param([string]$ExplicitPath)

    if ($ExplicitPath) {
        if (Test-Path $ExplicitPath) {
            return (Resolve-Path $ExplicitPath).Path
        }

        throw "ISCC path not found: $ExplicitPath"
    }

    $candidates = @(
        $env:ISCC_PATH,
        "${env:ProgramFiles(x86)}\\Inno Setup 6\\ISCC.exe",
        "${env:ProgramFiles}\\Inno Setup 6\\ISCC.exe"
    ) | Where-Object { $_ -and $_.Trim().Length -gt 0 }

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return (Resolve-Path $candidate).Path
        }
    }

    throw "Inno Setup compiler (ISCC.exe) was not found. Install Inno Setup 6 or set -IsccPath / ISCC_PATH."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packageScript = Join-Path $repoRoot "scripts/package-client.ps1"
$trustVerificationScript = Join-Path $repoRoot "scripts/verify-installer-trust-chain.ps1"
$issFile = Join-Path $repoRoot "installer/SmartPOS.iss"
$packageDir = Join-Path $repoRoot $PackageOutputDir
$installerOutDir = Join-Path $repoRoot $InstallerOutputDir

if (-not (Test-Path $issFile)) {
    throw "Installer definition not found: $issFile"
}

if (-not $SkipPackaging) {
    $packageArgs = @{
        Runtime = $Runtime
        Configuration = $Configuration
        OutputDir = $PackageOutputDir
        FrontendApiBaseUrl = $FrontendApiBaseUrl
    }

    if ($SkipNpmCi) {
        $packageArgs["SkipNpmCi"] = $true
    }

    if ($FrameworkDependent) {
        $packageArgs["FrameworkDependent"] = $true
    }

    if ($NoZipPackage) {
        $packageArgs["NoZip"] = $true
    }

    Write-Host "`n==> Building client package" -ForegroundColor Cyan
    & $packageScript @packageArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Client package build failed with exit code $LASTEXITCODE"
    }
}

if (-not (Test-Path $packageDir)) {
    throw "Client package directory not found: $packageDir"
}

New-Item -ItemType Directory -Path $installerOutDir -Force | Out-Null
$resolvedIscc = Resolve-IsccPath -ExplicitPath $IsccPath

$isccArgs = @(
    "/DAppVersion=$AppVersion",
    "/DPackageDir=$packageDir",
    "/DInstallerOutputDir=$installerOutDir",
    $issFile
)
if (-not [string]::IsNullOrWhiteSpace($SignTool)) {
    $isccArgs = @(
        "/DSignTool=$SignTool"
    ) + $isccArgs
}

Invoke-External -Label "Compiling Inno Setup installer" -Command $resolvedIscc -Arguments $isccArgs -WorkingDirectory $repoRoot

if ($VerifyTrustChain) {
    if (-not (Test-Path -LiteralPath $trustVerificationScript)) {
        throw "Trust verification script not found: $trustVerificationScript"
    }

    $installerPath = Join-Path $installerOutDir "Lanka POS-Setup-$AppVersion.exe"
    if (-not (Test-Path -LiteralPath $installerPath)) {
        $latestInstaller = Get-ChildItem -Path $installerOutDir -Filter "*.exe" -File |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First 1
        if (-not $latestInstaller) {
            throw "No installer executable was found in: $installerOutDir"
        }

        $installerPath = $latestInstaller.FullName
    }

    $resolvedChannel = if ([string]::IsNullOrWhiteSpace($ReleaseChannel)) { "stable" } else { $ReleaseChannel.Trim().ToLowerInvariant() }
    $manifestPath = if ([string]::IsNullOrWhiteSpace($TrustManifestPath)) {
        Join-Path $installerOutDir "release-manifest-$resolvedChannel.json"
    }
    else {
        if ([System.IO.Path]::IsPathRooted($TrustManifestPath)) {
            $TrustManifestPath
        }
        else {
            Join-Path $repoRoot $TrustManifestPath
        }
    }

    $verifyArgs = @{
        InstallerPath = $installerPath
        AppVersion = $AppVersion
        Channel = $resolvedChannel
        ExpectedSha256 = $ExpectedInstallerSha256
        ManifestOutputPath = $manifestPath
        ReleaseNotesUrl = $ReleaseNotesUrl
    }

    if ($RequireAuthenticodeSignature) {
        $verifyArgs["RequireAuthenticodeSignature"] = $true
    }

    if ($AllowedSignerThumbprints -and $AllowedSignerThumbprints.Count -gt 0) {
        $verifyArgs["AllowedSignerThumbprints"] = $AllowedSignerThumbprints
    }

    Write-Host "`n==> Verifying installer trust chain" -ForegroundColor Cyan
    & $trustVerificationScript @verifyArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Installer trust-chain verification failed with exit code $LASTEXITCODE"
    }
}

Write-Host "`nInstaller build complete." -ForegroundColor Green
Write-Host "Output folder: $installerOutDir" -ForegroundColor Green
