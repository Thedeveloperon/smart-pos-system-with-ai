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
- Generate-Offline-Activation-Codes.bat (creates fresh activation keys from this same local backend)
- client.env.example   (optional runtime settings)

How to run on client PC:
1. Extract this package anywhere (for example: C:\Lanka POS\).
2. (Optional) copy client.env.example to client.env and set AI provider keys/settings.
3. (Recommended) run Precheck-SmartPOS-Host.bat first and fix any failed checks.
4. Right-click Install-SmartPOS-Service.bat and run as Administrator (one-time setup).
5. Double-click Start-SmartPOS.bat (opens browser, uses Windows service mode).
6. If you need activation keys, run Generate-Offline-Activation-Codes.bat and use one generated key.
7. To remove service mode later, run Uninstall-SmartPOS-Service.bat as Administrator.
8. Daily use: double-click desktop shortcut "Open Lanka POS".

Default seeded users:
- owner / owner123
- manager / manager123
- cashier / cashier123

Data file:
- app/smartpos.db (created automatically on first run)

Notes:
- Keep the app/ folder next to the Start/Stop scripts.
- Windows service mode is recommended for customer PCs because backend stays running even if launcher windows are closed.
- Install-SmartPOS-Service.bat automatically runs host precheck before service installation.
- Precheck validates: Windows OS, x64 support, admin rights, required files, sc.exe availability, write permissions, service status, and backend port conflicts.
- Install-SmartPOS-Service.bat creates:
  - Desktop shortcut: Open Lanka POS
  - Start Menu folder: Lanka POS (open/stop/generate activation codes)
  - Shortcut icon: lanka-pos.ico
- If no JWT secret is configured, service install/start scripts auto-generate SMARTPOS_JWT_SECRET and save it to client.env.
- If no licensing data encryption key is configured, service install/start scripts auto-generate SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY and save it to client.env.
- If no licensing signing private key is configured, service install/start scripts initialize app\license-signing-private-key.pem and save its path to SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM in client.env.
- If neither Licensing__CloudRelayBaseUrl nor AiInsights__CloudRelayBaseUrl is configured, service install/start scripts default Licensing__CloudRelayBaseUrl to https://smartpos-backend-v7yd.onrender.com for cloud account linking.
- Activation keys must be generated against this same running backend instance (http://127.0.0.1:5080) and its current database.
- Use Generate-Offline-Activation-Codes.bat from this package to avoid environment/database mismatch.
- If OPENAI_API_KEY is not configured, Start-SmartPOS.bat disables AI suggestions/insights so startup still succeeds.
- For OpenAI AI features: set OPENAI_API_KEY in client.env.
- For your own AI endpoint: set ASPNETCORE_ENVIRONMENT=Development, AiSuggestions__Provider=Custom, and AiSuggestions__CustomEndpointUrl.
- For local vision-based image suggestions, run scripts/vision-service on the same PC and set:
  ASPNETCORE_ENVIRONMENT=Development
  AiSuggestions__Provider=Custom
  AiSuggestions__CustomEndpointUrl=http://127.0.0.1:8091/v1/suggestions
- Stop the app using Stop-SmartPOS.bat.
