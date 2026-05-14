param(
    [string]$BackendUrl = "",
    [string]$AdminUsername = "support_admin",
    [string]$AdminPassword = "support123",
    [string]$AdminMfaCode = "",
    [string]$DeviceCode = "offline-licensing-cli",
    [string]$DeviceName = "Offline Licensing CLI",
    [string]$ShopCode = "",
    [int]$Count = 1,
    [int]$MaxActivations = 1000000,
    [int]$TtlDays = 3650,
    [bool]$AllowIfExistingBatch = $true,
    [string]$OutputDir = "",
    [string]$Actor = "offline-licensing-operator",
    [string]$ReasonCode = "offline_activation_batch_generated",
    [string]$ActorNote = "manual offline activation code generation"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "SmartPOS-ClientCommon.ps1")

if ($Count -lt 1 -or $Count -gt 10) {
    throw "Count must be between 1 and 10. Current value: $Count"
}

try {
    $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    $paths = Resolve-SmartPosPaths -RootPath $scriptRoot
    $clientEnv = if (Test-Path -LiteralPath $paths.ClientEnvPath) {
        Read-ClientEnv -Path $paths.ClientEnvPath
    }
    else {
        $initializedEnv = Initialize-SmartPosClientEnv -Paths $paths
        Write-ClientEnv -Path $paths.ClientEnvPath -Values $initializedEnv
        $initializedEnv
    }

    if ([string]::IsNullOrWhiteSpace($BackendUrl)) {
        $BackendUrl = Get-SmartPosBackendUrl -Paths $paths -EnvValues $clientEnv
    }

    $BackendUrl = $BackendUrl.Trim().TrimEnd("/")

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

    $loginPayload = @{
        username = $AdminUsername
        password = $AdminPassword
        device_code = $DeviceCode
        device_name = $DeviceName
    }
    if (-not [string]::IsNullOrWhiteSpace($AdminMfaCode)) {
        $loginPayload["mfa_code"] = $AdminMfaCode
    }
    $loginPayload = $loginPayload | ConvertTo-Json

    Invoke-RestMethod `
        -Uri "$BackendUrl/api/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginPayload `
        -WebSession $session | Out-Null

    $batchPayload = @{
        count = $Count
        max_activations = $MaxActivations
        ttl_days = $TtlDays
        actor = $Actor
        reason_code = $ReasonCode
        actor_note = $ActorNote
        allow_if_existing_batch = $AllowIfExistingBatch
    }
    if (-not [string]::IsNullOrWhiteSpace($ShopCode)) {
        $batchPayload["shop_code"] = $ShopCode
    }
    $batchPayload = $batchPayload | ConvertTo-Json

    $response = Invoke-RestMethod `
        -Uri "$BackendUrl/api/admin/licensing/offline/activation-entitlements/batch-generate" `
        -Method Post `
        -ContentType "application/json" `
        -Headers @{ "Idempotency-Key" = [Guid]::NewGuid().ToString().ToLowerInvariant() } `
        -Body $batchPayload `
        -WebSession $session

    if ([string]::IsNullOrWhiteSpace($OutputDir)) {
        $resolvedOutputDir = $paths.ExportsDir
    }
    elseif ([System.IO.Path]::IsPathRooted($OutputDir)) {
        $resolvedOutputDir = $OutputDir
    }
    else {
        $resolvedOutputDir = Join-Path $scriptRoot $OutputDir
    }
    New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null

    $timestampUtc = [DateTimeOffset]::UtcNow.ToString("yyyyMMddTHHmmssZ")
    $csvPath = Join-Path $resolvedOutputDir "offline-activation-codes-$timestampUtc.csv"
    $response.entitlements | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8

    Write-Host ""
    if ($response.generated_count -eq 1) {
        Write-Host "Offline activation code generated successfully." -ForegroundColor Green
    }
    else {
        Write-Host "Offline activation code batch generated successfully." -ForegroundColor Green
    }
    Write-Host "Backend URL: $BackendUrl"
    Write-Host "Shop code: $($response.shop_code)"
    Write-Host "Generated count: $($response.generated_count)"
    Write-Host "Source reference: $($response.source_reference)"
    Write-Host ""
    Write-Host "Activation keys (plaintext shown once):" -ForegroundColor Yellow
    $index = 1
    foreach ($entitlement in $response.entitlements) {
        Write-Host ("{0}. {1}" -f $index, $entitlement.activation_entitlement_key)
        $index++
    }
    Write-Host ""
    Write-Host "CSV written to: $csvPath" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Use one key in the activation screen immediately."
}
catch {
    $errorMessage = $_.Exception.Message
    $responseBody = ""
    $response = $null
    if ($_.Exception -and $_.Exception.PSObject.Properties.Name -contains "Response") {
        $response = $_.Exception.Response
    }

    $responseStream = $null
    if ($response -and $response.PSObject.Methods.Name -contains "GetResponseStream") {
        try {
            $responseStream = $response.GetResponseStream()
        }
        catch {
            $responseStream = $null
        }
    }

    if ($responseStream) {
        try {
            $reader = New-Object System.IO.StreamReader($responseStream)
            $responseBody = $reader.ReadToEnd()
            $reader.Dispose()
        }
        catch {
            $responseBody = ""
        }
    }
    elseif ($response -and $response.PSObject.Properties.Name -contains "Content" -and $response.Content) {
        try {
            $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        }
        catch {
            $responseBody = ""
        }
    }
    Write-Host ""
    Write-Host "Failed to generate offline activation codes." -ForegroundColor Red
    Write-Host $errorMessage -ForegroundColor Red
    if (-not [string]::IsNullOrWhiteSpace($responseBody)) {
        Write-Host ""
        Write-Host "Backend response:" -ForegroundColor Yellow
        Write-Host $responseBody
    }
    Write-Host ""
    Write-Host "Tips:"
    Write-Host "- Ensure Start-SmartPOS.bat is running and backend is reachable."
    Write-Host "- Ensure you target the same backend instance as the POS activation screen."
    Write-Host "- Verify support_admin or security_admin credentials."
    exit 1
}
