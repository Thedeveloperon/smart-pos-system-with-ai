[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "SmartPOS-ClientCommon.ps1")

function Test-BackendHealth {
    param(
        [Parameter(Mandatory = $true)][string]$BackendUrl
    )

    $healthUrl = "$($BackendUrl.TrimEnd('/'))/health"
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 2
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Get-ExistingService {
    foreach ($candidate in @("LankaPOSBackend", "SmartPOSBackend")) {
        try {
            $service = Get-Service -Name $candidate -ErrorAction SilentlyContinue
            if ($null -ne $service) {
                return $service
            }
        }
        catch {
            # Ignore service lookup failures on non-Windows hosts.
        }
    }

    return $null
}

$paths = Resolve-SmartPosPaths -RootPath $PSScriptRoot
if (-not (Test-Path -LiteralPath $paths.BackendExePath)) {
    throw "Could not find backend executable at '$($paths.BackendExePath)'."
}

$service = Get-ExistingService
if ($null -ne $service) {
    $serviceName = $service.Name
    if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Running) {
        throw "Lanka POS Windows service '$serviceName' is installed but not running. Start the service from Services or rerun Install-SmartPOS-Service.bat as Administrator."
    }

    Write-Host "Lanka POS Windows service is already running." -ForegroundColor Cyan

    # Service mode is configured during installation. The daily-use launcher
    # must stay read-only so standard users can open the app without needing
    # write access to ProgramData or the install manifest under Program Files.
    $envValues = Read-ClientEnv -Path $paths.ClientEnvPath
    $backendUrl = Get-SmartPosBackendUrl -Paths $paths -EnvValues $envValues

    Start-Process $backendUrl | Out-Null
    Write-Host "Lanka POS is running via Windows service." -ForegroundColor Green
    exit 0
}

$envValues = Initialize-SmartPosClientEnv -Paths $paths
$backendUrl = Get-SmartPosBackendUrl -Paths $paths -EnvValues $envValues

Write-ClientEnv -Path $paths.ClientEnvPath -Values $envValues
Write-SmartPosInstallManifest `
    -RootPath $paths.RootPath `
    -InstallMode "current_user" `
    -DataRoot $paths.DataRoot `
    -BackendUrl $backendUrl | Out-Null

Set-SmartPosProcessEnvironment -EnvValues $envValues

$openAiApiKey = if ($envValues.Contains("OPENAI_API_KEY")) {
    [string]$envValues["OPENAI_API_KEY"]
}
else {
    ""
}

$aiInsightsEnabled = if ($envValues.Contains("AiInsights__Enabled")) {
    [string]$envValues["AiInsights__Enabled"]
}
else {
    ""
}

$aiSuggestionsEnabled = if ($envValues.Contains("AiSuggestions__Enabled")) {
    [string]$envValues["AiSuggestions__Enabled"]
}
else {
    ""
}

$aiCloudRelayEnabled = if ($envValues.Contains("AiInsights__CloudRelayEnabled")) {
    [string]$envValues["AiInsights__CloudRelayEnabled"]
}
else {
    ""
}

$aiCloudRelayBaseUrl = if ($envValues.Contains("AiInsights__CloudRelayBaseUrl")) {
    [string]$envValues["AiInsights__CloudRelayBaseUrl"]
}
else {
    ""
}

if ([string]::IsNullOrWhiteSpace($openAiApiKey)) {
    if ($aiSuggestionsEnabled -eq "false" -and $aiInsightsEnabled -eq "false") {
        Write-Host "[Info] OPENAI_API_KEY is not set. AI suggestions and AI insights are disabled."
    }
    elseif ($aiSuggestionsEnabled -eq "false" -and
        @("1", "true", "yes", "on") -contains $aiCloudRelayEnabled.Trim().ToLowerInvariant() -and
        -not [string]::IsNullOrWhiteSpace($aiCloudRelayBaseUrl)) {
        Write-Host "[Info] OPENAI_API_KEY is not set. AI suggestions are disabled. AI insights uses cloud relay."
    }
    elseif (@("1", "true", "yes", "on") -contains $aiCloudRelayEnabled.Trim().ToLowerInvariant() -and
        -not [string]::IsNullOrWhiteSpace($aiCloudRelayBaseUrl)) {
        Write-Host "[Info] OPENAI_API_KEY is not set. AI insights will use cloud relay."
    }
    else {
        Write-Host "[Info] OPENAI_API_KEY is not set. Configure OPENAI_API_KEY when enabling OpenAI AI features."
    }
}

if (-not [string]::IsNullOrWhiteSpace([string]$envValues["SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM"])) {
    Write-Host "[Info] Licensing signing key path: $([string]$envValues['SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM'])"
}

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $paths.BackendExePath
$startInfo.WorkingDirectory = $paths.AppDir
$startInfo.UseShellExecute = $false

foreach ($entry in $envValues.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace([string]$entry.Key)) {
        continue
    }

    $startInfo.Environment[$entry.Key] = [string]$entry.Value
}

Write-Host "Starting Lanka POS backend..." -ForegroundColor Cyan
[System.Diagnostics.Process]::Start($startInfo) | Out-Null

for ($attempt = 1; $attempt -le 10; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-BackendHealth -BackendUrl $backendUrl) {
        Start-Process $backendUrl | Out-Null
        Write-Host "Lanka POS backend started successfully." -ForegroundColor Green
        exit 0
    }
}

Start-Process $backendUrl | Out-Null
Write-Host "Backend started, but health check is still pending. Opened the app anyway..." -ForegroundColor Yellow
