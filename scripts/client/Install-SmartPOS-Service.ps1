[CmdletBinding()]
param(
    [string]$ServiceName = "LankaPOSBackend",
    [string]$DisplayName = "Lanka POS Backend",
    [string]$Description = "Lanka POS local backend service",
    [switch]$SkipStart
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "SmartPOS-ClientCommon.ps1")

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run Install-SmartPOS-Service.bat as Administrator."
    }
}

function Invoke-Sc {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $output = & sc.exe @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        $text = ($output | Out-String).Trim()
        throw "sc.exe $($Arguments -join ' ') failed. $text"
    }

    return $output
}

function New-WindowsShortcut {
    param(
        [Parameter(Mandatory = $true)][string]$ShortcutPath,
        [Parameter(Mandatory = $true)][string]$TargetPath,
        [string]$Arguments = "",
        [string]$WorkingDirectory = "",
        [string]$Description = "",
        [string]$IconLocation = ""
    )

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $TargetPath

    if (-not [string]::IsNullOrWhiteSpace($Arguments)) {
        $shortcut.Arguments = $Arguments
    }

    if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
        $shortcut.WorkingDirectory = $WorkingDirectory
    }

    if (-not [string]::IsNullOrWhiteSpace($Description)) {
        $shortcut.Description = $Description
    }

    if (-not [string]::IsNullOrWhiteSpace($IconLocation)) {
        $shortcut.IconLocation = $IconLocation
    }

    $shortcut.Save()
}

function Ensure-Shortcuts {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath,
        [Parameter(Mandatory = $true)][string]$BackendExecutablePath
    )

    $startBat = Join-Path $RootPath "Start-SmartPOS.bat"
    $stopBat = Join-Path $RootPath "Stop-SmartPOS.bat"
    $activationManagerLauncher = Join-Path $RootPath "Activation-Code-Manager.bat"
    $cmdExe = Join-Path $env:SystemRoot "System32\cmd.exe"

    $iconPath = "$BackendExecutablePath,0"
    $packageIconPath = Join-Path $RootPath "lanka-pos.ico"
    $webIconPath = Join-Path $RootPath "app\wwwroot\favicon.ico"
    if (Test-Path -LiteralPath $packageIconPath) {
        $iconPath = $packageIconPath
    }
    elseif (Test-Path -LiteralPath $webIconPath) {
        $iconPath = $webIconPath
    }

    $commonDesktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonDesktopDirectory)
    $commonPrograms = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonPrograms)
    $startMenuFolder = Join-Path $commonPrograms "Lanka POS"
    New-Item -ItemType Directory -Path $startMenuFolder -Force | Out-Null

    New-WindowsShortcut `
        -ShortcutPath (Join-Path $commonDesktop "Open Lanka POS.lnk") `
        -TargetPath $cmdExe `
        -Arguments "/c `"$startBat`"" `
        -WorkingDirectory $RootPath `
        -Description "Open Lanka POS application" `
        -IconLocation $iconPath

    New-WindowsShortcut `
        -ShortcutPath (Join-Path $startMenuFolder "Open Lanka POS.lnk") `
        -TargetPath $cmdExe `
        -Arguments "/c `"$startBat`"" `
        -WorkingDirectory $RootPath `
        -Description "Open Lanka POS application" `
        -IconLocation $iconPath

    New-WindowsShortcut `
        -ShortcutPath (Join-Path $startMenuFolder "Stop Lanka POS.lnk") `
        -TargetPath $cmdExe `
        -Arguments "/c `"$stopBat`"" `
        -WorkingDirectory $RootPath `
        -Description "Stop Lanka POS backend" `
        -IconLocation $iconPath

    if (Test-Path -LiteralPath $activationManagerLauncher) {
        New-WindowsShortcut `
            -ShortcutPath (Join-Path $startMenuFolder "Generate Offline Activation Codes.lnk") `
            -TargetPath $cmdExe `
            -Arguments "/c `"$activationManagerLauncher`"" `
            -WorkingDirectory $RootPath `
            -Description "Open the Lanka POS activation code manager" `
            -IconLocation $iconPath
    }
}

if ($env:OS -ne "Windows_NT") {
    throw "Install-SmartPOS-Service.ps1 is only supported on Windows."
}

Assert-Administrator

$paths = Resolve-SmartPosPaths `
    -RootPath $PSScriptRoot `
    -PreferredInstallMode "windows_service" `
    -PreferredServiceName $ServiceName

if (-not (Test-Path -LiteralPath $paths.BackendExePath)) {
    throw "backend.exe not found at '$($paths.BackendExePath)'. Keep this installer next to the app folder."
}

$migrated = Invoke-SmartPosLegacyMigration -Paths $paths
$envValues = Initialize-SmartPosClientEnv -Paths $paths
$backendUrl = Get-SmartPosBackendUrl -Paths $paths -EnvValues $envValues

Write-ClientEnv -Path $paths.ClientEnvPath -Values $envValues
Write-SmartPosInstallManifest `
    -RootPath $paths.RootPath `
    -InstallMode "windows_service" `
    -DataRoot $paths.DataRoot `
    -ServiceName $ServiceName `
    -BackendUrl $backendUrl | Out-Null

$legacyServiceName = "SmartPOSBackend"
if ([string]::Equals($ServiceName, "LankaPOSBackend", [StringComparison]::OrdinalIgnoreCase)) {
    $legacyService = Get-Service -Name $legacyServiceName -ErrorAction SilentlyContinue
    $newService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -ne $legacyService -and $null -eq $newService) {
        if ($legacyService.Status -eq [System.ServiceProcess.ServiceControllerStatus]::Running) {
            Stop-Service -Name $legacyServiceName -Force
        }

        Invoke-Sc -Arguments @("delete", $legacyServiceName) | Out-Null
    }
}

$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$binaryPath = '"{0}"' -f $paths.BackendExePath

if ($null -eq $existingService) {
    New-Service -Name $ServiceName -BinaryPathName $binaryPath -DisplayName $DisplayName -Description $Description -StartupType Automatic | Out-Null
}
else {
    Set-Service -Name $ServiceName -DisplayName $DisplayName -StartupType Automatic
    Invoke-Sc -Arguments @("config", $ServiceName, "binPath=", $binaryPath, "start=", "auto") | Out-Null
    Invoke-Sc -Arguments @("description", $ServiceName, $Description) | Out-Null
}

$serviceRegPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName"
$serviceEnvironment = [System.Collections.Generic.List[string]]::new()
foreach ($entry in $envValues.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace([string]$entry.Key)) {
        continue
    }

    $serviceEnvironment.Add("$($entry.Key)=$([string]$entry.Value)") | Out-Null
}

New-ItemProperty -Path $serviceRegPath -Name "Environment" -PropertyType MultiString -Value $serviceEnvironment.ToArray() -Force | Out-Null
Invoke-Sc -Arguments @("failure", $ServiceName, "reset=", "86400", "actions=", "restart/5000/restart/5000/restart/5000") | Out-Null
Invoke-Sc -Arguments @("failureflag", $ServiceName, "1") | Out-Null

if (-not $SkipStart) {
    $serviceState = Get-Service -Name $ServiceName
    if ($serviceState.Status -eq [System.ServiceProcess.ServiceControllerStatus]::Running) {
        Restart-Service -Name $ServiceName -Force
    }
    else {
        Start-Service -Name $ServiceName
    }
}

try {
    Ensure-Shortcuts -RootPath $paths.RootPath -BackendExecutablePath $paths.BackendExePath
}
catch {
    Write-Warning "Service was installed, but shortcut creation failed: $($_.Exception.Message)"
}

$finalState = (Get-Service -Name $ServiceName).Status
Write-Host "Lanka POS service configured successfully." -ForegroundColor Green
Write-Host "Service name: $ServiceName"
Write-Host "Status: $finalState"
Write-Host "Install root: $($paths.RootPath)"
Write-Host "Data root: $($paths.DataRoot)"
Write-Host "Config path: $($paths.ClientEnvPath)"
Write-Host "Database path: $($paths.DbPath)"
Write-Host "Signing key file: $($paths.SigningKeyPath)"
Write-Host "Backend URL: $backendUrl"
Write-Host "Desktop shortcut: Open Lanka POS"
Write-Host "Start Menu shortcut: Generate Offline Activation Codes"
if ($migrated.Count -gt 0) {
    Write-Host "Migrated legacy files: $($migrated -join ', ')" -ForegroundColor Yellow
}
