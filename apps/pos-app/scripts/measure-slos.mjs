import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { chromium } from '@playwright/test'

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:5080'
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://127.0.0.1:5173'

const CHECKOUT_SAMPLES = Number(process.env.CHECKOUT_SAMPLES ?? '30')
const SYNC_SAMPLES = Number(process.env.SYNC_SAMPLES ?? '30')
const DASHBOARD_SAMPLES = Number(process.env.DASHBOARD_SAMPLES ?? '5')
const OFFLINE_ENQUEUE_SAMPLES = Number(process.env.OFFLINE_ENQUEUE_SAMPLES ?? '50')

const THRESHOLDS = {
  offline_checkout_ms: 300,
  online_checkout_p95_ms: 800,
  sync_api_p95_ms: 1500,
  dashboard_load_ms: 2000,
}

async function main() {
  const productId = await getFirstProductId()

  const checkoutLatenciesMs = await measureCheckoutP95(productId)
  const syncLatenciesMs = await measureSyncP95(productId)
  const dashboardLoadMs = await measureDashboardLoad()
  const offlineEnqueueLatenciesMs = await measureOfflineEnqueueLatency()

  const results = {
    generated_at: new Date().toISOString(),
    config: {
      api_base_url: API_BASE_URL,
      app_base_url: APP_BASE_URL,
      checkout_samples: CHECKOUT_SAMPLES,
      sync_samples: SYNC_SAMPLES,
      dashboard_samples: DASHBOARD_SAMPLES,
      offline_enqueue_samples: OFFLINE_ENQUEUE_SAMPLES,
    },
    thresholds: THRESHOLDS,
    measurements: {
      offline_checkout_ms: round(percentile(offlineEnqueueLatenciesMs, 95)),
      online_checkout_p95_ms: round(percentile(checkoutLatenciesMs, 95)),
      sync_api_p95_ms: round(percentile(syncLatenciesMs, 95)),
      dashboard_load_ms: round(percentile(dashboardLoadMs, 95)),
    },
  }

  results.pass = {
    offline_checkout_ms:
      results.measurements.offline_checkout_ms <= THRESHOLDS.offline_checkout_ms,
    online_checkout_p95_ms:
      results.measurements.online_checkout_p95_ms <= THRESHOLDS.online_checkout_p95_ms,
    sync_api_p95_ms:
      results.measurements.sync_api_p95_ms <= THRESHOLDS.sync_api_p95_ms,
    dashboard_load_ms:
      results.measurements.dashboard_load_ms <= THRESHOLDS.dashboard_load_ms,
  }

  const outputDir = path.resolve('perf')
  await mkdir(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'latest-slo.json')
  await writeFile(outputPath, JSON.stringify(results, null, 2))

  console.log(JSON.stringify(results, null, 2))
  console.log(`\nSaved report: ${outputPath}`)
}

async function getFirstProductId() {
  const data = await requestJson('/api/products/search')
  const first = data?.items?.[0]
  if (!first?.id) {
    throw new Error('No active products found to run performance tests.')
  }
  return first.id
}

async function measureCheckoutP95(productId) {
  const latencies = []

  for (let i = 0; i < CHECKOUT_SAMPLES; i += 1) {
    const payload = {
      sale_id: null,
      items: [{ product_id: productId, quantity: 1 }],
      discount_percent: 0,
      role: 'cashier',
      payments: [{ method: 'cash', amount: 1000, reference_number: null }],
    }

    const started = performance.now()
    await requestJson('/api/checkout/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    latencies.push(performance.now() - started)
  }

  return latencies
}

async function measureSyncP95(productId) {
  const latencies = []

  for (let i = 0; i < SYNC_SAMPLES; i += 1) {
    const payload = {
      device_id: crypto.randomUUID(),
      events: [
        {
          event_id: crypto.randomUUID(),
          store_id: null,
          device_id: null,
          device_timestamp: new Date().toISOString(),
          type: 'stock_update',
          payload: {
            product_id: productId,
            delta_quantity: 1,
          },
        },
      ],
    }

    const started = performance.now()
    await requestJson('/api/sync/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    latencies.push(performance.now() - started)
  }

  return latencies
}

async function measureDashboardLoad() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const latencies = []

  try {
    for (let i = 0; i < DASHBOARD_SAMPLES; i += 1) {
      const page = await context.newPage()
      const started = performance.now()
      await page.goto(APP_BASE_URL, { waitUntil: 'networkidle' })
      latencies.push(performance.now() - started)
      await page.close()
    }
  } finally {
    await context.close()
    await browser.close()
  }

  return latencies
}

async function measureOfflineEnqueueLatency() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto(APP_BASE_URL, { waitUntil: 'domcontentloaded' })

    const durations = await page.evaluate(async (samples) => {
      const DB_NAME = 'smartpos-offline-sync'
      const DB_VERSION = 1
      const EVENTS_STORE = 'events'

      function openDb() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, DB_VERSION)
          request.onerror = () => reject(request.error)
          request.onsuccess = () => resolve(request.result)
          request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains(EVENTS_STORE)) {
              const eventsStore = db.createObjectStore(EVENTS_STORE, {
                keyPath: 'event_id',
              })
              eventsStore.createIndex('status', 'status')
              eventsStore.createIndex('next_retry_at', 'next_retry_at')
              eventsStore.createIndex('device_timestamp', 'device_timestamp')
            }
          }
        })
      }

      function putEvent(db, record) {
        return new Promise((resolve, reject) => {
          const tx = db.transaction(EVENTS_STORE, 'readwrite')
          const store = tx.objectStore(EVENTS_STORE)
          store.put(record)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
          tx.onabort = () => reject(tx.error)
        })
      }

      const db = await openDb()
      const times = []

      for (let i = 0; i < samples; i += 1) {
        const now = new Date().toISOString()
        const eventRecord = {
          event_id: crypto.randomUUID(),
          store_id: null,
          device_id: null,
          device_timestamp: now,
          type: 'sale',
          payload: {
            sale_number: `OFF-${i}`,
            total: 1000,
          },
          status: 'pending',
          created_at: now,
          updated_at: now,
          server_timestamp: null,
          message: null,
          retry_count: 0,
          next_retry_at: null,
        }

        const started = performance.now()
        await putEvent(db, eventRecord)
        times.push(performance.now() - started)
      }

      db.close()
      return times
    }, OFFLINE_ENQUEUE_SAMPLES)

    return durations
  } finally {
    await context.close()
    await browser.close()
  }
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  })

  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(
      body?.message ??
        `HTTP ${response.status} ${response.statusText} for ${options.method ?? 'GET'} ${pathname}`,
    )
  }
  return body
}

function percentile(values, p) {
  if (!values.length) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length) - 1
  const index = Math.min(sorted.length - 1, Math.max(0, rank))
  return sorted[index]
}

function round(value) {
  return Math.round(value * 100) / 100
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
