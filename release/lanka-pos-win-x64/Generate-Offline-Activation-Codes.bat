@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Generate-Offline-Activation-Codes.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Offline activation code generation failed.
  pause
)

exit /b %EXIT_CODE%
