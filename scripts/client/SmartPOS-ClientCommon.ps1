Set-StrictMode -Version Latest

function Get-SmartPosInstallRoot {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath
    )

    if (Test-Path -LiteralPath $BasePath -PathType Container) {
        return (Resolve-Path -LiteralPath $BasePath).Path
    }

    $resolvedFile = Resolve-Path -LiteralPath $BasePath -ErrorAction Stop
    return Split-Path -Parent $resolvedFile.Path
}

function Get-SmartPosManifestPath {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath
    )

    return Join-Path $RootPath "smartpos.install.json"
}

function Get-SmartPosDefaultDataRoot {
    param(
        [Parameter(Mandatory = $true)][ValidateSet("current_user", "windows_service")][string]$InstallMode
    )

    if ($InstallMode -eq "windows_service") {
        return Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::CommonApplicationData)) "Lanka POS"
    }

    return Join-Path ([Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)) "Lanka POS\data"
}

function Get-SmartPosServiceName {
    param(
        [string]$PreferredServiceName = "LankaPOSBackend"
    )

    if (-not [string]::IsNullOrWhiteSpace($PreferredServiceName)) {
        return $PreferredServiceName
    }

    foreach ($candidate in @("LankaPOSBackend", "SmartPOSBackend")) {
        try {
            $service = Get-Service -Name $candidate -ErrorAction SilentlyContinue
            if ($null -ne $service) {
                return $candidate
            }
        }
        catch {
            # Ignore service lookup failures when running in non-Windows environments.
        }
    }

    return "LankaPOSBackend"
}

function Read-SmartPosInstallManifest {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath
    )

    $manifestPath = Get-SmartPosManifestPath -RootPath $RootPath
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        return $null
    }

    try {
        return Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    }
    catch {
        throw "Failed to read install manifest at '$manifestPath'. $($_.Exception.Message)"
    }
}

function Write-SmartPosInstallManifest {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath,
        [Parameter(Mandatory = $true)][ValidateSet("current_user", "windows_service")][string]$InstallMode,
        [Parameter(Mandatory = $true)][string]$DataRoot,
        [string]$ServiceName = "",
        [string]$BackendUrl = "http://127.0.0.1:5080"
    )

    $payload = [ordered]@{
        install_mode = $InstallMode
        install_root = $RootPath
        data_root = $DataRoot
        config_path = Join-Path (Join-Path $DataRoot "config") "client.env"
        database_path = Join-Path $DataRoot "smartpos.db"
        signing_key_path = Join-Path (Join-Path $DataRoot "keys") "license-signing-private-key.pem"
        logs_dir = Join-Path $DataRoot "logs"
        exports_dir = Join-Path (Join-Path $DataRoot "exports") "activation-codes"
        service_name = $ServiceName
        backend_url = $BackendUrl
        written_at_utc = [DateTimeOffset]::UtcNow.ToString("O")
    }

    $manifestPath = Get-SmartPosManifestPath -RootPath $RootPath
    $payload | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding ASCII
    return $manifestPath
}

function Get-SmartPosLegacyInstallMode {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath
    )

    foreach ($candidate in @("LankaPOSBackend", "SmartPOSBackend")) {
        try {
            $service = Get-Service -Name $candidate -ErrorAction SilentlyContinue
            if ($null -ne $service) {
                return "windows_service"
            }
        }
        catch {
            # Ignore service lookup failures when not running on Windows.
        }
    }

    return "current_user"
}

function Resolve-SmartPosPaths {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath,
        [string]$PreferredInstallMode = "",
        [string]$PreferredDataRoot = "",
        [string]$PreferredServiceName = ""
    )

    $resolvedRoot = Get-SmartPosInstallRoot -BasePath $RootPath
    $manifest = Read-SmartPosInstallManifest -RootPath $resolvedRoot

    $installMode = ""
    if ($null -ne $manifest -and -not [string]::IsNullOrWhiteSpace([string]$manifest.install_mode)) {
        $installMode = [string]$manifest.install_mode
    }
    elseif (-not [string]::IsNullOrWhiteSpace($PreferredInstallMode)) {
        $installMode = $PreferredInstallMode
    }
    else {
        $installMode = Get-SmartPosLegacyInstallMode -RootPath $resolvedRoot
    }

    if (@("current_user", "windows_service") -notcontains $installMode) {
        $installMode = "current_user"
    }

    $dataRoot = ""
    if ($null -ne $manifest -and -not [string]::IsNullOrWhiteSpace([string]$manifest.data_root)) {
        $dataRoot = [string]$manifest.data_root
    }
    elseif (-not [string]::IsNullOrWhiteSpace($PreferredDataRoot)) {
        $dataRoot = $PreferredDataRoot
    }
    else {
        $dataRoot = Get-SmartPosDefaultDataRoot -InstallMode $installMode
    }

    $serviceName = ""
    if ($null -ne $manifest -and -not [string]::IsNullOrWhiteSpace([string]$manifest.service_name)) {
        $serviceName = [string]$manifest.service_name
    }
    else {
        $serviceName = Get-SmartPosServiceName -PreferredServiceName $PreferredServiceName
    }

    $appDir = Join-Path $resolvedRoot "app"
    $configDir = Join-Path $dataRoot "config"
    $keyDir = Join-Path $dataRoot "keys"
    $logsDir = Join-Path $dataRoot "logs"
    $exportsDir = Join-Path (Join-Path $dataRoot "exports") "activation-codes"

    return [pscustomobject][ordered]@{
        RootPath = $resolvedRoot
        AppDir = $appDir
        BackendExePath = Join-Path $appDir "backend.exe"
        ManifestPath = Get-SmartPosManifestPath -RootPath $resolvedRoot
        InstallMode = $installMode
        DataRoot = $dataRoot
        ConfigDir = $configDir
        ClientEnvPath = Join-Path $configDir "client.env"
        ClientEnvExamplePath = Join-Path $resolvedRoot "client.env.example"
        DbPath = Join-Path $dataRoot "smartpos.db"
        KeyDir = $keyDir
        SigningKeyPath = Join-Path $keyDir "license-signing-private-key.pem"
        LogsDir = $logsDir
        ExportsDir = $exportsDir
        LegacyClientEnvPath = Join-Path $resolvedRoot "client.env"
        LegacyDbPath = Join-Path $appDir "smartpos.db"
        LegacySigningKeyPath = Join-Path $appDir "license-signing-private-key.pem"
        DevelopmentSettingsPath = Join-Path $appDir "appsettings.Development.json"
        ServiceName = $serviceName
        DefaultBackendUrl = if ($null -ne $manifest -and -not [string]::IsNullOrWhiteSpace([string]$manifest.backend_url)) {
            [string]$manifest.backend_url
        }
        else {
            "http://127.0.0.1:5080"
        }
    }
}

function Ensure-SmartPosDataLayout {
    param(
        [Parameter(Mandatory = $true)]$Paths
    )

    foreach ($path in @($Paths.DataRoot, $Paths.ConfigDir, $Paths.KeyDir, $Paths.LogsDir, $Paths.ExportsDir)) {
        if ([string]::IsNullOrWhiteSpace([string]$path)) {
            continue
        }

        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

function Copy-SmartPosFileIfMissing {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$DestinationPath
    )

    if (-not (Test-Path -LiteralPath $SourcePath) -or (Test-Path -LiteralPath $DestinationPath)) {
        return $false
    }

    $destinationDir = Split-Path -Parent $DestinationPath
    if (-not [string]::IsNullOrWhiteSpace($destinationDir)) {
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    }

    Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
    return $true
}

function Invoke-SmartPosLegacyMigration {
    param(
        [Parameter(Mandatory = $true)]$Paths
    )

    Ensure-SmartPosDataLayout -Paths $Paths

    $copied = [System.Collections.Generic.List[string]]::new()
    if (Copy-SmartPosFileIfMissing -SourcePath $Paths.LegacyClientEnvPath -DestinationPath $Paths.ClientEnvPath) {
        $copied.Add("client.env") | Out-Null
    }

    if (Copy-SmartPosFileIfMissing -SourcePath $Paths.LegacyDbPath -DestinationPath $Paths.DbPath) {
        $copied.Add("smartpos.db") | Out-Null
    }

    if (Copy-SmartPosFileIfMissing -SourcePath $Paths.LegacySigningKeyPath -DestinationPath $Paths.SigningKeyPath) {
        $copied.Add("license-signing-private-key.pem") | Out-Null
    }

    return $copied
}

function Read-ClientEnv {
    param(
        [Parameter(Mandatory = $true)][string]$Path
    )

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
    $lines.Add("# Auto-generated and managed by Lanka POS.") | Out-Null
    $lines.Add("") | Out-Null

    foreach ($entry in $Values.GetEnumerator()) {
        if ([string]::IsNullOrWhiteSpace([string]$entry.Key)) {
            continue
        }

        $lines.Add("$($entry.Key)=$([string]$entry.Value)") | Out-Null
    }

    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    Set-Content -LiteralPath $Path -Value $lines -Encoding ASCII
}

function New-RandomSecret {
    return ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))
}

function Test-LooksLikeBase64Key {
    param(
        [Parameter(Mandatory = $true)][string]$Candidate
    )

    $compact = [regex]::Replace($Candidate, "\s", "")
    if ($compact.Length -lt 128) {
        return $false
    }

    return $compact -match "^[A-Za-z0-9+/=]+$"
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
            # Ignore malformed development settings and fall through to explicit error.
        }
    }

    throw "Licensing signing key is not configured. Set SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM to a valid PEM file path and rerun."
}

function Get-SmartPosBackendUrl {
    param(
        [Parameter(Mandatory = $true)]$Paths,
        [System.Collections.IDictionary]$EnvValues
    )

    if ($null -ne $EnvValues) {
        $backendFromEnv = if ($EnvValues.Contains("SMARTPOS_BACKEND_URL")) {
            [string]$EnvValues["SMARTPOS_BACKEND_URL"]
        }
        else {
            ""
        }

        if ([string]::IsNullOrWhiteSpace($backendFromEnv) -and $EnvValues.Contains("ASPNETCORE_URLS")) {
            $candidateUrls = @(
                [string]$EnvValues["ASPNETCORE_URLS"] -split "[;,]" |
                    ForEach-Object { $_.Trim() } |
                    Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
            )
            if ($candidateUrls.Length -gt 0) {
                $backendFromEnv = $candidateUrls[0]
            }
        }

        if (-not [string]::IsNullOrWhiteSpace($backendFromEnv)) {
            return $backendFromEnv.Trim().TrimEnd("/")
        }
    }

    return $Paths.DefaultBackendUrl.Trim().TrimEnd("/")
}

function Initialize-SmartPosClientEnv {
    param(
        [Parameter(Mandatory = $true)]$Paths
    )

    Ensure-SmartPosDataLayout -Paths $Paths
    Invoke-SmartPosLegacyMigration -Paths $Paths | Out-Null

    $envValues = Read-ClientEnv -Path $Paths.ClientEnvPath
    if ((Test-Path -LiteralPath $Paths.LegacyClientEnvPath) -and
        -not [string]::Equals($Paths.LegacyClientEnvPath, $Paths.ClientEnvPath, [StringComparison]::OrdinalIgnoreCase)) {
        $legacyOverrides = Read-ClientEnv -Path $Paths.LegacyClientEnvPath
        foreach ($entry in $legacyOverrides.GetEnumerator()) {
            if ([string]::IsNullOrWhiteSpace([string]$entry.Key)) {
                continue
            }

            $envValues[$entry.Key] = [string]$entry.Value
        }
    }
    $defaultCloudRelayBaseUrl = "https://smartpos-backend-v7yd.onrender.com"

    if (-not $envValues.Contains("ASPNETCORE_ENVIRONMENT") -or [string]::IsNullOrWhiteSpace([string]$envValues["ASPNETCORE_ENVIRONMENT"])) {
        $envValues["ASPNETCORE_ENVIRONMENT"] = "Production"
    }

    if (-not $envValues.Contains("ASPNETCORE_URLS") -or [string]::IsNullOrWhiteSpace([string]$envValues["ASPNETCORE_URLS"])) {
        $envValues["ASPNETCORE_URLS"] = "http://127.0.0.1:5080"
    }

    $envValues["SMARTPOS_BACKEND_URL"] = Get-SmartPosBackendUrl -Paths $Paths -EnvValues $envValues
    $envValues["ConnectionStrings__Sqlite"] = "Data Source=$($Paths.DbPath)"

    $licensingRelayBaseUrl = if ($envValues.Contains("Licensing__CloudRelayBaseUrl")) {
        [string]$envValues["Licensing__CloudRelayBaseUrl"]
    }
    else {
        ""
    }

    $aiRelayBaseUrl = if ($envValues.Contains("AiInsights__CloudRelayBaseUrl")) {
        [string]$envValues["AiInsights__CloudRelayBaseUrl"]
    }
    else {
        ""
    }

    if ([string]::IsNullOrWhiteSpace($licensingRelayBaseUrl) -and [string]::IsNullOrWhiteSpace($aiRelayBaseUrl)) {
        $envValues["Licensing__CloudRelayBaseUrl"] = $defaultCloudRelayBaseUrl
        $licensingRelayBaseUrl = $defaultCloudRelayBaseUrl
    }

    if ([string]::IsNullOrWhiteSpace($aiRelayBaseUrl) -and -not [string]::IsNullOrWhiteSpace($licensingRelayBaseUrl)) {
        $envValues["AiInsights__CloudRelayBaseUrl"] = $licensingRelayBaseUrl
        $aiRelayBaseUrl = $licensingRelayBaseUrl
    }

    $aiCloudRelayEnabledRaw = if ($envValues.Contains("AiInsights__CloudRelayEnabled")) {
        [string]$envValues["AiInsights__CloudRelayEnabled"]
    }
    else {
        ""
    }

    if ([string]::IsNullOrWhiteSpace($aiCloudRelayEnabledRaw) -and -not [string]::IsNullOrWhiteSpace($aiRelayBaseUrl)) {
        $envValues["AiInsights__CloudRelayEnabled"] = "true"
        $aiCloudRelayEnabledRaw = "true"
    }

    $aiCloudRelayEnabled = @("1", "true", "yes", "on") -contains $aiCloudRelayEnabledRaw.Trim().ToLowerInvariant()

    if ($envValues.Contains("JwtAuth__SecretKey") -and -not [string]::IsNullOrWhiteSpace([string]$envValues["JwtAuth__SecretKey"])) {
        $envValues["SMARTPOS_JWT_SECRET"] = [string]$envValues["JwtAuth__SecretKey"]
    }

    if (-not $envValues.Contains("SMARTPOS_JWT_SECRET") -or [string]::IsNullOrWhiteSpace([string]$envValues["SMARTPOS_JWT_SECRET"])) {
        $envValues["SMARTPOS_JWT_SECRET"] = New-RandomSecret
    }
    $envValues["JwtAuth__SecretKey"] = [string]$envValues["SMARTPOS_JWT_SECRET"]

    if ($envValues.Contains("Licensing__DataEncryptionKey") -and -not [string]::IsNullOrWhiteSpace([string]$envValues["Licensing__DataEncryptionKey"])) {
        $envValues["SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY"] = [string]$envValues["Licensing__DataEncryptionKey"]
    }

    if (-not $envValues.Contains("SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY") -or [string]::IsNullOrWhiteSpace([string]$envValues["SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY"])) {
        $envValues["SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY"] = New-RandomSecret
    }
    $envValues["Licensing__DataEncryptionKey"] = [string]$envValues["SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY"]

    $signingKeyResolvedPath = Ensure-SigningKeyPath `
        -ConfiguredValue ($envValues["SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM"]) `
        -KeyFilePath $Paths.SigningKeyPath `
        -DevelopmentSettingsPath $Paths.DevelopmentSettingsPath
    $envValues["SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM"] = $signingKeyResolvedPath

    $openAiApiKey = if ($envValues.Contains("OPENAI_API_KEY")) {
        [string]$envValues["OPENAI_API_KEY"]
    }
    else {
        ""
    }

    if ([string]::IsNullOrWhiteSpace($openAiApiKey)) {
        if (-not $envValues.Contains("AiSuggestions__Enabled") -or [string]::IsNullOrWhiteSpace([string]$envValues["AiSuggestions__Enabled"])) {
            $envValues["AiSuggestions__Enabled"] = "false"
        }

        if ($aiCloudRelayEnabled -and -not [string]::IsNullOrWhiteSpace($aiRelayBaseUrl)) {
            $envValues["AiInsights__Enabled"] = "true"
        }
        elseif (-not $envValues.Contains("AiInsights__Enabled") -or [string]::IsNullOrWhiteSpace([string]$envValues["AiInsights__Enabled"])) {
            $envValues["AiInsights__Enabled"] = "false"
        }
    }

    return $envValues
}

function Set-SmartPosProcessEnvironment {
    param(
        [Parameter(Mandatory = $true)][System.Collections.IDictionary]$EnvValues
    )

    foreach ($entry in $EnvValues.GetEnumerator()) {
        if ([string]::IsNullOrWhiteSpace([string]$entry.Key)) {
            continue
        }

        [System.Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
    }
}
