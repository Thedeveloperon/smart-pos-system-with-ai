@echo off
setlocal

taskkill /IM backend.exe /F >nul 2>&1
if %errorlevel% EQU 0 (
  echo SmartPOS backend stopped.
) else (
  echo SmartPOS backend is not running.
)

exit /b 0
