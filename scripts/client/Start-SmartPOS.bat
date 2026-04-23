@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "APP_DIR=%ROOT%app"
set "APP_EXE=%APP_DIR%\backend.exe"
set "SERVICE_NAME=LankaPOSBackend"
set "LEGACY_SERVICE_NAME=SmartPOSBackend"

sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% NEQ 0 (
  sc query "%LEGACY_SERVICE_NAME%" >nul 2>&1
  if %errorlevel% EQU 0 set "SERVICE_NAME=%LEGACY_SERVICE_NAME%"
)

sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% EQU 0 (
  sc query "%SERVICE_NAME%" | find /I "RUNNING" >nul 2>&1
  if errorlevel 1 (
    echo Lanka POS Windows service detected. Starting service...
    net start "%SERVICE_NAME%" >nul 2>&1
    if errorlevel 1 (
      echo Failed to start service "%SERVICE_NAME%".
      echo Start it from Windows Services or run Install-SmartPOS-Service.bat as Administrator.
      pause
      exit /b 1
    )
  ) else (
    echo Lanka POS Windows service is already running.
  )

  start "" "http://127.0.0.1:5080"
  echo Lanka POS is running via Windows service.
  exit /b 0
)

if exist "%ROOT%client.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%client.env") do (
    set "_KEY=%%A"
    if not "!_KEY!"=="" if not "!_KEY:~0,1!"=="#" set "%%A=%%B"
  )
)

if "%ASPNETCORE_ENVIRONMENT%"=="" set "ASPNETCORE_ENVIRONMENT=Production"
if "%ASPNETCORE_URLS%"=="" set "ASPNETCORE_URLS=http://127.0.0.1:5080"
if "%Licensing__CloudRelayBaseUrl%"=="" if "%AiInsights__CloudRelayBaseUrl%"=="" set "Licensing__CloudRelayBaseUrl=https://smartpos-backend-v7yd.onrender.com"
if "%AiInsights__CloudRelayBaseUrl%"=="" if not "%Licensing__CloudRelayBaseUrl%"=="" set "AiInsights__CloudRelayBaseUrl=%Licensing__CloudRelayBaseUrl%"
if "%AiInsights__CloudRelayEnabled%"=="" if not "%AiInsights__CloudRelayBaseUrl%"=="" set "AiInsights__CloudRelayEnabled=true"

if "%SMARTPOS_JWT_SECRET%"=="" if not "%JwtAuth__SecretKey%"=="" set "SMARTPOS_JWT_SECRET=%JwtAuth__SecretKey%"
if "%JwtAuth__SecretKey%"=="" if not "%SMARTPOS_JWT_SECRET%"=="" set "JwtAuth__SecretKey=%SMARTPOS_JWT_SECRET%"
if "%SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY%"=="" if not "%Licensing__DataEncryptionKey%"=="" set "SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY=%Licensing__DataEncryptionKey%"
if "%Licensing__DataEncryptionKey%"=="" if not "%SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY%"=="" set "Licensing__DataEncryptionKey=%SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY%"

set "SIGNING_KEY_FILE=%APP_DIR%\license-signing-private-key.pem"
if "%SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM%"=="" if exist "%SIGNING_KEY_FILE%" set "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM=%SIGNING_KEY_FILE%"

if not "%SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM%"=="" (
  set "_SIGNING_KEY_RESOLVED="
  for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "$value = [string]$env:SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM; $keyFile = [string]$env:SIGNING_KEY_FILE; $resolved = ''; if (-not [string]::IsNullOrWhiteSpace($value)) { if (Test-Path -LiteralPath $value) { $resolved = (Resolve-Path -LiteralPath $value).Path } else { $material = $value.Replace('\\n', [Environment]::NewLine).Replace('\\', '').Replace('-----BEGIN PRIVATE KEY-----', '').Replace('-----END PRIVATE KEY-----', ''); $material = [regex]::Replace($material, '\s', ''); if ($material.Length -ge 128) { $pem = '-----BEGIN PRIVATE KEY-----' + [Environment]::NewLine + $material + [Environment]::NewLine + '-----END PRIVATE KEY-----'; Set-Content -LiteralPath $keyFile -Value $pem -NoNewline; $resolved = $keyFile } } }; if (-not [string]::IsNullOrWhiteSpace($resolved)) { Write-Output $resolved }"`) do set "_SIGNING_KEY_RESOLVED=%%S"
  if "!_SIGNING_KEY_RESOLVED!"=="" (
    set "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM="
  ) else (
    set "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM=!_SIGNING_KEY_RESOLVED!"
  )
)

if "%SMARTPOS_JWT_SECRET%"=="" (
  for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')"`) do set "SMARTPOS_JWT_SECRET=%%S"
  set "JwtAuth__SecretKey=!SMARTPOS_JWT_SECRET!"

  if exist "%ROOT%client.env" (
    >>"%ROOT%client.env" echo SMARTPOS_JWT_SECRET=!SMARTPOS_JWT_SECRET!
  ) else (
    >"%ROOT%client.env" (
      echo # Auto-generated on first run by Start-SmartPOS.bat
      echo SMARTPOS_JWT_SECRET=!SMARTPOS_JWT_SECRET!
    )
  )

  echo [Info] SMARTPOS_JWT_SECRET was not set. Generated one and saved to client.env.
)

if "%SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY%"=="" (
  for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "[guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')"`) do set "SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY=%%S"
  set "Licensing__DataEncryptionKey=!SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY!"

  if exist "%ROOT%client.env" (
    >>"%ROOT%client.env" echo SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY=!SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY!
  ) else (
    >"%ROOT%client.env" (
      echo # Auto-generated on first run by Start-SmartPOS.bat
      echo SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY=!SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY!
    )
  )

  echo [Info] SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY was not set. Generated one and saved to client.env.
)

if "%SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM%"=="" (
  for /f "usebackq delims=" %%S in (`powershell -NoProfile -Command "$path = Join-Path $env:APP_DIR 'appsettings.Development.json'; $keyFile = [string]$env:SIGNING_KEY_FILE; if (Test-Path -LiteralPath $path) { try { $cfg = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json; $pem = [string]$cfg.Licensing.SigningPrivateKeyPem; if (-not [string]::IsNullOrWhiteSpace($pem)) { $material = $pem.Replace('-----BEGIN PRIVATE KEY-----', '').Replace('-----END PRIVATE KEY-----', ''); $material = [regex]::Replace($material, '\s', ''); if ($material.Length -ge 128) { $normalizedPem = '-----BEGIN PRIVATE KEY-----' + [Environment]::NewLine + $material + [Environment]::NewLine + '-----END PRIVATE KEY-----'; Set-Content -LiteralPath $keyFile -Value $normalizedPem -NoNewline; Write-Output $keyFile } } } catch { } }"`) do set "SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM=%%S"
  if not "!SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM!"=="" (
    if exist "%ROOT%client.env" (
      >>"%ROOT%client.env" echo SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM=!SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM!
    ) else (
      >"%ROOT%client.env" (
        echo # Auto-generated on first run by Start-SmartPOS.bat
        echo SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM=!SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM!
      )
    )

    echo [Info] SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM was not set. Initialized key file and saved path to client.env.
  ) else (
    echo [Info] SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM is missing. Activation may fail until this is configured.
  )
)

if not "%SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM%"=="" (
  echo [Info] Licensing signing key path: %SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM%
)

if not exist "%APP_EXE%" (
  for %%F in ("%APP_DIR%\*.exe") do (
    set "APP_EXE=%%~fF"
    goto :found_exe
  )
)

:found_exe
if not exist "%APP_EXE%" (
  echo Could not find backend executable in "%APP_DIR%".
  pause
  exit /b 1
)

if "%OPENAI_API_KEY%"=="" (
  if "%AiSuggestions__Enabled%"=="" set "AiSuggestions__Enabled=false"
  if /I "%AiInsights__CloudRelayEnabled%"=="true" if not "%AiInsights__CloudRelayBaseUrl%"=="" (
    set "AiInsights__Enabled=true"
  ) else (
    if "%AiInsights__Enabled%"=="" set "AiInsights__Enabled=false"
  )

  if /I "%AiSuggestions__Enabled%"=="false" if /I "%AiInsights__Enabled%"=="false" (
    echo [Info] OPENAI_API_KEY is not set. AI suggestions and AI insights are disabled.
  ) else (
    if /I "%AiInsights__CloudRelayEnabled%"=="true" if not "%AiInsights__CloudRelayBaseUrl%"=="" (
      echo [Info] OPENAI_API_KEY is not set. AI insights will use cloud relay.
    ) else (
      echo [Info] OPENAI_API_KEY is not set. Configure OPENAI_API_KEY when enabling OpenAI AI features.
    )
  )
)

if /I "%AiSuggestions__Provider%"=="Custom" (
  if "%AiSuggestions__CustomEndpointUrl%"=="" (
    echo [Info] Custom AI provider selected but AiSuggestions__CustomEndpointUrl is empty.
  ) else (
    echo [Info] Custom AI provider: %AiSuggestions__CustomEndpointUrl%
  )
)

echo Starting Lanka POS backend...
start "Lanka POS Backend" /D "%APP_DIR%" "%APP_EXE%"

for /l %%I in (1,1,10) do (
  timeout /t 1 /nobreak >nul
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5080/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
  if !errorlevel! EQU 0 goto :open_browser
)

echo Backend started, but health check is still pending. Opening app anyway...

:open_browser
start "" "http://127.0.0.1:5080"

echo Lanka POS is running.
echo Use Stop-SmartPOS.bat to stop it.
exit /b 0
