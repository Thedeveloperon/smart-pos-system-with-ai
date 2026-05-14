param(
  [string]$PortalBaseUrl = 'https://smartpos-marketing-website.onrender.com',
  [string]$BackendBaseUrl = 'https://smartpos-backend-v7yd.onrender.com'
)

$ErrorActionPreference = 'Stop'

function Get-Status {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [string]$Method = 'GET',
    [string]$Body = $null,
    [string]$ContentType = 'application/json'
  )

  try {
    if (-not [string]::IsNullOrWhiteSpace($Body)) {
      $resp = Invoke-WebRequest -Uri $Url -Method $Method -Body $Body -ContentType $ContentType -MaximumRedirection 0 -TimeoutSec 30 -ErrorAction Stop
    } else {
      $resp = Invoke-WebRequest -Uri $Url -Method $Method -MaximumRedirection 0 -TimeoutSec 30 -ErrorAction Stop
    }

    return [pscustomobject]@{
      Url = $Url
      Status = [int]$resp.StatusCode
      Body = ($resp.Content | Out-String).Trim()
      Error = $null
    }
  }
  catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      $body = ''
      try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = ($reader.ReadToEnd() | Out-String).Trim()
      }
      catch {
        $body = ''
      }

      return [pscustomobject]@{
        Url = $Url
        Status = $status
        Body = $body
        Error = $null
      }
    }

    return [pscustomobject]@{
      Url = $Url
      Status = -1
      Body = ''
      Error = $_.Exception.Message
    }
  }
}

Write-Host "Cloud linking verification" -ForegroundColor Cyan
Write-Host "Portal:  $PortalBaseUrl"
Write-Host "Backend: $BackendBaseUrl"
Write-Host ""

$results = @()
$results += Get-Status -Url "$PortalBaseUrl/api/account/tenant-context"
$results += Get-Status -Url "$PortalBaseUrl/api/account/license-portal"
$loginProbeBody = @{ username = 'invalid-user'; password = 'invalid-pass' } | ConvertTo-Json
$results += Get-Status -Url "$PortalBaseUrl/api/account/login" -Method 'POST' -Body $loginProbeBody
$results += Get-Status -Url "$BackendBaseUrl/api/account/tenant-context"

$results | ForEach-Object {
  $statusText = if ($_.Status -ge 0) { $_.Status } else { 'ERR' }
  Write-Host "[$statusText] $($_.Url)"
  if ($_.Error) {
    Write-Host "  error: $($_.Error)" -ForegroundColor Red
  }
  elseif ($_.Body) {
    $preview = $_.Body
    if ($preview.Length -gt 180) {
      $preview = $preview.Substring(0, 180) + '...'
    }
    Write-Host "  body: $preview"
  }
}

Write-Host ""
Write-Host "Expected after correct deploy:" -ForegroundColor Yellow
Write-Host "- /api/account/tenant-context => 401 when unauthenticated (NOT 404)"
Write-Host "- /api/account/login => 400 for invalid creds (route exists)"
Write-Host "- /api/account/license-portal => typically 401 unauthenticated"
