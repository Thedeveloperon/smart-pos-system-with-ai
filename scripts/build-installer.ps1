param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release",
    [string]$PackageOutputDir = "release/lanka-pos-win-x64",
    [string]$InstallerOutputDir = "release/installer",
    [string]$AppVersion = "1.0.0",
    [string]$IsccPath,
    [switch]$SkipPackaging,
    [switch]$SkipNpmCi,
    [switch]$FrameworkDependent,
    [switch]$NoZipPackage
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
$resolvedIscc = Resolve-IsccPath -ExplicitPath $IsccPath

$isccArgs = @(
    "/DAppVersion=$AppVersion",
    "/DPackageDir=$packageDir",
    "/DInstallerOutputDir=$installerOutDir",
    $issFile
)

Invoke-External -Label "Compiling Inno Setup installer" -Command $resolvedIscc -Arguments $isccArgs -WorkingDirectory $repoRoot

Write-Host "`nInstaller build complete." -ForegroundColor Green
Write-Host "Output folder: $installerOutDir" -ForegroundColor Green
