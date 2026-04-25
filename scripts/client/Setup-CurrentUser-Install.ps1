[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "SmartPOS-ClientCommon.ps1")

$paths = Resolve-SmartPosPaths -RootPath $PSScriptRoot -PreferredInstallMode "current_user"
if (-not (Test-Path -LiteralPath $paths.BackendExePath)) {
    throw "backend.exe not found at '$($paths.BackendExePath)'."
}

$migrated = Invoke-SmartPosLegacyMigration -Paths $paths
$envValues = Initialize-SmartPosClientEnv -Paths $paths
$backendUrl = Get-SmartPosBackendUrl -Paths $paths -EnvValues $envValues

Write-ClientEnv -Path $paths.ClientEnvPath -Values $envValues
Write-SmartPosInstallManifest `
    -RootPath $paths.RootPath `
    -InstallMode "current_user" `
    -DataRoot $paths.DataRoot `
    -BackendUrl $backendUrl | Out-Null

Write-Host "Lanka POS current-user install initialized." -ForegroundColor Green
Write-Host "Data root: $($paths.DataRoot)"
Write-Host "Config path: $($paths.ClientEnvPath)"
Write-Host "Backend URL: $backendUrl"
if ($migrated.Count -gt 0) {
    Write-Host "Migrated legacy files: $($migrated -join ', ')" -ForegroundColor Yellow
}
