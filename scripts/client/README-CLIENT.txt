LANKA POS - Client Package
==========================

Contents:
- app/                 (backend executable + API + frontend bundle)
- lanka-pos.ico        (shortcut icon generated from apps/pos-app/public/favicon.png)
- Install-SmartPOS-Service.bat   (recommended, run once as Administrator)
- Precheck-SmartPOS-Host.bat     (validates this PC before install)
- Uninstall-SmartPOS-Service.bat (remove Windows service)
- Start-SmartPOS.bat   (opens POS and starts service if installed)
- Stop-SmartPOS.bat    (stops service if installed)
- Activation-Code-Manager.bat     (GUI admin tool launcher for offline activation code generation)
- Generate-Offline-Activation-Codes.bat (creates fresh activation keys from this same local backend)
- client.env.example   (optional runtime settings)

How to run on client PC:
1. Extract this package anywhere (for example: C:\Lanka POS\).
2. (Recommended) run Precheck-SmartPOS-Host.bat first and fix any failed checks.
3. For customer PCs, right-click Install-SmartPOS-Service.bat and run as Administrator (one-time setup).
4. For current-user mode, just double-click Start-SmartPOS.bat.
5. After setup, edit the generated runtime config if needed:
   - current-user mode: %LOCALAPPDATA%\Lanka POS\data\config\client.env
   - Windows service mode: %ProgramData%\Lanka POS\config\client.env
6. Daily use: double-click desktop shortcut "Open Lanka POS" or use the Start Menu.
7. If you need activation keys, open Start Menu > Lanka POS > Generate Offline Activation Codes.
8. The GUI tool requires support_admin or security_admin credentials plus MFA.
9. Batch fallback still exists: run Generate-Offline-Activation-Codes.bat if you need the older CLI flow.
10. To remove service mode later, run Uninstall-SmartPOS-Service.bat as Administrator.

Default seeded users:
- owner / owner123
- manager / manager123
- cashier / cashier123

Data file:
- current-user mode: %LOCALAPPDATA%\Lanka POS\data\smartpos.db
- Windows service mode: %ProgramData%\Lanka POS\smartpos.db

Notes:
- Keep the app/ folder next to the Start/Stop scripts.
- Windows service mode is recommended for customer PCs because backend stays running even if launcher windows are closed.
- Install-SmartPOS-Service.bat automatically runs host precheck before service installation.
- Precheck validates: Windows OS, x64 support, admin rights, required files, sc.exe availability, write permissions, service status, and backend port conflicts.
- Install-SmartPOS-Service.bat creates:
  - Desktop shortcut: Open Lanka POS
  - Start Menu folder: Lanka POS (open/stop/generate activation codes)
  - Shortcut icon: lanka-pos.ico
- Runtime config is stored outside the install folder:
  - current-user mode: %LOCALAPPDATA%\Lanka POS\data\config\client.env
  - Windows service mode: %ProgramData%\Lanka POS\config\client.env
- If no JWT secret is configured, service install/start scripts auto-generate SMARTPOS_JWT_SECRET and save it to the generated client.env.
- If no licensing data encryption key is configured, service install/start scripts auto-generate SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY and save it to the generated client.env.
- If no licensing signing private key is configured, service install/start scripts initialize keys\license-signing-private-key.pem under the external data root and save its path to SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM in client.env.
- If neither Licensing__CloudRelayBaseUrl nor AiInsights__CloudRelayBaseUrl is configured, service install/start scripts default Licensing__CloudRelayBaseUrl to https://smartpos-backend-v7yd.onrender.com for cloud account linking.
- If AiInsights__CloudRelayBaseUrl is empty but Licensing__CloudRelayBaseUrl is set, service install/start scripts mirror that value to AiInsights__CloudRelayBaseUrl and set AiInsights__CloudRelayEnabled=true.
- Activation keys must be generated against this same running backend instance (http://127.0.0.1:5080) and its current database.
- Use the GUI activation manager or Generate-Offline-Activation-Codes.bat from this package to avoid environment/database mismatch.
- If OPENAI_API_KEY is not configured, Start-SmartPOS.bat keeps AI insights enabled when cloud relay is configured; otherwise it disables local AI suggestions/insights so startup still succeeds.
- For OpenAI AI features: set OPENAI_API_KEY in the generated client.env.
- For your own AI endpoint: set ASPNETCORE_ENVIRONMENT=Development, AiSuggestions__Provider=Custom, and AiSuggestions__CustomEndpointUrl.
- For local vision-based image suggestions, run scripts/vision-service on the same PC and set:
  ASPNETCORE_ENVIRONMENT=Development
  AiSuggestions__Provider=Custom
  AiSuggestions__CustomEndpointUrl=http://127.0.0.1:8091/v1/suggestions
- Stop the app using Stop-SmartPOS.bat.
