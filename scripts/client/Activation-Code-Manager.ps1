[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "SmartPOS-ClientCommon.ps1")

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Resolve-ActivationManagerContext {
    $paths = Resolve-SmartPosPaths -RootPath $PSScriptRoot
    $envValues = if (Test-Path -LiteralPath $paths.ClientEnvPath) {
        Read-ClientEnv -Path $paths.ClientEnvPath
    }
    else {
        $initialized = Initialize-SmartPosClientEnv -Paths $paths
        Write-ClientEnv -Path $paths.ClientEnvPath -Values $initialized
        $initialized
    }

    $backendUrl = Get-SmartPosBackendUrl -Paths $paths -EnvValues $envValues
    return [pscustomobject]@{
        Paths = $paths
        EnvValues = $envValues
        BackendUrl = $backendUrl
    }
}

function Test-ActivationBackend {
    param(
        [Parameter(Mandatory = $true)][string]$BackendUrl
    )

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$($BackendUrl.TrimEnd('/'))/health" -TimeoutSec 2
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Get-ErrorDetails {
    param(
        [Parameter(Mandatory = $true)]$ErrorRecord
    )

    $errorMessage = $ErrorRecord.Exception.Message
    $responseBody = ""
    $response = $null
    if ($ErrorRecord.Exception -and $ErrorRecord.Exception.PSObject.Properties.Name -contains "Response") {
        $response = $ErrorRecord.Exception.Response
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

    if ([string]::IsNullOrWhiteSpace($responseBody)) {
        return $errorMessage
    }

    return "$errorMessage`r`n`r`nBackend response:`r`n$responseBody"
}

$script:ActivationManagerContext = Resolve-ActivationManagerContext
$script:LastActivationResponse = $null
$script:LastActivationBackendUrl = $script:ActivationManagerContext.BackendUrl

$form = New-Object System.Windows.Forms.Form
$form.Text = "Lanka POS Activation Code Manager"
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.Size = New-Object System.Drawing.Size(760, 720)
$form.MinimumSize = New-Object System.Drawing.Size(760, 720)
$form.MaximizeBox = $false

$headerLabel = New-Object System.Windows.Forms.Label
$headerLabel.Location = New-Object System.Drawing.Point(20, 20)
$headerLabel.Size = New-Object System.Drawing.Size(700, 36)
$headerLabel.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$headerLabel.Text = "Generate Offline Activation Codes"
$form.Controls.Add($headerLabel)

$subLabel = New-Object System.Windows.Forms.Label
$subLabel.Location = New-Object System.Drawing.Point(20, 60)
$subLabel.Size = New-Object System.Drawing.Size(700, 42)
$subLabel.Text = "Support and security admins only. Sign in with MFA, generate the current 10-key batch, then copy or export the plaintext keys immediately."
$form.Controls.Add($subLabel)

$backendTitleLabel = New-Object System.Windows.Forms.Label
$backendTitleLabel.Location = New-Object System.Drawing.Point(20, 115)
$backendTitleLabel.Size = New-Object System.Drawing.Size(120, 23)
$backendTitleLabel.Text = "Backend URL"
$form.Controls.Add($backendTitleLabel)

$backendValueLabel = New-Object System.Windows.Forms.Label
$backendValueLabel.Location = New-Object System.Drawing.Point(145, 115)
$backendValueLabel.Size = New-Object System.Drawing.Size(575, 23)
$backendValueLabel.Text = $script:ActivationManagerContext.BackendUrl
$form.Controls.Add($backendValueLabel)

$usernameLabel = New-Object System.Windows.Forms.Label
$usernameLabel.Location = New-Object System.Drawing.Point(20, 155)
$usernameLabel.Size = New-Object System.Drawing.Size(120, 23)
$usernameLabel.Text = "Admin username"
$form.Controls.Add($usernameLabel)

$usernameTextBox = New-Object System.Windows.Forms.TextBox
$usernameTextBox.Location = New-Object System.Drawing.Point(145, 152)
$usernameTextBox.Size = New-Object System.Drawing.Size(220, 23)
$form.Controls.Add($usernameTextBox)

$passwordLabel = New-Object System.Windows.Forms.Label
$passwordLabel.Location = New-Object System.Drawing.Point(385, 155)
$passwordLabel.Size = New-Object System.Drawing.Size(100, 23)
$passwordLabel.Text = "Password"
$form.Controls.Add($passwordLabel)

$passwordTextBox = New-Object System.Windows.Forms.TextBox
$passwordTextBox.Location = New-Object System.Drawing.Point(490, 152)
$passwordTextBox.Size = New-Object System.Drawing.Size(230, 23)
$passwordTextBox.UseSystemPasswordChar = $true
$form.Controls.Add($passwordTextBox)

$mfaLabel = New-Object System.Windows.Forms.Label
$mfaLabel.Location = New-Object System.Drawing.Point(20, 195)
$mfaLabel.Size = New-Object System.Drawing.Size(120, 23)
$mfaLabel.Text = "MFA code"
$form.Controls.Add($mfaLabel)

$mfaTextBox = New-Object System.Windows.Forms.TextBox
$mfaTextBox.Location = New-Object System.Drawing.Point(145, 192)
$mfaTextBox.Size = New-Object System.Drawing.Size(120, 23)
$mfaTextBox.MaxLength = 6
$form.Controls.Add($mfaTextBox)

$shopCodeLabel = New-Object System.Windows.Forms.Label
$shopCodeLabel.Location = New-Object System.Drawing.Point(385, 195)
$shopCodeLabel.Size = New-Object System.Drawing.Size(100, 23)
$shopCodeLabel.Text = "Shop code"
$form.Controls.Add($shopCodeLabel)

$shopCodeTextBox = New-Object System.Windows.Forms.TextBox
$shopCodeTextBox.Location = New-Object System.Drawing.Point(490, 192)
$shopCodeTextBox.Size = New-Object System.Drawing.Size(230, 23)
$shopCodeTextBox.Text = "default"
$form.Controls.Add($shopCodeTextBox)

$generateButton = New-Object System.Windows.Forms.Button
$generateButton.Location = New-Object System.Drawing.Point(20, 235)
$generateButton.Size = New-Object System.Drawing.Size(180, 34)
$generateButton.Text = "Generate 10 Codes"
$form.Controls.Add($generateButton)

$warningLabel = New-Object System.Windows.Forms.Label
$warningLabel.Location = New-Object System.Drawing.Point(220, 242)
$warningLabel.Size = New-Object System.Drawing.Size(500, 40)
$warningLabel.ForeColor = [System.Drawing.Color]::FromArgb(156, 87, 0)
$warningLabel.Text = "Plaintext activation keys are shown once per generated batch. Copy or export them before closing this window."
$form.Controls.Add($warningLabel)

$detailsGroup = New-Object System.Windows.Forms.GroupBox
$detailsGroup.Location = New-Object System.Drawing.Point(20, 290)
$detailsGroup.Size = New-Object System.Drawing.Size(700, 110)
$detailsGroup.Text = "Batch Details"
$form.Controls.Add($detailsGroup)

$detailBackendLabel = New-Object System.Windows.Forms.Label
$detailBackendLabel.Location = New-Object System.Drawing.Point(15, 25)
$detailBackendLabel.Size = New-Object System.Drawing.Size(670, 20)
$detailBackendLabel.Text = "Backend URL: "
$detailsGroup.Controls.Add($detailBackendLabel)

$detailShopLabel = New-Object System.Windows.Forms.Label
$detailShopLabel.Location = New-Object System.Drawing.Point(15, 50)
$detailShopLabel.Size = New-Object System.Drawing.Size(250, 20)
$detailShopLabel.Text = "Shop code: "
$detailsGroup.Controls.Add($detailShopLabel)

$detailCountLabel = New-Object System.Windows.Forms.Label
$detailCountLabel.Location = New-Object System.Drawing.Point(280, 50)
$detailCountLabel.Size = New-Object System.Drawing.Size(180, 20)
$detailCountLabel.Text = "Generated count: "
$detailsGroup.Controls.Add($detailCountLabel)

$detailSourceLabel = New-Object System.Windows.Forms.Label
$detailSourceLabel.Location = New-Object System.Drawing.Point(15, 75)
$detailSourceLabel.Size = New-Object System.Drawing.Size(670, 20)
$detailSourceLabel.Text = "Source reference: "
$detailsGroup.Controls.Add($detailSourceLabel)

$keysGroup = New-Object System.Windows.Forms.GroupBox
$keysGroup.Location = New-Object System.Drawing.Point(20, 415)
$keysGroup.Size = New-Object System.Drawing.Size(700, 215)
$keysGroup.Text = "Plaintext Activation Keys"
$form.Controls.Add($keysGroup)

$keysListBox = New-Object System.Windows.Forms.ListBox
$keysListBox.Location = New-Object System.Drawing.Point(15, 28)
$keysListBox.Size = New-Object System.Drawing.Size(670, 134)
$keysListBox.Font = New-Object System.Drawing.Font("Consolas", 11)
$keysGroup.Controls.Add($keysListBox)

$copySelectedButton = New-Object System.Windows.Forms.Button
$copySelectedButton.Location = New-Object System.Drawing.Point(15, 172)
$copySelectedButton.Size = New-Object System.Drawing.Size(130, 28)
$copySelectedButton.Text = "Copy Selected"
$copySelectedButton.Enabled = $false
$keysGroup.Controls.Add($copySelectedButton)

$copyAllButton = New-Object System.Windows.Forms.Button
$copyAllButton.Location = New-Object System.Drawing.Point(160, 172)
$copyAllButton.Size = New-Object System.Drawing.Size(110, 28)
$copyAllButton.Text = "Copy All"
$copyAllButton.Enabled = $false
$keysGroup.Controls.Add($copyAllButton)

$exportCsvButton = New-Object System.Windows.Forms.Button
$exportCsvButton.Location = New-Object System.Drawing.Point(285, 172)
$exportCsvButton.Size = New-Object System.Drawing.Size(110, 28)
$exportCsvButton.Text = "Export CSV"
$exportCsvButton.Enabled = $false
$keysGroup.Controls.Add($exportCsvButton)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(20, 645)
$statusLabel.Size = New-Object System.Drawing.Size(700, 24)
$statusLabel.Text = "Ready."
$form.Controls.Add($statusLabel)

$copySelectedButton.Add_Click({
    if ($null -eq $keysListBox.SelectedItem) {
        [System.Windows.Forms.MessageBox]::Show(
            "Select an activation key to copy.",
            "Lanka POS Activation Code Manager",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
        return
    }

    [System.Windows.Forms.Clipboard]::SetText([string]$keysListBox.SelectedItem)
    $statusLabel.Text = "Selected activation key copied to clipboard."
})

$copyAllButton.Add_Click({
    if ($null -eq $script:LastActivationResponse) {
        return
    }

    $keys = @($script:LastActivationResponse.entitlements | ForEach-Object { [string]$_.activation_entitlement_key })
    [System.Windows.Forms.Clipboard]::SetText(($keys -join [Environment]::NewLine))
    $statusLabel.Text = "All activation keys copied to clipboard."
})

$exportCsvButton.Add_Click({
    if ($null -eq $script:LastActivationResponse) {
        return
    }

    $dialog = New-Object System.Windows.Forms.SaveFileDialog
    $dialog.Title = "Export Offline Activation Codes"
    $dialog.Filter = "CSV files (*.csv)|*.csv|All files (*.*)|*.*"
    $dialog.FileName = "offline-activation-codes-$([DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')).csv"

    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        return
    }

    try {
        $script:LastActivationResponse.entitlements | Export-Csv -Path $dialog.FileName -NoTypeInformation -Encoding UTF8
        $statusLabel.Text = "CSV exported to $($dialog.FileName)"
    }
    catch {
        [System.Windows.Forms.MessageBox]::Show(
            $_.Exception.Message,
            "CSV Export Failed",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
})

$generateButton.Add_Click({
    $username = $usernameTextBox.Text.Trim()
    $password = $passwordTextBox.Text
    $mfaCode = $mfaTextBox.Text.Trim()
    $shopCode = $shopCodeTextBox.Text.Trim()

    if ([string]::IsNullOrWhiteSpace($username)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Enter a support_admin or security_admin username.",
            "Missing Username",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    if ([string]::IsNullOrWhiteSpace($password)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Enter the admin password.",
            "Missing Password",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    if ([string]::IsNullOrWhiteSpace($mfaCode)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Enter the current MFA code.",
            "Missing MFA Code",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    if ([string]::IsNullOrWhiteSpace($shopCode)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Enter a shop code.",
            "Missing Shop Code",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    $generateButton.Enabled = $false
    $statusLabel.Text = "Checking backend and generating activation codes..."

    try {
        $script:ActivationManagerContext = Resolve-ActivationManagerContext
        $backendUrl = $script:ActivationManagerContext.BackendUrl
        $backendValueLabel.Text = $backendUrl

        if (-not (Test-ActivationBackend -BackendUrl $backendUrl)) {
            throw "Backend is not reachable at $backendUrl. Start Lanka POS first and retry."
        }

        $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
        $machineName = if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { "unknown-pc" } else { $env:COMPUTERNAME.Trim() }
        $deviceCode = "activation-code-manager-$machineName"
        $deviceName = "Activation Code Manager ($machineName)"

        $loginPayload = @{
            username = $username
            password = $password
            device_code = $deviceCode
            device_name = $deviceName
            mfa_code = $mfaCode
        } | ConvertTo-Json

        Invoke-RestMethod `
            -Uri "$backendUrl/api/auth/login" `
            -Method Post `
            -ContentType "application/json" `
            -Body $loginPayload `
            -WebSession $session | Out-Null

        $batchPayload = @{
            shop_code = $shopCode
            count = 10
            max_activations = 1000000
            ttl_days = 3650
            actor = $username
            reason_code = "offline_activation_batch_generated"
            actor_note = "manual offline activation key batch generation via activation code manager"
            allow_if_existing_batch = $true
        } | ConvertTo-Json

        $response = Invoke-RestMethod `
            -Uri "$backendUrl/api/admin/licensing/offline/activation-entitlements/batch-generate" `
            -Method Post `
            -ContentType "application/json" `
            -Headers @{ "Idempotency-Key" = [Guid]::NewGuid().ToString().ToLowerInvariant() } `
            -Body $batchPayload `
            -WebSession $session

        $script:LastActivationResponse = $response
        $script:LastActivationBackendUrl = $backendUrl

        $detailBackendLabel.Text = "Backend URL: $backendUrl"
        $detailShopLabel.Text = "Shop code: $($response.shop_code)"
        $detailCountLabel.Text = "Generated count: $($response.generated_count)"
        $detailSourceLabel.Text = "Source reference: $($response.source_reference)"

        $keysListBox.Items.Clear()
        foreach ($entitlement in $response.entitlements) {
            [void]$keysListBox.Items.Add([string]$entitlement.activation_entitlement_key)
        }

        $copySelectedButton.Enabled = $keysListBox.Items.Count -gt 0
        $copyAllButton.Enabled = $keysListBox.Items.Count -gt 0
        $exportCsvButton.Enabled = $keysListBox.Items.Count -gt 0
        $statusLabel.Text = "Generated $($response.generated_count) activation codes. Copy or export them now."
    }
    catch {
        $statusLabel.Text = "Activation code generation failed."
        [System.Windows.Forms.MessageBox]::Show(
            (Get-ErrorDetails -ErrorRecord $_),
            "Activation Code Generation Failed",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
    finally {
        $passwordTextBox.Clear()
        $mfaTextBox.Clear()
        $generateButton.Enabled = $true
    }
})

[void]$form.ShowDialog()
