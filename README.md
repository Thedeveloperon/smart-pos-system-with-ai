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

## 3. Run frontend

```bash
cd "/Users/iroshwijesiri/Documents/SMART POS SYSTEM WITH AI/frontend"
npm run dev -- --host 127.0.0.1 --port 5173
```

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

