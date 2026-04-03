# Render Backend Deploy (Temporary)

This deploy path hosts only the ASP.NET backend on Render, then connects your Vercel marketing site to it.

## 1. Deploy the backend from blueprint

In Render:

1. Click **New -> Blueprint**.
2. Select this repository.
3. Render will detect `render.yaml`.
4. Create the `smartpos-backend` service.

This blueprint uses SQLite for temporary testing, so you can start without creating Render Postgres.

## 2. Set required secrets in Render

Open the `smartpos-backend` service, then set:

- `SMARTPOS_JWT_SECRET`
- `SMARTPOS_LICENSE_SIGNING_PRIVATE_KEY_PEM`
- `Licensing__VerificationPublicKeyPem`
- `Licensing__AccessSuccessPageBaseUrl` = `https://smart-pos-system-with-ai.vercel.app/license/success`

Optional:

- `OPENAI_API_KEY`

## 3. Verify backend health

After deploy, open:

`https://<your-render-service>.onrender.com/health`

Expected: JSON with `"status":"ok"`.

## 4. Connect Vercel website to backend

In Vercel project env vars:

- `SMARTPOS_BACKEND_API_URL=https://<your-render-service>.onrender.com`
- `NEXT_PUBLIC_SITE_URL=https://smart-pos-system-with-ai.vercel.app`

Redeploy the website after updating env vars.

## 5. Notes for temporary testing

- SQLite on Render is ephemeral. Data can reset after deploy/restart.
- For persistent production data, switch to Postgres and set:
  - `Database__Provider=Postgres`
  - `ConnectionStrings__Postgres=<postgres-connection-string>`
