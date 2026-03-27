import {
  bumpRetry,
  getPendingRetryableEvents,
  logSyncError,
  updateEventStatus,
} from './offlineSyncStore'
import { API_BASE_URL } from './apiBaseUrl'

const MAX_RETRY_DELAY_MS = 60000

function computeNextRetryAt(retryCount) {
  const delayMs = Math.min(2 ** retryCount * 1000, MAX_RETRY_DELAY_MS)
  return new Date(Date.now() + delayMs).toISOString()
}

async function handleBatchFailure(events, errorMessage) {
  const eventIds = []

  for (const event of events) {
    const nextRetryAt = computeNextRetryAt((event.retry_count ?? 0) + 1)
    await bumpRetry(event, errorMessage, nextRetryAt)
    eventIds.push(event.event_id)
  }

  await logSyncError({
    scope: 'sync_batch',
    error: errorMessage,
    event_ids: eventIds,
  })
}

export async function syncPendingEvents() {
  const retryableEvents = await getPendingRetryableEvents()

  if (retryableEvents.length === 0) {
    return { processed: 0, synced: 0, conflicted: 0, rejected: 0 }
  }

  const body = {
    events: retryableEvents.map((event) => ({
      event_id: event.event_id,
      store_id: event.store_id,
      device_id: event.device_id,
      device_timestamp: event.device_timestamp,
      type: event.type,
      payload: event.payload,
    })),
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}/api/sync/events`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'network_error'
    await handleBatchFailure(retryableEvents, errorMessage)
    return { processed: retryableEvents.length, synced: 0, conflicted: 0, rejected: 0 }
  }

  if (!response.ok) {
    const errorMessage = `sync_http_${response.status}`
    await handleBatchFailure(retryableEvents, errorMessage)
    return { processed: retryableEvents.length, synced: 0, conflicted: 0, rejected: 0 }
  }

  const result = await response.json()
  const results = result?.results ?? []

  let synced = 0
  let conflicted = 0
  let rejected = 0

  for (const eventResult of results) {
    const status = eventResult.status ?? 'rejected'

    if (status === 'synced') synced += 1
    if (status === 'conflict') conflicted += 1
    if (status === 'rejected') rejected += 1

    await updateEventStatus(eventResult.event_id, {
      status,
      server_timestamp: eventResult.server_timestamp ?? null,
      message: eventResult.message ?? null,
      next_retry_at: null,
    })
  }

  return {
    processed: retryableEvents.length,
    synced,
    conflicted,
    rejected,
  }
}
