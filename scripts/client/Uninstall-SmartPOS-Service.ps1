[CmdletBinding()]
param(
    [string]$ServiceName = "LankaPOSBackend"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run Uninstall-SmartPOS-Service.bat as Administrator."
    }
}

function Invoke-Sc {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $output = & sc.exe @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        $text = ($output | Out-String).Trim()
        throw "sc.exe $($Arguments -join ' ') failed. $text"
    }

    return $output
}

if ($env:OS -ne "Windows_NT") {
    throw "Uninstall-SmartPOS-Service.ps1 is only supported on Windows."
}

Assert-Administrator

$commonDesktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonDesktopDirectory)
$commonPrograms = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonPrograms)
$startMenuFolder = Join-Path $commonPrograms "Lanka POS"
$legacyStartMenuFolder = Join-Path $commonPrograms "SmartPOS"
$desktopShortcut = Join-Path $commonDesktop "Open Lanka POS.lnk"
$legacyDesktopShortcut = Join-Path $commonDesktop "Open SmartPOS.lnk"

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -eq $service) {
    $legacyService = Get-Service -Name "SmartPOSBackend" -ErrorAction SilentlyContinue
    if ($null -ne $legacyService) {
        $ServiceName = "SmartPOSBackend"
        $service = $legacyService
    }
}

if ($null -eq $service) {
    if (Test-Path -LiteralPath $desktopShortcut) {
        Remove-Item -LiteralPath $desktopShortcut -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path -LiteralPath $legacyDesktopShortcut) {
        Remove-Item -LiteralPath $legacyDesktopShortcut -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path -LiteralPath $startMenuFolder) {
        Remove-Item -LiteralPath $startMenuFolder -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (Test-Path -LiteralPath $legacyStartMenuFolder) {
        Remove-Item -LiteralPath $legacyStartMenuFolder -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Lanka POS service is not installed. Shortcuts cleaned up."
    exit 0
}

if ($service.Status -eq [System.ServiceProcess.ServiceControllerStatus]::Running) {
    Stop-Service -Name $ServiceName -Force
}

Invoke-Sc -Arguments @("delete", $ServiceName) | Out-Null

$deadline = (Get-Date).AddSeconds(15)
do {
    Start-Sleep -Milliseconds 500
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
} while ($null -ne $service -and (Get-Date) -lt $deadline)

if ($null -ne $service) {
    throw "Service '$ServiceName' was marked for deletion but is still present. Reboot and rerun if needed."
}

if (Test-Path -LiteralPath $desktopShortcut) {
    Remove-Item -LiteralPath $desktopShortcut -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $legacyDesktopShortcut) {
    Remove-Item -LiteralPath $legacyDesktopShortcut -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $startMenuFolder) {
    Remove-Item -LiteralPath $startMenuFolder -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $legacyStartMenuFolder) {
    Remove-Item -LiteralPath $legacyStartMenuFolder -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Lanka POS service '$ServiceName' removed successfully." -ForegroundColor Green
