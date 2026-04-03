# Render Deploy (Backend + POS Frontend + Marketing Website)

This deployment path hosts all three apps on Render using `render.yaml`:

- ASP.NET backend API
- POS frontend (with `/api/*` proxy to backend)
- Next.js marketing website

## 1. Deploy from blueprint

In Render:

1. Click **New -> Blueprint**.
2. Select this repository.
3. Render will detect `render.yaml`.
4. Create all services:
   - `smartpos-backend`
   - `smartpos-pos-frontend`
   - `smartpos-marketing-website`

## 2. Set backend secrets

Open the `smartpos-backend` service and set:

- `SMARTPOS_JWT_SECRET`
- `SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM`
- `SMARTPOS_LICENSE_DATA_ENCRYPTION_KEY`
- `Licensing__VerificationPublicKeyPem`
- `Licensing__AccessSuccessPageBaseUrl`

Recommended value for `Licensing__AccessSuccessPageBaseUrl` while using Render URLs:

- `https://<your-pos-frontend>.onrender.com/license/success`

Optional:

- `OPENAI_API_KEY`

Database configuration is already wired in `render.yaml`:

- Blueprint creates `smartpos-postgres` (Render managed Postgres)
- Backend receives `ConnectionStrings__Postgres` from that database
- Backend uses `Database__Provider=Postgres`

## 3. Configure POS frontend upstream

The frontend `BACKEND_UPSTREAM` is wired in `render.yaml` from backend
`RENDER_EXTERNAL_URL`, so no manual URL hardcoding is required.

## 4. Configure marketing website env

Open `smartpos-marketing-website` and set:

- `SMARTPOS_BACKEND_API_URL=https://<your-backend>.onrender.com`
- `NEXT_PUBLIC_SITE_URL=https://<your-marketing-website>.onrender.com`

## 5. Verify services

Backend health:

- `https://<your-backend>.onrender.com/health`

Frontend health:

- `https://<your-pos-frontend>.onrender.com/health`

POS app:

- `https://<your-pos-frontend>.onrender.com/`

Super admin login:

- `https://<your-pos-frontend>.onrender.com/admin/login`

Marketing website:

- `https://<your-marketing-website>.onrender.com/`

## 6. Notes

- This setup works without a custom domain.
- Keeping POS UI and API traffic through the frontend proxy avoids browser CORS/cookie friction.
- Current blueprint uses Render managed Postgres for persistent production data.
