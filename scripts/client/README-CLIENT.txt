LANKA POS - Client Package
==========================

Contents:
- app/                 (backend executable + API + frontend bundle)
- Start-SmartPOS.bat   (double-click to start)
- Stop-SmartPOS.bat    (double-click to stop)
- client.env.example   (optional runtime settings)

How to run on client PC:
1. Extract this package anywhere (for example: C:\Lanka POS\).
2. (Optional) copy client.env.example to client.env and set AI provider keys/settings.
3. Double-click Start-SmartPOS.bat.
4. Browser opens automatically at http://127.0.0.1:5080.

Default seeded users:
- owner / owner123
- manager / manager123
- cashier / cashier123

Data file:
- app/smartpos.db (created automatically on first run)

Notes:
- Keep the app/ folder next to the Start/Stop scripts.
- For OpenAI suggestions: set OPENAI_API_KEY.
- For your own AI endpoint: set AiSuggestions__Provider=Custom and AiSuggestions__CustomEndpointUrl.
- For local vision-based image suggestions, run scripts/vision-service on the same PC and set:
  AiSuggestions__Provider=Custom
  AiSuggestions__CustomEndpointUrl=http://127.0.0.1:8091/v1/suggestions
- Stop the app using Stop-SmartPOS.bat.
