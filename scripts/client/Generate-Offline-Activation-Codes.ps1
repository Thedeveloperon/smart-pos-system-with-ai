param(
    [string]$BackendUrl = "",
    [string]$AdminUsername = "support_admin",
    [string]$AdminPassword = "support123",
    [string]$AdminMfaCode = "",
    [string]$AdminMfaSecret = "support-admin-mfa-secret-2026",
    [int]$MfaStepSeconds = 30,
    [string]$DeviceCode = "offline-licensing-cli",
    [string]$DeviceName = "Offline Licensing CLI",
    [string]$ShopCode = "default",
    [int]$Count = 10,
    [int]$MaxActivations = 1000000,
    [int]$TtlDays = 3650,
    [bool]$AllowIfExistingBatch = $true,
    [string]$OutputDir = "",
    [string]$Actor = "offline-licensing-operator",
    [string]$ReasonCode = "offline_activation_batch_generated",
    [string]$ActorNote = "manual offline activation key batch generation"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "SmartPOS-ClientCommon.ps1")

if ($Count -ne 10) {
    throw "Count must be exactly 10. Current value: $Count"
}

function Get-TotpCode {
    param(
        [Parameter(Mandatory = $true)][string]$Secret,
        [int]$StepSeconds = 30
    )

    $step = [Math]::Max(15, $StepSeconds)
    $counter = [Int64][Math]::Floor([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() / $step)
    $counterBytes = [BitConverter]::GetBytes($counter)
    [Array]::Reverse($counterBytes)

    $hmac = [System.Security.Cryptography.HMACSHA1]::new([Text.Encoding]::UTF8.GetBytes($Secret))
    try {
        $digest = $hmac.ComputeHash($counterBytes)
    }
    finally {
        $hmac.Dispose()
    }

    $offset = $digest[$digest.Length - 1] -band 0x0F
    $binaryCode =
        (($digest[$offset] -band 0x7F) -shl 24) -bor
        (($digest[$offset + 1] -band 0xFF) -shl 16) -bor
        (($digest[$offset + 2] -band 0xFF) -shl 8) -bor
        ($digest[$offset + 3] -band 0xFF)

    return "{0:D6}" -f ($binaryCode % 1000000)
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

    if ([string]::IsNullOrWhiteSpace($AdminMfaCode)) {
        $AdminMfaCode = Get-TotpCode -Secret $AdminMfaSecret -StepSeconds $MfaStepSeconds
    }

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

    $loginPayload = @{
        username = $AdminUsername
        password = $AdminPassword
        device_code = $DeviceCode
        device_name = $DeviceName
        mfa_code = $AdminMfaCode
    } | ConvertTo-Json

    Invoke-RestMethod `
        -Uri "$BackendUrl/api/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginPayload `
        -WebSession $session | Out-Null

    $batchPayload = @{
        shop_code = $ShopCode
        count = $Count
        max_activations = $MaxActivations
        ttl_days = $TtlDays
        actor = $Actor
        reason_code = $ReasonCode
        actor_note = $ActorNote
        allow_if_existing_batch = $AllowIfExistingBatch
    } | ConvertTo-Json

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
    Write-Host "Offline activation code batch generated successfully." -ForegroundColor Green
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
    Write-Host "- Verify support_admin credentials and MFA secret/code."
    exit 1
}
