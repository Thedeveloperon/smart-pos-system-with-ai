const DEVICE_IDENTITY_DB = "smartpos-device-identity";
const DEVICE_IDENTITY_STORE = "identity";
const DEVICE_IDENTITY_RECORD_KEY = "primary";
const DEVICE_KEY_ALGORITHM = "ECDSA_P256_SHA256";
const textEncoder = new TextEncoder();

type StoredDeviceIdentity = {
  id: string;
  keyPair: CryptoKeyPair;
  publicKeySpki: string;
  keyFingerprint: string;
  keyAlgorithm: string;
  createdAt: number;
};

export type DeviceActivationProof = {
  keyFingerprint: string;
  publicKeySpki: string;
  keyAlgorithm: string;
  challengeId: string;
  challengeSignature: string;
};

export type DeviceRequestProof = {
  keyFingerprint: string;
  signature: string;
};

let cachedIdentityPromise: Promise<StoredDeviceIdentity | null> | null = null;

function supportsSecureIdentity() {
  return (
    typeof window !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined" &&
    typeof indexedDB !== "undefined"
  );
}

function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function openIdentityDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEVICE_IDENTITY_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEVICE_IDENTITY_STORE)) {
        db.createObjectStore(DEVICE_IDENTITY_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open identity database."));
  });
}

async function loadStoredIdentity(): Promise<StoredDeviceIdentity | null> {
  const db = await openIdentityDb();
  return await new Promise<StoredDeviceIdentity | null>((resolve, reject) => {
    const transaction = db.transaction(DEVICE_IDENTITY_STORE, "readonly");
    const store = transaction.objectStore(DEVICE_IDENTITY_STORE);
    const request = store.get(DEVICE_IDENTITY_RECORD_KEY);

    request.onsuccess = () => {
      const value = request.result as StoredDeviceIdentity | undefined;
      if (!value || !value.keyPair?.privateKey || !value.keyPair?.publicKey) {
        resolve(null);
        return;
      }

      resolve(value);
    };
    request.onerror = () => reject(request.error || new Error("Failed to read identity record."));
  });
}

async function saveStoredIdentity(identity: StoredDeviceIdentity) {
  const db = await openIdentityDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DEVICE_IDENTITY_STORE, "readwrite");
    const store = transaction.objectStore(DEVICE_IDENTITY_STORE);
    const request = store.put(identity);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Failed to persist identity record."));
  });
}

async function createIdentity(): Promise<StoredDeviceIdentity> {
  const keyPair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"]
  )) as CryptoKeyPair;

  const publicKeySpkiBytes = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  const publicKeySpki = bufferToBase64Url(publicKeySpkiBytes);
  const keyFingerprint = await sha256Hex(publicKeySpkiBytes);

  return {
    id: DEVICE_IDENTITY_RECORD_KEY,
    keyPair,
    publicKeySpki,
    keyFingerprint,
    keyAlgorithm: DEVICE_KEY_ALGORITHM,
    createdAt: Date.now(),
  };
}

async function getOrCreateIdentity(): Promise<StoredDeviceIdentity | null> {
  if (!supportsSecureIdentity()) {
    return null;
  }

  if (!cachedIdentityPromise) {
    cachedIdentityPromise = (async () => {
      try {
        const existing = await loadStoredIdentity();
        if (existing) {
          return existing;
        }

        const created = await createIdentity();
        try {
          await saveStoredIdentity(created);
        } catch {
          // Keep in-memory identity for this session if persistence is unavailable.
        }

        return created;
      } catch {
        return null;
      }
    })();
  }

  return await cachedIdentityPromise;
}

function buildActivationChallengePayload(challengeId: string, nonce: string, deviceCode: string) {
  const normalizedChallengeId = challengeId.replace(/-/g, "").trim().toLowerCase();
  const normalizedDeviceCode = deviceCode.trim();
  return `smartpos.provision.activate|${normalizedChallengeId}|${nonce}|${normalizedDeviceCode}`;
}

function buildRequestProofPayload(
  nonceId: string,
  nonce: string,
  deviceCode: string,
  timestampUnix: number,
  method: string,
  pathAndQuery: string,
  bodyHash: string
) {
  const normalizedNonceId = nonceId.replace(/-/g, "").trim().toLowerCase();
  const normalizedDeviceCode = deviceCode.trim();
  const normalizedPath = (pathAndQuery || "/").trim() || "/";
  return `smartpos.api.request|${normalizedNonceId}|${nonce}|${normalizedDeviceCode}|${timestampUnix}|${method.toUpperCase()}|${normalizedPath}|${bodyHash.toLowerCase()}`;
}

export async function buildDeviceActivationProof(
  challengeId: string,
  nonce: string,
  deviceCode: string
): Promise<DeviceActivationProof | null> {
  const identity = await getOrCreateIdentity();
  if (!identity) {
    return null;
  }

  const payload = buildActivationChallengePayload(challengeId, nonce, deviceCode);
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    identity.keyPair.privateKey,
    textEncoder.encode(payload)
  );

  return {
    keyFingerprint: identity.keyFingerprint,
    publicKeySpki: identity.publicKeySpki,
    keyAlgorithm: identity.keyAlgorithm,
    challengeId,
    challengeSignature: bufferToBase64Url(signatureBuffer),
  };
}

export async function buildDeviceRequestProof(input: {
  nonceId: string;
  nonce: string;
  deviceCode: string;
  timestampUnix: number;
  method: string;
  pathAndQuery: string;
  bodyHash: string;
}): Promise<DeviceRequestProof | null> {
  const identity = await getOrCreateIdentity();
  if (!identity) {
    return null;
  }

  const payload = buildRequestProofPayload(
    input.nonceId,
    input.nonce,
    input.deviceCode,
    input.timestampUnix,
    input.method,
    input.pathAndQuery,
    input.bodyHash
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    identity.keyPair.privateKey,
    textEncoder.encode(payload)
  );

  return {
    keyFingerprint: identity.keyFingerprint,
    signature: bufferToBase64Url(signatureBuffer),
  };
}
