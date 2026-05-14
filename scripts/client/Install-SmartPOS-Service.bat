@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Precheck-SmartPOS-Host.ps1" -RequireAdmin
set "PRECHECK_EXIT_CODE=%ERRORLEVEL%"

if not "%PRECHECK_EXIT_CODE%"=="0" (
  echo.
  echo Lanka POS host precheck failed. Fix the failed items above and retry.
  pause
  exit /b %PRECHECK_EXIT_CODE%
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Install-SmartPOS-Service.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Lanka POS service installation failed.
  pause
)

exit /b %EXIT_CODE%
