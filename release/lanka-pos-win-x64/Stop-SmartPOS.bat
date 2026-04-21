@echo off
setlocal

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
    echo Lanka POS Windows service is not running.
  ) else (
    net stop "%SERVICE_NAME%" >nul 2>&1
    if errorlevel 1 (
      echo Failed to stop Lanka POS Windows service.
    ) else (
      echo Lanka POS Windows service stopped.
    )
  )
  exit /b 0
)

taskkill /IM backend.exe /F >nul 2>&1
if %errorlevel% EQU 0 (
  echo Lanka POS backend stopped.
) else (
  echo Lanka POS backend is not running.
)

exit /b 0
