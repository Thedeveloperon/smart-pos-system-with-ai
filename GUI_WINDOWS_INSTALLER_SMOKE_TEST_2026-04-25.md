# GUI Windows Installer Smoke Test (2026-04-25)

Use this checklist on a Windows 10/11 x64 machine after pulling the latest repo changes. Run both install modes before publishing a customer-facing `Setup.exe`.

## 1. Build the installer

Prerequisites:
- Inno Setup 6 installed (`ISCC.exe`)
- PowerShell 5.1 or newer
- .NET SDK matching repo `global.json`
- Node/npm available

Command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-installer.ps1 -AppVersion 1.0.0
```

Expected output:
- `release\installer\Lanka POS-Setup-1.0.0.exe`
- `release\lanka-pos-win-x64\`

## 2. Current-user install smoke test

1. Run `release\installer\Lanka POS-Setup-1.0.0.exe`.
2. Choose `Current user` mode when Setup asks for install mode.
3. Finish install and launch the app.

Expected results:
- Install root: `%LOCALAPPDATA%\Lanka POS`
- Install root is minimal and should mainly contain:
  - `app\`
  - `tools\`
  - `smartpos.install.json`
  - uninstaller files
- Data root: `%LOCALAPPDATA%\Lanka POS\data`
- Config file exists: `%LOCALAPPDATA%\Lanka POS\data\config\client.env`
- Database file is created after first successful launch: `%LOCALAPPDATA%\Lanka POS\data\smartpos.db`
- Install manifest exists: `%LOCALAPPDATA%\Lanka POS\smartpos.install.json`
- Start Menu entries exist:
  - `Open Lanka POS`
  - `Stop Lanka POS`
  - `Generate Offline Activation Codes`
- App opens at `http://127.0.0.1:5080`

## 3. Windows service install smoke test

1. Uninstall the current-user install or use a clean VM snapshot.
2. Run `release\installer\Lanka POS-Setup-1.0.0.exe`.
3. Choose `Windows service` mode.
4. Finish install and let Setup configure the service.

Expected results:
- Install root: `%ProgramFiles%\Lanka POS`
- Install root is minimal and should mainly contain:
  - `app\`
  - `tools\`
  - `smartpos.install.json`
  - uninstaller files
- Data root: `%ProgramData%\Lanka POS`
- Config file exists: `%ProgramData%\Lanka POS\config\client.env`
- Database file is created after first successful launch: `%ProgramData%\Lanka POS\smartpos.db`
- Install manifest exists: `%ProgramFiles%\Lanka POS\smartpos.install.json`
- Windows service exists: `LankaPOSBackend`
- Service startup type is `Automatic`
- Service recovery actions are configured
- Start Menu entries exist under `Lanka POS`
- App opens at `http://127.0.0.1:5080`

## 4. Activation code GUI smoke test

Run from Start Menu:
- `Lanka POS > Generate Offline Activation Codes`

Expected behavior:
- GUI window title is `Lanka POS Activation Code Manager`
- Backend URL resolves to the installed local backend
- Login requires explicit username and password
- `support_admin` or `security_admin` can generate a code without entering MFA
- Generation defaults to the local default shop without prompting for shop code
- Generated count is `1`
- GUI displays:
  - backend URL
  - generated count
  - source reference
  - plaintext activation key
- `Copy Selected`, `Copy All`, and `Export CSV` work
- Export only happens to a user-selected path
- Password field is cleared after generation

Negative checks:
- `owner` or `manager` credentials must fail authorization
- If backend is stopped, GUI must show a clear error instead of generating against another environment

## 5. Upgrade regression check

Simulate upgrade from an older package that used install-root state:
- legacy `client.env` beside scripts
- legacy DB at `app\smartpos.db`
- legacy signing key at `app\license-signing-private-key.pem`

Expected results after reinstall/upgrade:
- Legacy files are copied into the new external data root if the new locations are empty
- Existing runtime settings remain intact
- App still starts and uses the migrated DB
- Activation code generation still targets the same local backend/database

## 6. Uninstall checks

Current-user uninstall:
- Remove app from Apps & Features or uninstaller entry
- Confirm binaries and Start Menu shortcuts are removed
- Confirm `%LOCALAPPDATA%\Lanka POS\data` remains intact

Windows service uninstall:
- Run uninstall path and confirm `LankaPOSBackend` is deleted
- Confirm Start Menu shortcuts are removed
- Confirm `%ProgramData%\Lanka POS` remains intact

## 7. Release sign-off

Do not ship until all of the following are true:
- Installer builds successfully
- Both install modes pass
- Activation code GUI passes happy path and authorization failure path
- Upgrade migration path passes
- Uninstall path passes
- Installer is code-signed and timestamped for release builds
