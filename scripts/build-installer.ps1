param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release",
    [string]$PackageOutputDir = "release/lanka-pos-win-x64",
    [string]$InstallerOutputDir = "release/installer",
    [string]$AppVersion = "1.0.0",
    [string]$ReleaseChannel = "stable",
    [string]$ReleaseNotesUrl = "",
    [string]$ExpectedInstallerSha256 = "",
    [string]$TrustManifestPath = "",
    [string[]]$AllowedSignerThumbprints = @(),
    [string]$IsccPath,
    [string]$InnoSetupDockerImage = "amake/innosetup",
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

function Test-DockerCompilerAvailability {
    param([string]$Image)

    $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -eq $dockerCommand) {
        return $false
    }

    try {
        & $dockerCommand.Source version | Out-Null
        if ($LASTEXITCODE -ne 0) {
            return $false
        }
    }
    catch {
        return $false
    }

    return -not [string]::IsNullOrWhiteSpace($Image)
}

function Convert-ToDockerInnoPath {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$TargetPath
    )

    $relativePath = [System.IO.Path]::GetRelativePath($RepoRoot, $TargetPath)
    if ($relativePath.StartsWith("..", [StringComparison]::Ordinal)) {
        throw "Dockerized Inno Setup fallback only supports paths inside the repository root. Unsupported path: $TargetPath"
    }

    $normalized = $relativePath.Replace("/", "\")
    if ([string]::IsNullOrWhiteSpace($normalized) -or $normalized -eq ".") {
        return "Z:\work"
    }

    return "Z:\work\$normalized"
}

function Invoke-DockerInnoSetup {
    param(
        [Parameter(Mandatory = $true)][string]$Image,
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$IssFile,
        [Parameter(Mandatory = $true)][string]$PackageDir,
        [Parameter(Mandatory = $true)][string]$InstallerOutputDir,
        [Parameter(Mandatory = $true)][string]$AppVersion
    )

    $dockerCommand = (Get-Command docker -ErrorAction Stop).Source
    $dockerArgs = @(
        "run",
        "--rm",
        "-v", "${RepoRoot}:/work",
        $Image,
        "/DAppVersion=$AppVersion",
        "/DPackageDir=$(Convert-ToDockerInnoPath -RepoRoot $RepoRoot -TargetPath $PackageDir)",
        "/DInstallerOutputDir=$(Convert-ToDockerInnoPath -RepoRoot $RepoRoot -TargetPath $InstallerOutputDir)",
        (Convert-ToDockerInnoPath -RepoRoot $RepoRoot -TargetPath $IssFile)
    )

    Invoke-External -Label "Compiling Inno Setup installer (Docker fallback)" -Command $dockerCommand -Arguments $dockerArgs -WorkingDirectory $RepoRoot
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
try {
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
}
catch {
    if (-not [string]::IsNullOrWhiteSpace($IsccPath)) {
        throw
    }

    if (-not (Test-DockerCompilerAvailability -Image $InnoSetupDockerImage)) {
        throw
    }

    if (-not [string]::IsNullOrWhiteSpace($SignTool)) {
        throw "Dockerized Inno Setup fallback does not currently support SignTool injection. Build on Windows with local ISCC.exe for signed installers."
    }

    Write-Warning "$($_.Exception.Message) Falling back to Docker image '$InnoSetupDockerImage'."
    Invoke-DockerInnoSetup `
        -Image $InnoSetupDockerImage `
        -RepoRoot $repoRoot `
        -IssFile $issFile `
        -PackageDir $packageDir `
        -InstallerOutputDir $installerOutDir `
        -AppVersion $AppVersion
}

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
