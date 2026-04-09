import { ApiError, mapOfflineSyncEventMessage, syncOfflineEvents, type SyncEventRequestItem, type SyncEventType } from "@/lib/api";

const OFFLINE_SYNC_DB_NAME = "smartpos-offline-sync";
const OFFLINE_SYNC_DB_VERSION = 1;
const OFFLINE_SYNC_EVENTS_STORE = "events";
const OFFLINE_SYNC_RETRY_BASE_DELAY_MS = 10_000;
const OFFLINE_SYNC_RETRY_MAX_DELAY_MS = 15 * 60 * 1000;

export type OfflineSyncQueueStatus = "pending" | "synced" | "conflict" | "rejected";

export type OfflineSyncQueueEvent = {
  event_id: string;
  store_id?: string | null;
  device_id?: string | null;
  device_timestamp: string;
  type: SyncEventType;
  payload: Record<string, unknown>;
  status: OfflineSyncQueueStatus;
  created_at: string;
  updated_at: string;
  server_timestamp?: string | null;
  message?: string | null;
  retry_count: number;
  next_retry_at?: string | null;
};

export type EnqueueOfflineSyncEventInput = {
  eventId?: string;
  storeId?: string | null;
  deviceId?: string | null;
  deviceTimestamp?: Date | string;
  type: SyncEventType;
  payload: Record<string, unknown>;
};

export type OfflineSyncQueueSummary = {
  total: number;
  pending: number;
  retrying: number;
  synced: number;
  conflict: number;
  rejected: number;
};

export type FlushOfflineSyncQueueOptions = {
  batchSize?: number;
  deviceId?: string | null;
  offlineGrantToken?: string | null;
};

export type FlushOfflineSyncQueueResult = {
  attempted: number;
  synced: number;
  conflicts: number;
  rejected: number;
  retried: number;
  pending: number;
  rejectionMessages: string[];
  failureMessage?: string | null;
};

function hasIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function generateEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toIsoString(value?: Date | string) {
  if (!value) {
    return new Date().toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed."));
    };
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function ensureEventsStore(db: IDBDatabase, transaction: IDBTransaction | null) {
  let store: IDBObjectStore;
  if (!db.objectStoreNames.contains(OFFLINE_SYNC_EVENTS_STORE)) {
    store = db.createObjectStore(OFFLINE_SYNC_EVENTS_STORE, { keyPath: "event_id" });
  } else {
    if (!transaction) {
      return;
    }

    store = transaction.objectStore(OFFLINE_SYNC_EVENTS_STORE);
  }

  if (!store.indexNames.contains("status")) {
    store.createIndex("status", "status", { unique: false });
  }

  if (!store.indexNames.contains("next_retry_at")) {
    store.createIndex("next_retry_at", "next_retry_at", { unique: false });
  }

  if (!store.indexNames.contains("device_timestamp")) {
    store.createIndex("device_timestamp", "device_timestamp", { unique: false });
  }
}

async function openOfflineSyncDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    throw new Error("IndexedDB is not available in this environment.");
  }

  return await new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_SYNC_DB_NAME, OFFLINE_SYNC_DB_VERSION);

    request.onupgradeneeded = () => {
      ensureEventsStore(request.result, request.transaction);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline sync database."));
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>
): Promise<T> {
  const db = await openOfflineSyncDb();

  try {
    const transaction = db.transaction(OFFLINE_SYNC_EVENTS_STORE, mode);
    const store = transaction.objectStore(OFFLINE_SYNC_EVENTS_STORE);
    const result = await handler(store);
    await transactionToPromise(transaction);
    return result;
  } finally {
    db.close();
  }
}

function mapEventToSyncRequest(event: OfflineSyncQueueEvent): SyncEventRequestItem {
  return {
    eventId: event.event_id,
    storeId: event.store_id ?? null,
    deviceId: event.device_id ?? null,
    deviceTimestamp: event.device_timestamp,
    type: event.type,
    payload: event.payload ?? {},
  };
}

async function readPendingDueEvents(limit = 50): Promise<OfflineSyncQueueEvent[]> {
  const nowMs = Date.now();

  return runTransaction("readonly", async (store) => {
    const index = store.index("status");
    const records = await new Promise<OfflineSyncQueueEvent[]>((resolve, reject) => {
      const items: OfflineSyncQueueEvent[] = [];
      const cursorRequest = index.openCursor(IDBKeyRange.only("pending"));

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve(items);
          return;
        }

        const item = cursor.value as OfflineSyncQueueEvent;
        const nextRetryAtMs = item.next_retry_at ? new Date(item.next_retry_at).getTime() : null;
        const isDue = nextRetryAtMs === null || Number.isNaN(nextRetryAtMs) || nextRetryAtMs <= nowMs;
        if (isDue) {
          items.push(item);
        }

        cursor.continue();
      };

      cursorRequest.onerror = () => {
        reject(cursorRequest.error ?? new Error("Unable to read pending offline sync events."));
      };
    });

    return records
      .sort((left, right) => {
        const leftTime = new Date(left.device_timestamp).getTime();
        const rightTime = new Date(right.device_timestamp).getTime();
        return leftTime - rightTime;
      })
      .slice(0, Math.max(1, limit));
  });
}

async function putEvents(records: OfflineSyncQueueEvent[]) {
  if (records.length === 0) {
    return;
  }

  await runTransaction("readwrite", async (store) => {
    for (const record of records) {
      await requestToPromise(store.put(record));
    }

    return undefined;
  });
}

export function computeOfflineSyncRetryDelayMs(retryCount: number) {
  const normalizedRetryCount = Math.max(1, Math.floor(retryCount));
  const exponent = Math.min(10, normalizedRetryCount - 1);
  const nextDelay = OFFLINE_SYNC_RETRY_BASE_DELAY_MS * Math.pow(2, exponent);
  return Math.min(OFFLINE_SYNC_RETRY_MAX_DELAY_MS, nextDelay);
}

function shouldRetryAfterRequestError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return true;
  }

  if (error.status >= 500) {
    return true;
  }

  return error.status === 401 ||
    error.status === 403 ||
    error.status === 404 ||
    error.status === 408 ||
    error.status === 409 ||
    error.status === 429;
}

function buildRetrySnapshot(record: OfflineSyncQueueEvent, nowIso: string): OfflineSyncQueueEvent {
  const nextRetryCount = Math.max(0, record.retry_count) + 1;
  const delayMs = computeOfflineSyncRetryDelayMs(nextRetryCount);

  return {
    ...record,
    status: "pending",
    retry_count: nextRetryCount,
    next_retry_at: new Date(Date.now() + delayMs).toISOString(),
    updated_at: nowIso,
  };
}

export async function enqueueOfflineSyncEvent(input: EnqueueOfflineSyncEventInput) {
  if (!hasIndexedDb()) {
    throw new Error("Offline sync queue requires IndexedDB support.");
  }

  const nowIso = new Date().toISOString();
  const record: OfflineSyncQueueEvent = {
    event_id: normalizeOptionalString(input.eventId) ?? generateEventId(),
    store_id: input.storeId ?? null,
    device_id: input.deviceId ?? null,
    device_timestamp: toIsoString(input.deviceTimestamp),
    type: input.type,
    payload: input.payload ?? {},
    status: "pending",
    created_at: nowIso,
    updated_at: nowIso,
    server_timestamp: null,
    message: null,
    retry_count: 0,
    next_retry_at: null,
  };

  await runTransaction("readwrite", async (store) => {
    await requestToPromise(store.put(record));
    return undefined;
  });

  return record;
}

export async function getOfflineSyncQueueSummary(): Promise<OfflineSyncQueueSummary> {
  if (!hasIndexedDb()) {
    return {
      total: 0,
      pending: 0,
      retrying: 0,
      synced: 0,
      conflict: 0,
      rejected: 0,
    };
  }

  const nowMs = Date.now();

  return runTransaction("readonly", async (store) => {
    return await new Promise<OfflineSyncQueueSummary>((resolve, reject) => {
      const summary: OfflineSyncQueueSummary = {
        total: 0,
        pending: 0,
        retrying: 0,
        synced: 0,
        conflict: 0,
        rejected: 0,
      };

      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve(summary);
          return;
        }

        const item = cursor.value as OfflineSyncQueueEvent;
        summary.total += 1;

        if (item.status === "pending") {
          summary.pending += 1;
          if (item.next_retry_at) {
            const retryAtMs = new Date(item.next_retry_at).getTime();
            if (!Number.isNaN(retryAtMs) && retryAtMs > nowMs) {
              summary.retrying += 1;
            }
          }
        } else if (item.status === "synced") {
          summary.synced += 1;
        } else if (item.status === "conflict") {
          summary.conflict += 1;
        } else {
          summary.rejected += 1;
        }

        cursor.continue();
      };

      cursorRequest.onerror = () => {
        reject(cursorRequest.error ?? new Error("Unable to read offline sync queue summary."));
      };
    });
  });
}

export async function listOfflineSyncQueueEvents(limit = 200) {
  if (!hasIndexedDb()) {
    return [] as OfflineSyncQueueEvent[];
  }

  return runTransaction("readonly", async (store) => {
    const records = await new Promise<OfflineSyncQueueEvent[]>((resolve, reject) => {
      const items: OfflineSyncQueueEvent[] = [];
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve(items);
          return;
        }

        items.push(cursor.value as OfflineSyncQueueEvent);
        cursor.continue();
      };

      cursorRequest.onerror = () => {
        reject(cursorRequest.error ?? new Error("Unable to list offline sync queue events."));
      };
    });

    return records
      .sort((left, right) => {
        const leftTime = new Date(left.created_at).getTime();
        const rightTime = new Date(right.created_at).getTime();
        return rightTime - leftTime;
      })
      .slice(0, Math.max(1, limit));
  });
}

export async function flushOfflineSyncQueue(
  options: FlushOfflineSyncQueueOptions = {}
): Promise<FlushOfflineSyncQueueResult> {
  if (!hasIndexedDb()) {
    return {
      attempted: 0,
      synced: 0,
      conflicts: 0,
      rejected: 0,
      retried: 0,
      pending: 0,
      rejectionMessages: [],
      failureMessage: "Offline sync is unavailable in this browser.",
    };
  }

  const pendingEvents = await readPendingDueEvents(options.batchSize ?? 50);
  if (pendingEvents.length === 0) {
    const summary = await getOfflineSyncQueueSummary();
    return {
      attempted: 0,
      synced: 0,
      conflicts: 0,
      rejected: 0,
      retried: 0,
      pending: summary.pending,
      rejectionMessages: [],
      failureMessage: null,
    };
  }

  try {
    const response = await syncOfflineEvents(
      pendingEvents.map(mapEventToSyncRequest),
      {
        deviceId: options.deviceId ?? null,
        offlineGrantToken: options.offlineGrantToken ?? null,
      }
    );

    const resultByEventId = new Map(response.results.map((item) => [item.eventId.toUpperCase(), item]));
    const nowIso = new Date().toISOString();
    const rejectionMessages = new Set<string>();

    let synced = 0;
    let conflicts = 0;
    let rejected = 0;
    let retried = 0;

    const updatedRecords = pendingEvents.map((record) => {
      const key = record.event_id.toUpperCase();
      const result = resultByEventId.get(key);

      if (!result) {
        retried += 1;
        return buildRetrySnapshot(record, nowIso);
      }

      if (result.status === "synced") {
        synced += 1;
        return {
          ...record,
          status: "synced" as const,
          server_timestamp: result.serverTimestamp ? result.serverTimestamp.toISOString() : record.server_timestamp ?? null,
          message: normalizeOptionalString(result.message),
          next_retry_at: null,
          updated_at: nowIso,
        };
      }

      if (result.status === "conflict") {
        conflicts += 1;
        return {
          ...record,
          status: "conflict" as const,
          server_timestamp: result.serverTimestamp ? result.serverTimestamp.toISOString() : record.server_timestamp ?? null,
          message: normalizeOptionalString(result.message),
          next_retry_at: null,
          updated_at: nowIso,
        };
      }

      if (result.status === "rejected") {
        rejected += 1;
        const message = normalizeOptionalString(result.message);
        const displayMessage = result.displayMessage ?? mapOfflineSyncEventMessage(message);
        if (displayMessage) {
          rejectionMessages.add(displayMessage);
        }

        return {
          ...record,
          status: "rejected" as const,
          server_timestamp: result.serverTimestamp ? result.serverTimestamp.toISOString() : record.server_timestamp ?? null,
          message,
          next_retry_at: null,
          updated_at: nowIso,
        };
      }

      retried += 1;
      return buildRetrySnapshot(record, nowIso);
    });

    await putEvents(updatedRecords);
    const summary = await getOfflineSyncQueueSummary();

    return {
      attempted: pendingEvents.length,
      synced,
      conflicts,
      rejected,
      retried,
      pending: summary.pending,
      rejectionMessages: Array.from(rejectionMessages),
      failureMessage: null,
    };
  } catch (error) {
    const retryable = shouldRetryAfterRequestError(error);
    const nowIso = new Date().toISOString();
    const fallbackMessage = error instanceof Error ? error.message : "Offline sync failed.";

    let updatedRecords: OfflineSyncQueueEvent[];
    if (retryable) {
      updatedRecords = pendingEvents.map((record) => buildRetrySnapshot(record, nowIso));
    } else {
      updatedRecords = pendingEvents.map((record) => ({
        ...record,
        status: "rejected" as const,
        updated_at: nowIso,
        next_retry_at: null,
        message: normalizeOptionalString(fallbackMessage) ?? "sync_request_invalid",
      }));
    }

    await putEvents(updatedRecords);
    const summary = await getOfflineSyncQueueSummary();

    return {
      attempted: pendingEvents.length,
      synced: 0,
      conflicts: 0,
      rejected: retryable ? 0 : pendingEvents.length,
      retried: retryable ? pendingEvents.length : 0,
      pending: summary.pending,
      rejectionMessages: retryable ? [] : [fallbackMessage],
      failureMessage: fallbackMessage,
    };
  }
}
