# Performance Baseline (MVP)

Measured on **March 27, 2026** using local development environment:
- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:5080`

## Command

```bash
cd frontend
npm run perf:slo
```

## Sampling Config

- checkout samples: `30`
- sync samples: `30`
- dashboard load samples: `5`
- offline enqueue samples: `50`

## Results (p95)

- offline checkout (event enqueue): `0.20ms` (target `< 300ms`)
- online checkout API: `6.58ms` (target `p95 < 800ms`)
- sync API: `2.51ms` (target `p95 < 1.5s`)
- dashboard load: `688.40ms` (target `< 2s`)

All measured SLO targets passed in this run.

## Notes

- "Offline checkout" is measured as local offline event queue write latency (IndexedDB enqueue path), which is the critical offline operation in the current architecture.
- Raw benchmark output is written to `frontend/perf/latest-slo.json` on each run.
