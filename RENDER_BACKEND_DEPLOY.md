# Render Deploy (Backend + POS Frontend)

This deployment path hosts both the ASP.NET backend and the POS frontend on Render using `render.yaml`.

## 1. Deploy from blueprint

In Render:

1. Click **New -> Blueprint**.
2. Select this repository.
3. Render will detect `render.yaml`.
4. Create both services:
   - `smartpos-backend`
   - `smartpos-pos-frontend`

## 2. Set backend secrets

Open the `smartpos-backend` service and set:

- `SMARTPOS_JWT_SECRET`
- `SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM`
- `Licensing__VerificationPublicKeyPem`
- `Licensing__AccessSuccessPageBaseUrl`

Recommended value for `Licensing__AccessSuccessPageBaseUrl` while using Render URLs:

- `https://<your-pos-frontend>.onrender.com/license/success`

Optional:

- `OPENAI_API_KEY`

## 3. Configure POS frontend upstream

Open the `smartpos-pos-frontend` service and confirm:

- `BACKEND_UPSTREAM=https://<your-backend>.onrender.com`

The frontend service proxies `/api/*` to this backend URL.

## 4. Verify services

Backend health:

- `https://<your-backend>.onrender.com/health`

Frontend health:

- `https://<your-pos-frontend>.onrender.com/health`

POS app:

- `https://<your-pos-frontend>.onrender.com/`

Super admin login:

- `https://<your-pos-frontend>.onrender.com/admin/login`

## 5. Notes

- This setup works without a custom domain.
- Keeping POS UI and API traffic through the frontend proxy avoids browser CORS/cookie friction.
- Current blueprint uses SQLite (`Database__Provider=Sqlite`) for temporary testing.
- For persistent production data, switch backend to Postgres:
  - `Database__Provider=Postgres`
  - `ConnectionStrings__Postgres=<postgres-connection-string>`
