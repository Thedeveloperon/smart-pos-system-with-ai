param(
    [string]$Runtime = "win-x64",
    [string]$Configuration = "Release",
    [string]$OutputDir = "release/lanka-pos-win-x64",
    [switch]$SkipNpmCi,
    [switch]$FrameworkDependent,
    [switch]$NoZip
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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$frontendDir = Join-Path $repoRoot "apps/pos-app"
$backendProject = Join-Path $repoRoot "services/backend-api/backend.csproj"
$frontendDistDir = Join-Path $frontendDir "dist"
$outputRoot = Join-Path $repoRoot $OutputDir
$appDir = Join-Path $outputRoot "app"
$wwwrootDir = Join-Path $appDir "wwwroot"
$clientTemplatesDir = Join-Path $repoRoot "scripts/client"

if (Test-Path $outputRoot) {
    Write-Host "Removing existing output: $outputRoot" -ForegroundColor Yellow
    Remove-Item -Recurse -Force $outputRoot
}

New-Item -ItemType Directory -Path $outputRoot | Out-Null

if (-not $SkipNpmCi) {
    Invoke-External -Label "Installing frontend dependencies" -Command "npm" -Arguments @("ci") -WorkingDirectory $frontendDir
}

Invoke-External -Label "Building frontend" -Command "npm" -Arguments @("run", "build") -WorkingDirectory $frontendDir

$publishArgs = @(
    "publish",
    $backendProject,
    "-c", $Configuration,
    "-r", $Runtime,
    "-o", $appDir,
    "/p:PublishSingleFile=true",
    "/p:IncludeNativeLibrariesForSelfExtract=true"
)

if ($FrameworkDependent) {
    $publishArgs += @("--self-contained", "false")
}
else {
    $publishArgs += @("--self-contained", "true")
}

Invoke-External -Label "Publishing backend" -Command "dotnet" -Arguments $publishArgs -WorkingDirectory $repoRoot

New-Item -ItemType Directory -Path $wwwrootDir -Force | Out-Null
Copy-Item -Path (Join-Path $frontendDistDir "*") -Destination $wwwrootDir -Recurse -Force

Copy-Item -Path (Join-Path $clientTemplatesDir "Start-SmartPOS.bat") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Stop-SmartPOS.bat") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "client.env.example") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "README-CLIENT.txt") -Destination $outputRoot -Force

if (-not $NoZip) {
    $zipPath = "$outputRoot.zip"
    if (Test-Path $zipPath) {
        Remove-Item -Force $zipPath
    }

    Compress-Archive -Path (Join-Path $outputRoot "*") -DestinationPath $zipPath
    Write-Host "`nCreated: $zipPath" -ForegroundColor Green
}

Write-Host "`nClient package is ready at: $outputRoot" -ForegroundColor Green
Write-Host "Run Start-SmartPOS.bat inside the package on the client machine." -ForegroundColor Green
