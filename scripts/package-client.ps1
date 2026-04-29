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
$inventoryFrontendDir = Join-Path $repoRoot "apps/Inventory Manager"
$backendProject = Join-Path $repoRoot "services/backend-api/backend.csproj"
$frontendDistDir = Join-Path $frontendDir "dist"
$inventoryFrontendDistDir = Join-Path $inventoryFrontendDir "dist"
$outputRoot = Join-Path $repoRoot $OutputDir
$appDir = Join-Path $outputRoot "app"
$wwwrootDir = Join-Path $appDir "wwwroot"
$inventoryWwwrootDir = Join-Path $wwwrootDir "inventory-manager"
$clientTemplatesDir = Join-Path $repoRoot "scripts/client"

if (Test-Path $outputRoot) {
    Write-Host "Removing existing output: $outputRoot" -ForegroundColor Yellow
    Remove-Item -Recurse -Force $outputRoot
}

New-Item -ItemType Directory -Path $outputRoot | Out-Null

if (-not $SkipNpmCi) {
    Invoke-External -Label "Installing frontend dependencies" -Command "npm" -Arguments @("ci") -WorkingDirectory $frontendDir
    Invoke-External -Label "Installing Inventory Manager dependencies" -Command "npm" -Arguments @("ci") -WorkingDirectory $inventoryFrontendDir
}

Invoke-External -Label "Building frontend" -Command "npm" -Arguments @("run", "build") -WorkingDirectory $frontendDir
Invoke-External -Label "Building Inventory Manager frontend" -Command "npm" -Arguments @("run", "build") -WorkingDirectory $inventoryFrontendDir

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
New-Item -ItemType Directory -Path $inventoryWwwrootDir -Force | Out-Null
Copy-Item -Path (Join-Path $inventoryFrontendDistDir "*") -Destination $inventoryWwwrootDir -Recurse -Force

$publishedPaymentProofsDir = Join-Path $wwwrootDir "payment-proofs"
if (Test-Path -LiteralPath $publishedPaymentProofsDir) {
    Get-ChildItem -LiteralPath $publishedPaymentProofsDir -Force |
        Where-Object { $_.Name -ne ".gitkeep" } |
        Remove-Item -Recurse -Force
}

$shortcutIconOutput = Join-Path $outputRoot "lanka-pos.ico"
$shortcutIconPngSource = Join-Path $frontendDir "public/favicon.png"
$shortcutIconIcoFallback = Join-Path $frontendDir "public/favicon.ico"
$shortcutIconWritten = $false

$pythonCommand = Get-Command python3 -ErrorAction SilentlyContinue
if ($null -eq $pythonCommand) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
}

if ($null -ne $pythonCommand -and (Test-Path -LiteralPath $shortcutIconPngSource)) {
    Write-Host "Generating shortcut icon from $shortcutIconPngSource" -ForegroundColor Cyan
    $pythonScript = @"
from PIL import Image
import sys
source, target = sys.argv[1], sys.argv[2]
img = Image.open(source).convert('RGBA')
sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
img.save(target, format='ICO', sizes=sizes)
"@
    $previousLastExitCode = $global:LASTEXITCODE
    try {
        & $pythonCommand.Source -c $pythonScript $shortcutIconPngSource $shortcutIconOutput
        if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $shortcutIconOutput)) {
            $shortcutIconWritten = $true
        }
        else {
            Write-Host "Icon generation via Python failed; using fallback icon if available." -ForegroundColor Yellow
        }
    }
    finally {
        $global:LASTEXITCODE = $previousLastExitCode
    }
}

if (-not $shortcutIconWritten -and (Test-Path -LiteralPath $shortcutIconIcoFallback)) {
    Write-Host "Using fallback shortcut icon: $shortcutIconIcoFallback" -ForegroundColor Yellow
    Copy-Item -Path $shortcutIconIcoFallback -Destination $shortcutIconOutput -Force
    $shortcutIconWritten = $true
}

if (-not $shortcutIconWritten) {
    Write-Host "Warning: shortcut icon was not generated. Shortcuts will fall back to backend.exe icon." -ForegroundColor Yellow
}

Copy-Item -Path (Join-Path $clientTemplatesDir "Start-SmartPOS.bat") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Start-SmartPOS.ps1") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Stop-SmartPOS.bat") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Install-SmartPOS-Service.bat") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Install-SmartPOS-Service.ps1") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Uninstall-SmartPOS-Service.bat") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Uninstall-SmartPOS-Service.ps1") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Precheck-SmartPOS-Host.bat") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Precheck-SmartPOS-Host.ps1") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Generate-Offline-Activation-Codes.bat") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Generate-Offline-Activation-Codes.ps1") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Activation-Code-Manager.bat") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Activation-Code-Manager.ps1") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "Setup-CurrentUser-Install.ps1") -Destination $outputRoot -Force
Copy-Item -Path (Join-Path $clientTemplatesDir "SmartPOS-ClientCommon.ps1") -Destination $outputRoot -Force
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
