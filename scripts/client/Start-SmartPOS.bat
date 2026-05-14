@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Start-SmartPOS.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Lanka POS startup failed.
  pause
)

exit /b %EXIT_CODE%

echo Lanka POS is running.
echo Use Stop-SmartPOS.bat to stop it.
exit /b 0
