@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "APP_DIR=%ROOT%app"
set "APP_EXE=%APP_DIR%\backend.exe"

if exist "%ROOT%client.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%client.env") do (
    set "_KEY=%%A"
    if not "!_KEY!"=="" if not "!_KEY:~0,1!"=="#" set "%%A=%%B"
  )
)

if "%ASPNETCORE_ENVIRONMENT%"=="" set "ASPNETCORE_ENVIRONMENT=Production"
if "%ASPNETCORE_URLS%"=="" set "ASPNETCORE_URLS=http://127.0.0.1:5080"

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

if "%AiSuggestions__Provider%"=="" set "AiSuggestions__Provider=Local"

if /I "%AiSuggestions__Provider%"=="OpenAI" (
  if "%OPENAI_API_KEY%"=="" (
    echo [Info] OPENAI_API_KEY is not set. OpenAI suggestions will be unavailable.
  )
)

if /I "%AiSuggestions__Provider%"=="Custom" (
  if "%AiSuggestions__CustomEndpointUrl%"=="" (
    echo [Info] Custom AI provider selected but AiSuggestions__CustomEndpointUrl is empty.
  ) else (
    echo [Info] Custom AI provider: %AiSuggestions__CustomEndpointUrl%
  )
)

echo Starting SmartPOS backend...
start "SmartPOS Backend" /D "%APP_DIR%" "%APP_EXE%"

for /l %%I in (1,1,10) do (
  timeout /t 1 /nobreak >nul
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5080/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
  if !errorlevel! EQU 0 goto :open_browser
)

echo Backend started, but health check is still pending. Opening app anyway...

:open_browser
start "" "http://127.0.0.1:5080"

echo SmartPOS is running.
echo Use Stop-SmartPOS.bat to stop it.
exit /b 0
