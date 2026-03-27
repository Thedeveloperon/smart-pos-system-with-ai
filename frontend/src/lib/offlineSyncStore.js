const DB_NAME = 'smartpos-offline-sync'
const DB_VERSION = 1
const EVENTS_STORE = 'events'
const ERRORS_STORE = 'sync_errors'

const STATUS_LIST = ['pending', 'synced', 'conflict', 'rejected']

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

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

      if (!db.objectStoreNames.contains(ERRORS_STORE)) {
        const errorsStore = db.createObjectStore(ERRORS_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        })
        errorsStore.createIndex('created_at', 'created_at')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function txComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function getRequestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function createQueuedEvent({ type, payload, deviceId, storeId = null }) {
  const timestamp = new Date().toISOString()
  return {
    event_id: crypto.randomUUID(),
    store_id: storeId,
    device_id: deviceId,
    device_timestamp: timestamp,
    type,
    payload,
    status: 'pending',
    retry_count: 0,
    next_retry_at: null,
    server_timestamp: null,
    message: null,
    created_at: timestamp,
    updated_at: timestamp,
  }
}

export async function enqueueEvent(eventRecord) {
  const db = await openDatabase()
  const transaction = db.transaction(EVENTS_STORE, 'readwrite')
  const store = transaction.objectStore(EVENTS_STORE)
  store.put(eventRecord)
  await txComplete(transaction)
}

export async function getAllEvents() {
  const db = await openDatabase()
  const transaction = db.transaction(EVENTS_STORE, 'readonly')
  const store = transaction.objectStore(EVENTS_STORE)
  const request = store.getAll()
  const events = await getRequestResult(request)
  await txComplete(transaction)
  return events.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function getPendingRetryableEvents(limit = 100) {
  const now = new Date()
  const allEvents = await getAllEvents()
  const retryableEvents = allEvents.filter((event) => {
    if (event.status !== 'pending') {
      return false
    }

    if (!event.next_retry_at) {
      return true
    }

    return new Date(event.next_retry_at) <= now
  })
  return retryableEvents.slice(0, limit)
}

export async function updateEventStatus(eventId, patch) {
  const db = await openDatabase()
  const transaction = db.transaction(EVENTS_STORE, 'readwrite')
  const store = transaction.objectStore(EVENTS_STORE)
  const current = await getRequestResult(store.get(eventId))

  if (!current) {
    await txComplete(transaction)
    return
  }

  const updated = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  }

  store.put(updated)
  await txComplete(transaction)
}

export async function bumpRetry(event, errorMessage, nextRetryAt) {
  await updateEventStatus(event.event_id, {
    status: 'pending',
    retry_count: (event.retry_count ?? 0) + 1,
    message: errorMessage,
    next_retry_at: nextRetryAt,
  })
}

export async function logSyncError(errorEntry) {
  const db = await openDatabase()
  const transaction = db.transaction(ERRORS_STORE, 'readwrite')
  const store = transaction.objectStore(ERRORS_STORE)
  store.add({
    ...errorEntry,
    created_at: new Date().toISOString(),
  })
  await txComplete(transaction)
}

export async function getSyncErrors() {
  const db = await openDatabase()
  const transaction = db.transaction(ERRORS_STORE, 'readonly')
  const store = transaction.objectStore(ERRORS_STORE)
  const request = store.getAll()
  const errors = await getRequestResult(request)
  await txComplete(transaction)
  return errors.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function clearSyncErrors() {
  const db = await openDatabase()
  const transaction = db.transaction(ERRORS_STORE, 'readwrite')
  const store = transaction.objectStore(ERRORS_STORE)
  store.clear()
  await txComplete(transaction)
}

export function buildStatusCounts(events) {
  const initialCounts = {
    total: events.length,
  }

  STATUS_LIST.forEach((status) => {
    initialCounts[status] = 0
  })

  for (const event of events) {
    if (!STATUS_LIST.includes(event.status)) {
      continue
    }

    initialCounts[event.status] += 1
  }

  return initialCounts
}
