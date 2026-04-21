[CmdletBinding()]
param(
    [switch]$RequireAdmin,
    [switch]$FailOnWarnings
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$passes = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$failures = [System.Collections.Generic.List[string]]::new()

function Add-Pass {
    param([Parameter(Mandatory = $true)][string]$Message)
    $passes.Add($Message) | Out-Null
    Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Add-Warning {
    param([Parameter(Mandatory = $true)][string]$Message)
    $warnings.Add($Message) | Out-Null
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Add-Failure {
    param([Parameter(Mandatory = $true)][string]$Message)
    $failures.Add($Message) | Out-Null
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Get-ConfiguredPort {
    param([Parameter(Mandatory = $true)][string]$RootPath)

    $defaultPort = 5080
    $clientEnvPath = Join-Path $RootPath "client.env"
    if (-not (Test-Path -LiteralPath $clientEnvPath)) {
        return $defaultPort
    }

    try {
        $urlsLine = Get-Content -LiteralPath $clientEnvPath |
            Where-Object { $_ -match "^\s*ASPNETCORE_URLS\s*=" } |
            Select-Object -First 1

        if ([string]::IsNullOrWhiteSpace($urlsLine)) {
            return $defaultPort
        }

        $urlsValue = ($urlsLine -split "=", 2)[1].Trim()
        if ([string]::IsNullOrWhiteSpace($urlsValue)) {
            return $defaultPort
        }

        $firstUrl = ($urlsValue -split ";")[0].Trim()
        if ([string]::IsNullOrWhiteSpace($firstUrl)) {
            return $defaultPort
        }

        $uri = $null
        if ([Uri]::TryCreate($firstUrl, [UriKind]::Absolute, [ref]$uri)) {
            return $uri.Port
        }
    }
    catch {
        return $defaultPort
    }

    return $defaultPort
}

function Resolve-ListeningProcesses {
    param([int]$Port)

    $processes = [System.Collections.Generic.Dictionary[int, string]]::new()

    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        foreach ($connection in $connections) {
            $pid = [int]$connection.OwningProcess
            if ($pid -le 0 -or $processes.ContainsKey($pid)) {
                continue
            }

            $name = "unknown"
            try {
                $name = (Get-Process -Id $pid -ErrorAction Stop).ProcessName
            }
            catch {
                # Keep fallback name.
            }

            $processes[$pid] = $name
        }
    }
    catch {
        # Fallback for environments where Get-NetTCPConnection is unavailable.
        $lines = netstat -ano -p tcp 2>$null
        foreach ($line in $lines) {
            if ($line -notmatch "LISTENING") {
                continue
            }

            if ($line -notmatch "[:\.]$Port\s+") {
                continue
            }

            $parts = ($line -replace "^\s+", "") -split "\s+"
            if ($parts.Count -lt 5) {
                continue
            }

            $pid = 0
            if (-not [int]::TryParse($parts[$parts.Count - 1], [ref]$pid) -or $pid -le 0) {
                continue
            }

            if ($processes.ContainsKey($pid)) {
                continue
            }

            $name = "unknown"
            try {
                $name = (Get-Process -Id $pid -ErrorAction Stop).ProcessName
            }
            catch {
                # Keep fallback name.
            }

            $processes[$pid] = $name
        }
    }

    return $processes
}

Write-Host "Lanka POS Host Precheck" -ForegroundColor Cyan
Write-Host "=======================" -ForegroundColor Cyan

if ($env:OS -eq "Windows_NT") {
    Add-Pass "Windows environment detected."
}
else {
    Add-Failure "This package supports Windows only."
    Write-Host ""
    Write-Host "Summary: $($passes.Count) passed, $($warnings.Count) warning(s), $($failures.Count) failure(s)." -ForegroundColor Cyan
    Write-Host "Precheck failed. Fix the failed items and retry." -ForegroundColor Red
    exit 1
}

if ([Environment]::Is64BitOperatingSystem) {
    Add-Pass "64-bit Windows detected (win-x64 compatible)."
}
else {
    Add-Failure "This setup requires 64-bit Windows."
}

$root = Split-Path -Parent $PSCommandPath
if ([string]::IsNullOrWhiteSpace($root)) {
    $root = (Get-Location).Path
}

if ($root.StartsWith("\\", [StringComparison]::Ordinal)) {
    Add-Failure "Package is running from a network path ($root). Extract to a local drive (for example C:\\Lanka POS)."
}
else {
    Add-Pass "Package path is local: $root"
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
    Add-Pass "Administrator privileges detected."
}
elseif ($RequireAdmin) {
    Add-Failure "Administrator privileges are required. Run as Administrator."
}
else {
    Add-Warning "Not running as Administrator. Service installation will fail without elevation."
}

if ($PSVersionTable.PSVersion.Major -ge 5) {
    Add-Pass "PowerShell version $($PSVersionTable.PSVersion) is supported."
}
else {
    Add-Failure "PowerShell 5.1 or newer is required."
}

$requiredFiles = @(
    "app\backend.exe",
    "Start-SmartPOS.bat",
    "Install-SmartPOS-Service.ps1"
)

foreach ($relativePath in $requiredFiles) {
    $fullPath = Join-Path $root $relativePath
    if (Test-Path -LiteralPath $fullPath) {
        Add-Pass "Found required file: $relativePath"
    }
    else {
        Add-Failure "Missing required file: $relativePath"
    }
}

$systemRoot = $env:SystemRoot
if ([string]::IsNullOrWhiteSpace($systemRoot)) {
    $systemRoot = "C:\Windows"
}

$scPath = Join-Path $systemRoot "System32\sc.exe"
if (Test-Path -LiteralPath $scPath) {
    Add-Pass "Windows service tool available: sc.exe"
}
else {
    Add-Failure "sc.exe not found. Windows service installation is unavailable on this PC."
}

$probePath = Join-Path $root ".lanka-pos-write-test.tmp"
try {
    Set-Content -LiteralPath $probePath -Value "ok" -Encoding ASCII -NoNewline
    Remove-Item -LiteralPath $probePath -Force -ErrorAction SilentlyContinue
    Add-Pass "Write access check passed for package folder."
}
catch {
    Add-Failure "No write permission in package folder ($root)."
}

$port = Get-ConfiguredPort -RootPath $root
$listeners = Resolve-ListeningProcesses -Port $port
if ($listeners.Count -eq 0) {
    Add-Pass "Configured port $port is available."
}
else {
    $names = $listeners.Values | Sort-Object -Unique
    $hasLankaBackend = $false
    foreach ($name in $names) {
        if ($name -ieq "backend") {
            $hasLankaBackend = $true
            break
        }
    }

    if ($hasLankaBackend) {
        Add-Warning "Port $port is already in use by backend.exe. Lanka POS may already be running."
    }
    else {
        Add-Failure "Port $port is already in use by: $($names -join ', ')."
    }
}

$lankaService = Get-Service -Name "LankaPOSBackend" -ErrorAction SilentlyContinue
$legacyService = Get-Service -Name "SmartPOSBackend" -ErrorAction SilentlyContinue
if ($null -ne $lankaService) {
    Add-Warning "LankaPOSBackend service already exists (status: $($lankaService.Status)). Installer will update it."
}
else {
    Add-Pass "LankaPOSBackend service is not installed yet."
}

if ($null -ne $legacyService) {
    Add-Warning "Legacy SmartPOSBackend service exists (status: $($legacyService.Status)). Installer will migrate it."
}

Write-Host ""
Write-Host "Summary: $($passes.Count) passed, $($warnings.Count) warning(s), $($failures.Count) failure(s)." -ForegroundColor Cyan

if ($failures.Count -gt 0) {
    Write-Host "Precheck failed. Fix the failed items and retry." -ForegroundColor Red
    exit 1
}

if ($FailOnWarnings -and $warnings.Count -gt 0) {
    Write-Host "Precheck has warnings and FailOnWarnings is enabled." -ForegroundColor Yellow
    exit 2
}

if ($warnings.Count -gt 0) {
    Write-Host "Precheck passed with warnings." -ForegroundColor Yellow
}
else {
    Write-Host "Precheck passed." -ForegroundColor Green
}

exit 0
