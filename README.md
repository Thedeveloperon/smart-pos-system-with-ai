# SmartPOS Lanka

Local development quick start for backend, frontend, and super-admin MFA.

## 1. One-time setup (local signing keys)

```bash
mkdir -p ~/.smartpos
[ -f ~/.smartpos/license-private.pem ] || openssl genrsa -out ~/.smartpos/license-private.pem 2048
openssl rsa -in ~/.smartpos/license-private.pem -pubout -out ~/.smartpos/license-public.pem
```

## 2. Run backend

```bash
cd "/Users/iroshwijesiri/Documents/SMART POS SYSTEM WITH AI"
export SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM="$(cat ~/.smartpos/license-private.pem)"
export Licensing__VerificationPublicKeyPem="$(cat ~/.smartpos/license-public.pem)"
dotnet run --project backend/backend.csproj --urls "http://127.0.0.1:5080"
```

Optional (enable automatic access email delivery after payment verification):

```bash
export Licensing__AccessDeliveryEmailEnabled=true
export Licensing__AccessDeliverySmtpHost="smtp.your-provider.com"
export Licensing__AccessDeliverySmtpPort=587
export Licensing__AccessDeliverySmtpEnableSsl=true
export Licensing__AccessDeliveryFromEmail="noreply@your-domain.com"
export Licensing__AccessDeliverySmtpUsername="smtp-user"
export SMARTPOS_ACCESS_DELIVERY_SMTP_PASSWORD="smtp-password"
```

Optional (protected installer download links from backend):

```bash
export Licensing__InstallerDownloadBaseUrl="https://downloads.your-domain.com/SmartPOS-Setup.exe"
export Licensing__InstallerDownloadProtectedEnabled=true
export Licensing__InstallerDownloadTokenTtlMinutes=30
export SMARTPOS_INSTALLER_DOWNLOAD_SIGNING_SECRET="replace-with-strong-secret"
export Licensing__InstallerChecksumSha256="paste-installer-sha256"
```

Optional (staged rollout gate for barcode generation/validation endpoints):

```bash
# default is enabled; set false to disable barcode feature APIs
export ProductBarcodes__Enabled=true
```

Barcode mutation endpoints (`/api/products/{id}/barcode/generate`, `/api/products/barcodes/bulk-generate-missing`) also honor `Idempotency-Key` for deterministic safe retries.

## 3. Run frontend

```bash
cd "/Users/iroshwijesiri/Documents/SMART POS SYSTEM WITH AI/frontend"
npm run dev -- --host 127.0.0.1 --port 5173
```

Optional (pilot rollout gate for POS keyboard shortcuts):

```bash
# default is enabled; set false to disable shortcuts, labels, and onboarding
export VITE_POS_SHORTCUTS_ENABLED=true
```

Optional (staged rollout gate for barcode UI actions):

```bash
# default is enabled; set false to hide barcode generate/regenerate/print/scanner UX
export VITE_BARCODE_FEATURE_ENABLED=true
```

Barcode label print supports both desktop Chromium and Electron shell runtimes with runtime-specific print trigger behavior.

## 4. URLs

- POS app: `http://127.0.0.1:5173/`
- Super admin login: `http://127.0.0.1:5173/admin/login`
- Super admin console: `http://127.0.0.1:5173/admin`
- Backend health: `http://127.0.0.1:5080/health`

## 5. Seeded users

- Shop users:
  - `owner / owner123`
  - `manager / manager123`
  - `cashier / cashier123`
- Super admin users (MFA required):
  - `support_admin / support123`
  - `billing_admin / billing123`
  - `security_admin / security123`

## 6. Generate MFA codes (super admin)

Codes rotate every 30 seconds.

### 6.1 Support admin only

```bash
node - <<'NODE'
const crypto=require('crypto');
const secret='support-admin-mfa-secret-2026';
const now=Math.floor(Date.now()/1000), counter=Math.floor(now/30);
const buf=Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
const hash=crypto.createHmac('sha1', Buffer.from(secret,'utf8')).update(buf).digest();
const offset=hash[hash.length-1]&0x0f;
const value=((hash[offset]&0x7f)<<24)|((hash[offset+1]&0xff)<<16)|((hash[offset+2]&0xff)<<8)|(hash[offset+3]&0xff);
console.log(String(value%1_000_000).padStart(6,'0'));
NODE
```

### 6.2 All super-admin users (current/prev/next)

```bash
node - <<'NODE'
const crypto=require('crypto');
const users={
  support_admin:'support-admin-mfa-secret-2026',
  billing_admin:'billing-admin-mfa-secret-2026',
  security_admin:'security-admin-mfa-secret-2026',
};
function code(secret, counter){
  const buf=Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const hash=crypto.createHmac('sha1', Buffer.from(secret,'utf8')).update(buf).digest();
  const offset=hash[hash.length-1]&0x0f;
  const value=((hash[offset]&0x7f)<<24)|((hash[offset+1]&0xff)<<16)|((hash[offset+2]&0xff)<<8)|(hash[offset+3]&0xff);
  return String(value%1_000_000).padStart(6,'0');
}
const now=Math.floor(Date.now()/1000), counter=Math.floor(now/30), remaining=30-(now%30);
console.log(`UTC ${new Date(now*1000).toISOString()} | ${remaining}s remaining`);
for (const [user, secret] of Object.entries(users)){
  console.log(`${user}: current=${code(secret,counter)} prev=${code(secret,counter-1)} next=${code(secret,counter+1)}`);
}
NODE
```

## 7. POS keyboard shortcuts

These are enabled by default in cashier billing flow (desktop and laptop keyboards):

- `F2`: focus product search
- `F4`: hold current bill
- `F8`: open cash workflow
- `F9`: complete sale (only when valid)
- `F1` or `?`: open shortcuts help
- `Esc`: close shortcuts help dialog

Behavior and safety:

- Shortcuts are ignored while typing in input fields.
- Shortcuts are suspended when POS dialogs/drawers are open.
- Blocked actions show clear reasons (for example, `F9 blocked` when payment is insufficient).

## 8. Cashier quick card text

Use this exact text on a printed desk card for training:

```text
SMART POS SHORTCUTS
F2 Search   F4 Hold   F8 Cash   F9 Complete
F1/? Help   Esc Close Help
```

## 9. AI insights setup (credits + OpenAI)

Required for production OpenAI provider:

```bash
export OPENAI_API_KEY="sk-..."
export SMARTPOS_AI_WEBHOOK_SIGNING_SECRET="replace-with-strong-random-secret"
```

Recommended production config values:

- `AiInsights:Provider=OpenAI`
- `AiInsights:PricingRulesVersion=ai_pricing_v1_2026_04_03`
- `AiInsights:Model=gpt-5.4-mini`
- `AiInsights:AllowedModels=["gpt-5.4-mini","local-pos-insights-v1"]`
- `AiInsights:EnableManualWalletTopUp=false`

Credit pack catalog and pricing policy are documented in:

- `AI_INSIGHTS_PRICING_RULES_V1_2026-04-03.md`
