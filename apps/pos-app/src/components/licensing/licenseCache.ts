import type { LicenseState, LicenseStatus } from "@/lib/api";

const CACHE_KEY = "smartpos-license-cache-v1";
const CACHE_VERSION = 2;
const CLOCK_ROLLBACK_TOLERANCE_MS = 5 * 60 * 1000;
const SERVER_DELTA_DRIFT_TOLERANCE_MS = 2 * 60 * 1000;
const SUSPENDED_BLOCKED_ACTIONS = ["checkout", "refund"];

type PersistedLicenseStatus = {
  state: LicenseState;
  shop_id?: string | null;
  terminal_id?: string;
  device_code: string;
  device_key_fingerprint?: string | null;
  subscription_status?: "trialing" | "active" | "past_due" | "canceled" | null;
  plan?: string | null;
  seat_limit?: number | null;
  active_seats?: number | null;
  valid_until?: string | null;
  grace_until?: string | null;
  offline_grant_token?: string | null;
  offline_grant_expires_at?: string | null;
  offline_max_checkout_operations?: number | null;
  offline_max_refund_operations?: number | null;
  blocked_actions: string[];
  server_time: string;
};

type CachedLicenseEnvelope = {
  version: number;
  mode: "aes-gcm" | "none";
  payload: string;
  iv?: string | null;
  terminal_id?: string;
  device_code: string;
  validated_server_time: string;
  validated_client_time: number;
  validated_server_delta_ms: number;
  last_client_seen_time: number;
};

export type CachedLicenseSnapshot = {
  status: LicenseStatus;
  warning: string | null;
  lastValidatedAtServer: Date;
  lastValidatedAtClient: Date;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function hasLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function hasWebCrypto() {
  return (
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  );
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof btoa === "function") {
    let binary = "";
    bytes.forEach((value) => {
      binary += String.fromCharCode(value);
    });
    return btoa(binary);
  }

  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string) {
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  return new Uint8Array(Buffer.from(value, "base64"));
}

function encodeUtf8ToBase64(value: string) {
  return bytesToBase64(textEncoder.encode(value));
}

function decodeUtf8FromBase64(value: string) {
  return textDecoder.decode(base64ToBytes(value));
}

async function deriveEncryptionKey(terminalId: string): Promise<CryptoKey | null> {
  if (!hasWebCrypto()) {
    return null;
  }

  try {
    const seed = textEncoder.encode(`smartpos-license-cache:${terminalId}`);
    const hash = await crypto.subtle.digest("SHA-256", seed);
    return await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

async function encryptPayload(payload: string, terminalId: string) {
  const key = await deriveEncryptionKey(terminalId);
  if (!key || !hasWebCrypto()) {
    return {
      mode: "none" as const,
      payload: encodeUtf8ToBase64(payload),
      iv: null,
    };
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(payload));

  return {
    mode: "aes-gcm" as const,
    payload: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

async function decryptPayload(envelope: CachedLicenseEnvelope): Promise<string | null> {
  try {
    if (envelope.mode === "none") {
      return decodeUtf8FromBase64(envelope.payload);
    }

    const key = await deriveEncryptionKey(envelope.terminal_id || envelope.device_code);
    if (!key || !envelope.iv) {
      return null;
    }

    const iv = base64ToBytes(envelope.iv);
    const ciphertext = base64ToBytes(envelope.payload);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return textDecoder.decode(plaintext);
  } catch {
    return null;
  }
}

function toPersistedStatus(status: LicenseStatus): PersistedLicenseStatus {
  return {
    state: status.state,
    shop_id: status.shopId ?? null,
    terminal_id: status.terminalId,
    device_code: status.deviceCode,
    device_key_fingerprint: status.deviceKeyFingerprint ?? null,
    subscription_status: status.subscriptionStatus ?? null,
    plan: status.plan ?? null,
    seat_limit: status.seatLimit ?? null,
    active_seats: status.activeSeats ?? null,
    valid_until: status.validUntil ? status.validUntil.toISOString() : null,
    grace_until: status.graceUntil ? status.graceUntil.toISOString() : null,
    offline_grant_token: status.offlineGrantToken ?? null,
    offline_grant_expires_at: status.offlineGrantExpiresAt ? status.offlineGrantExpiresAt.toISOString() : null,
    offline_max_checkout_operations: status.offlineMaxCheckoutOperations ?? null,
    offline_max_refund_operations: status.offlineMaxRefundOperations ?? null,
    blocked_actions: Array.isArray(status.blockedActions) ? status.blockedActions : [],
    server_time: status.serverTime.toISOString(),
  };
}

function fromPersistedStatus(payload: PersistedLicenseStatus): LicenseStatus {
  const terminalId = payload.terminal_id || payload.device_code;
  return {
    state: payload.state,
    shopId: payload.shop_id ?? null,
    terminalId,
    deviceCode: terminalId,
    deviceKeyFingerprint: payload.device_key_fingerprint ?? null,
    subscriptionStatus: payload.subscription_status ?? null,
    plan: payload.plan ?? null,
    seatLimit: payload.seat_limit ?? null,
    activeSeats: payload.active_seats ?? null,
    validUntil: payload.valid_until ? new Date(payload.valid_until) : null,
    graceUntil: payload.grace_until ? new Date(payload.grace_until) : null,
    licenseToken: null,
    offlineGrantToken: payload.offline_grant_token ?? null,
    offlineGrantExpiresAt: payload.offline_grant_expires_at ? new Date(payload.offline_grant_expires_at) : null,
    offlineMaxCheckoutOperations: payload.offline_max_checkout_operations ?? null,
    offlineMaxRefundOperations: payload.offline_max_refund_operations ?? null,
    blockedActions: payload.blocked_actions ?? [],
    serverTime: new Date(payload.server_time),
  };
}

function clampOfflineState(status: LicenseStatus, estimatedServerTime: Date): LicenseStatus {
  const next: LicenseStatus = {
    ...status,
    blockedActions: [...(status.blockedActions || [])],
    serverTime: estimatedServerTime,
  };

  if (next.state === "unprovisioned" || next.state === "revoked" || next.state === "suspended") {
    return next;
  }

  const currentTime = estimatedServerTime.getTime();
  const validUntil = next.validUntil?.getTime();
  const graceUntil = next.graceUntil?.getTime();

  if (validUntil && currentTime <= validUntil) {
    if (next.state !== "grace") {
      next.state = "active";
    }
    next.blockedActions = [];
    return next;
  }

  if (graceUntil && currentTime <= graceUntil) {
    next.state = "grace";
    next.blockedActions = [];
    return next;
  }

  next.state = "suspended";
  next.blockedActions = [...SUSPENDED_BLOCKED_ACTIONS];
  return next;
}

function createRollbackBlockedStatus(terminalId: string): LicenseStatus {
  return {
    state: "suspended",
    shopId: null,
    terminalId,
    deviceCode: terminalId,
    subscriptionStatus: null,
    plan: null,
    seatLimit: null,
    activeSeats: null,
    validUntil: null,
    graceUntil: null,
    licenseToken: null,
    offlineGrantToken: null,
    offlineGrantExpiresAt: null,
    offlineMaxCheckoutOperations: null,
    offlineMaxRefundOperations: null,
    blockedActions: [...SUSPENDED_BLOCKED_ACTIONS],
    serverTime: new Date(),
  };
}

export async function saveCachedLicenseStatus(status: LicenseStatus) {
  if (!hasLocalStorage()) {
    return;
  }

  const payload = JSON.stringify(toPersistedStatus(status));
  const resolvedTerminalId = status.terminalId || status.deviceCode;
  const encrypted = await encryptPayload(payload, resolvedTerminalId);
  const clientTime = Date.now();
  const envelope: CachedLicenseEnvelope = {
    version: CACHE_VERSION,
    mode: encrypted.mode,
    payload: encrypted.payload,
    iv: encrypted.iv,
    terminal_id: resolvedTerminalId,
    device_code: resolvedTerminalId,
    validated_server_time: status.serverTime.toISOString(),
    validated_client_time: clientTime,
    validated_server_delta_ms: status.serverTime.getTime() - clientTime,
    last_client_seen_time: clientTime,
  };

  localStorage.setItem(CACHE_KEY, JSON.stringify(envelope));
}

export async function loadCachedLicenseStatus(terminalId: string): Promise<CachedLicenseSnapshot | null> {
  if (!hasLocalStorage()) {
    return null;
  }

  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const envelope = JSON.parse(raw) as CachedLicenseEnvelope;
    if (!envelope || envelope.version !== CACHE_VERSION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    const now = Date.now();
    if (now + CLOCK_ROLLBACK_TOLERANCE_MS < envelope.last_client_seen_time) {
      localStorage.removeItem(CACHE_KEY);
      return {
        status: createRollbackBlockedStatus(terminalId),
        warning: "System clock moved backwards. Online license validation is required.",
        lastValidatedAtServer: new Date(envelope.validated_server_time),
        lastValidatedAtClient: new Date(envelope.validated_client_time),
      };
    }

    const decoded = await decryptPayload(envelope);
    if (!decoded) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    const persistedStatus = JSON.parse(decoded) as PersistedLicenseStatus;
    const cachedStatus = fromPersistedStatus(persistedStatus);

    const elapsedSinceValidation = Math.max(0, now - envelope.validated_client_time);
    const estimatedServerTime = new Date(
      new Date(envelope.validated_server_time).getTime() + elapsedSinceValidation
    );
    const expectedDeltaMs = envelope.validated_server_delta_ms;
    const observedDeltaMs = estimatedServerTime.getTime() - now;
    if (Math.abs(observedDeltaMs - expectedDeltaMs) > SERVER_DELTA_DRIFT_TOLERANCE_MS) {
      localStorage.removeItem(CACHE_KEY);
      return {
        status: createRollbackBlockedStatus(terminalId),
        warning: "System clock drift exceeded allowed tolerance. Online license validation is required.",
        lastValidatedAtServer: new Date(envelope.validated_server_time),
        lastValidatedAtClient: new Date(envelope.validated_client_time),
      };
    }

    let offlineStatus = clampOfflineState(cachedStatus, estimatedServerTime);
    let warning = `Using cached license (last validated ${new Date(envelope.validated_server_time).toLocaleString()}).`;
    if (offlineStatus.state === "active" || offlineStatus.state === "grace") {
      const grantExpiresAtMs = cachedStatus.offlineGrantExpiresAt?.getTime();
      if (!grantExpiresAtMs) {
        offlineStatus = {
          ...offlineStatus,
          state: "suspended",
          blockedActions: [...SUSPENDED_BLOCKED_ACTIONS],
          serverTime: estimatedServerTime,
        };
        warning = "Offline grant is missing. Online license validation is required.";
      } else if (estimatedServerTime.getTime() > grantExpiresAtMs) {
        offlineStatus = {
          ...offlineStatus,
          state: "suspended",
          blockedActions: [...SUSPENDED_BLOCKED_ACTIONS],
          serverTime: estimatedServerTime,
        };
        warning = "Offline grant expired. Online license validation is required.";
      }
    }

    const touchedEnvelope: CachedLicenseEnvelope = {
      ...envelope,
      last_client_seen_time: now,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(touchedEnvelope));

    return {
      status: offlineStatus,
      warning,
      lastValidatedAtServer: new Date(envelope.validated_server_time),
      lastValidatedAtClient: new Date(envelope.validated_client_time),
    };
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}
