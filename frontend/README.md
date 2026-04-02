# RetailFlow POS Frontend

Frontend for the RetailFlow POS system.

## Environment

- `VITE_API_BASE_URL`: backend API base URL (`http://127.0.0.1:5080` for local)
- `VITE_INSTALLER_DOWNLOAD_URL`: optional fallback installer URL (used when backend does not return `installer_download_url`)
- `VITE_INSTALLER_CHECKSUM_SHA256`: optional fallback checksum (used when backend does not return `installer_checksum_sha256`)

## E2E

- `npm run test:e2e:marketing`: validates pricing CTA onboarding redirect and license success installer UX against local website + frontend dev servers.
