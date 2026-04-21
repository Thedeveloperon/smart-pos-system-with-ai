[CmdletBinding()]
param(
    [string]$ServiceName = "LankaPOSBackend",
    [string]$DisplayName = "Lanka POS Backend",
    [string]$Description = "Lanka POS local backend service",
    [switch]$SkipStart
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run Install-SmartPOS-Service.bat as Administrator."
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

function Read-ClientEnv {
    param([Parameter(Mandatory = $true)][string]$Path)

    $values = [ordered]@{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($null -eq $line) {
            continue
        }

        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#", [StringComparison]::Ordinal)) {
            continue
        }

        $separatorIndex = $line.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $key = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1)
        if (-not [string]::IsNullOrWhiteSpace($key)) {
            $values[$key] = $value
        }
    }

    return $values
}

function Write-ClientEnv {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][System.Collections.Specialized.OrderedDictionary]$Values
    )

    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add("# Auto-generated and managed by Lanka POS service scripts.")
    $lines.Add("")

    foreach ($entry in $Values.GetEnumerator()) {
        if ([string]::IsNullOrWhiteSpace($entry.Key)) {
            continue
        }

        $value = [string]$entry.Value
        $lines.Add("$($entry.Key)=$value")
    }

    Set-Content -LiteralPath $Path -Value $lines -Encoding ASCII
}

function New-RandomSecret {
    return ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))
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
    $generateBat = Join-Path $RootPath "Generate-Offline-Activation-Codes.bat"
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

    if (Test-Path -LiteralPath $generateBat) {
        New-WindowsShortcut `
            -ShortcutPath (Join-Path $startMenuFolder "Generate Offline Activation Codes.lnk") `
            -TargetPath $cmdExe `
            -Arguments "/c `"$generateBat`"" `
            -WorkingDirectory $RootPath `
            -Description "Generate Lanka POS offline activation codes" `
            -IconLocation $iconPath
    }
}

function Test-LooksLikeBase64Key {
    param([Parameter(Mandatory = $true)][string]$Candidate)

    $compact = [regex]::Replace($Candidate, "\s", "")
    if ($compact.Length -lt 128) {
        return $false
    }

    return $compact -match "^[A-Za-z0-9+/=]+$"
}

function Test-EnvFlagEnabled {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $false
    }

    $normalized = $Value.Trim()
    return [string]::Equals($normalized, "true", [StringComparison]::OrdinalIgnoreCase) -or
        [string]::Equals($normalized, "1", [StringComparison]::OrdinalIgnoreCase) -or
        [string]::Equals($normalized, "yes", [StringComparison]::OrdinalIgnoreCase) -or
        [string]::Equals($normalized, "on", [StringComparison]::OrdinalIgnoreCase)
}

function Ensure-SigningKeyPath {
    param(
        [string]$ConfiguredValue,
        [Parameter(Mandatory = $true)][string]$KeyFilePath,
        [Parameter(Mandatory = $true)][string]$DevelopmentSettingsPath
    )

    $raw = [string]$ConfiguredValue
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        $raw = $raw.Trim()
        if ($raw.StartsWith('"', [StringComparison]::Ordinal) -and
            $raw.EndsWith('"', [StringComparison]::Ordinal) -and
            $raw.Length -ge 2) {
            $raw = $raw.Substring(1, $raw.Length - 2)
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        if (Test-Path -LiteralPath $raw) {
            return (Resolve-Path -LiteralPath $raw).Path
        }

        $material = $raw.Replace("\\n", [Environment]::NewLine)
        $material = $material.Replace("\\", "")
        $material = $material.Replace("-----BEGIN PRIVATE KEY-----", "")
        $material = $material.Replace("-----END PRIVATE KEY-----", "")

        if (Test-LooksLikeBase64Key -Candidate $material) {
            $compact = [regex]::Replace($material, "\s", "")
            $pem = "-----BEGIN PRIVATE KEY-----{0}{1}{0}-----END PRIVATE KEY-----" -f [Environment]::NewLine, $compact
            Set-Content -LiteralPath $KeyFilePath -Value $pem -NoNewline
            return (Resolve-Path -LiteralPath $KeyFilePath).Path
        }

        $trimmed = $raw.Trim()
        if ($trimmed -match "^(?:[A-Za-z]:\\|\\\\|\.\\|\.\./|/|file://|~/)" -or
            $trimmed.EndsWith(".pem", [StringComparison]::OrdinalIgnoreCase) -or
            $trimmed.EndsWith(".key", [StringComparison]::OrdinalIgnoreCase)) {
            throw "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM points to '$trimmed', but the file was not found."
        }
    }

    if (Test-Path -LiteralPath $KeyFilePath) {
        return (Resolve-Path -LiteralPath $KeyFilePath).Path
    }

    if (Test-Path -LiteralPath $DevelopmentSettingsPath) {
        try {
            $config = Get-Content -LiteralPath $DevelopmentSettingsPath -Raw | ConvertFrom-Json
            $pemFromConfig = [string]$config.Licensing.SigningPrivateKeyPem
            if (-not [string]::IsNullOrWhiteSpace($pemFromConfig)) {
                $material = $pemFromConfig.Replace("-----BEGIN PRIVATE KEY-----", "")
                $material = $material.Replace("-----END PRIVATE KEY-----", "")
                if (Test-LooksLikeBase64Key -Candidate $material) {
                    $compact = [regex]::Replace($material, "\s", "")
                    $pem = "-----BEGIN PRIVATE KEY-----{0}{1}{0}-----END PRIVATE KEY-----" -f [Environment]::NewLine, $compact
                    Set-Content -LiteralPath $KeyFilePath -Value $pem -NoNewline
                    return (Resolve-Path -LiteralPath $KeyFilePath).Path
                }
            }
        }
        catch {
            # Ignore malformed development config and fall through to explicit error.
        }
    }

    throw "Licensing signing key is not configured. Set SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM to a valid PEM file path and rerun."
}

if ($env:OS -ne "Windows_NT") {
    throw "Install-SmartPOS-Service.ps1 is only supported on Windows."
}

Assert-Administrator

$root = Split-Path -Parent $PSCommandPath
Set-Location -LiteralPath $root
$appDir = Join-Path $root "app"
$backendExe = Join-Path $appDir "backend.exe"
$clientEnvPath = Join-Path $root "client.env"
$developmentSettingsPath = Join-Path $appDir "appsettings.Development.json"
$signingKeyPath = Join-Path $appDir "license-signing-private-key.pem"

if (-not (Test-Path -LiteralPath $backendExe)) {
    throw "backend.exe not found at '$backendExe'. Keep this installer next to the app folder."
}

$envValues = Read-ClientEnv -Path $clientEnvPath

if (-not $envValues.Contains("ASPNETCORE_ENVIRONMENT") -or [string]::IsNullOrWhiteSpace([string]$envValues["ASPNETCORE_ENVIRONMENT"])) {
    $envValues["ASPNETCORE_ENVIRONMENT"] = "Production"
}

if (-not $envValues.Contains("ASPNETCORE_URLS") -or [string]::IsNullOrWhiteSpace([string]$envValues["ASPNETCORE_URLS"])) {
    $envValues["ASPNETCORE_URLS"] = "http://127.0.0.1:5080"
}

if (-not $envValues.Contains("SMARTPOS_JWT_SECRET") -or [string]::IsNullOrWhiteSpace([string]$envValues["SMARTPOS_JWT_SECRET"])) {
    $envValues["SMARTPOS_JWT_SECRET"] = New-RandomSecret
}

if (-not $envValues.Contains("SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY") -or [string]::IsNullOrWhiteSpace([string]$envValues["SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY"])) {
    $envValues["SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY"] = New-RandomSecret
}

$signingKeyResolvedPath = Ensure-SigningKeyPath `
    -ConfiguredValue ($envValues["SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM"]) `
    -KeyFilePath $signingKeyPath `
    -DevelopmentSettingsPath $developmentSettingsPath
$envValues["SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM"] = $signingKeyResolvedPath

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

$openAiApiKey = if ($envValues.Contains("OPENAI_API_KEY")) { [string]$envValues["OPENAI_API_KEY"] } else { "" }
if ([string]::IsNullOrWhiteSpace($openAiApiKey)) {
    $insightsCloudRelayBaseUrl = if ($envValues.Contains("AiInsights__CloudRelayBaseUrl")) { [string]$envValues["AiInsights__CloudRelayBaseUrl"] } else { "" }
    if ((-not $envValues.Contains("AiInsights__CloudRelayEnabled") -or [string]::IsNullOrWhiteSpace([string]$envValues["AiInsights__CloudRelayEnabled"])) -and
        -not [string]::IsNullOrWhiteSpace($insightsCloudRelayBaseUrl)) {
        $envValues["AiInsights__CloudRelayEnabled"] = "true"
        Write-Host "[Info] AiInsights__CloudRelayBaseUrl detected. Enabling AiInsights__CloudRelayEnabled=true for keyless AI relay mode."
    }

    if (-not $envValues.Contains("AiSuggestions__Enabled") -or [string]::IsNullOrWhiteSpace([string]$envValues["AiSuggestions__Enabled"])) {
        $envValues["AiSuggestions__Enabled"] = "false"
    }
    elseif (Test-EnvFlagEnabled -Value ([string]$envValues["AiSuggestions__Enabled"])) {
        $envValues["AiSuggestions__Enabled"] = "false"
        Write-Warning "OPENAI_API_KEY is not set. AiSuggestions__Enabled was set to false."
    }

    $insightsCloudRelayEnabledValue = if ($envValues.Contains("AiInsights__CloudRelayEnabled")) { [string]$envValues["AiInsights__CloudRelayEnabled"] } else { "" }
    $insightsCloudRelayEnabled = Test-EnvFlagEnabled -Value $insightsCloudRelayEnabledValue
    if (-not $insightsCloudRelayEnabled) {
        if (-not $envValues.Contains("AiInsights__Enabled") -or [string]::IsNullOrWhiteSpace([string]$envValues["AiInsights__Enabled"])) {
            $envValues["AiInsights__Enabled"] = "false"
        }
        elseif (Test-EnvFlagEnabled -Value ([string]$envValues["AiInsights__Enabled"])) {
            $envValues["AiInsights__Enabled"] = "false"
            Write-Warning "OPENAI_API_KEY is not set and AiInsights cloud relay is disabled. AiInsights__Enabled was set to false."
        }
    }
}

Write-ClientEnv -Path $clientEnvPath -Values $envValues

$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$binaryPath = '"{0}"' -f $backendExe

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
    if ([string]::IsNullOrWhiteSpace($entry.Key)) {
        continue
    }

    $serviceEnvironment.Add("$($entry.Key)=$([string]$entry.Value)")
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
    Ensure-Shortcuts -RootPath $root -BackendExecutablePath $backendExe
}
catch {
    Write-Warning "Service was installed, but shortcut creation failed: $($_.Exception.Message)"
}

$finalState = (Get-Service -Name $ServiceName).Status
Write-Host "Lanka POS service configured successfully." -ForegroundColor Green
Write-Host "Service name: $ServiceName"
Write-Host "Status: $finalState"
Write-Host "Backend URL: $($envValues['ASPNETCORE_URLS'])"
Write-Host "Signing key file: $signingKeyResolvedPath"
Write-Host "Desktop shortcut: Open Lanka POS"
