# SmartPOS Marketing Website (Next.js)

This folder contains the standalone SmartPOS marketing site built with Next.js App Router.

## Requirements

- Node.js 20+
- npm 10+

## Local Development

```bash
npm install
npm run dev
```

The site runs at `http://localhost:3000`.

## Production

```bash
npm run build
npm run start
```

## Quality Checks

```bash
npm run lint
npm run test
```

## Deployment Contract

- Build command: `npm run build`
- Start command: `npm run start`
- Runtime port: `3000` by default (override via `PORT`)
- Optional env var:
  - `NEXT_PUBLIC_SITE_URL` (used for canonical and social metadata; defaults to `https://smartpos.lk`)
