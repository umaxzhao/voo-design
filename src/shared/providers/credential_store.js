/**
 * Pluggable credential storage for API providers with Electron safeStorage
 * encryption, localStorage persistence across restarts, and readback verification.
 *
 * Supported environments:
 * - Chrome extension: service worker using chrome.storage
 * - Electron desktop: localStorage with OS-level safeStorage encryption via preload/IPC
 * - Standard web / standalone: localStorage / sessionStorage fallback
 */

let areaFactory = (name) => globalThis.chrome?.storage?.[name] ?? null;
let customBridge = null;

// Fallback in-memory map for headless environments without web storage
const fallbackMemory = {
  local: new Map(),
  session: new Map(),
};

/**
 * Replaces the storage area factory.
 * @param {(name: string) => object | null} next
 */
export function setCredentialAreaFactory(next) {
  areaFactory = next ?? ((name) => globalThis.chrome?.storage?.[name] ?? null);
}

/**
 * Configures or overrides the safeStorage bridge.
 * @param {{ isAvailable: () => Promise<boolean> | boolean, encryptString: (t: string) => Promise<string>, decryptString: (t: string) => Promise<string> } | null} bridge
 */
export function setSafeStorageBridge(bridge) {
  customBridge = bridge;
}

/**
 * Resolves the active safeStorage bridge from overrides or window/electron context.
 */
export function getSafeStorageBridge() {
  if (customBridge !== null) {
    return customBridge;
  }
  return (
    globalThis.electronAPI?.safeStorage ??
    globalThis.vooDesktop?.safeStorage ??
    globalThis.safeStorage ??
    null
  );
}

/**
 * Resolves storage backing for the named area.
 */
function resolveStorage(name) {
  try {
    if (name === "session") {
      if (typeof globalThis.sessionStorage !== "undefined" && globalThis.sessionStorage !== null) {
        return globalThis.sessionStorage;
      }
    }
    if (typeof globalThis.localStorage !== "undefined" && globalThis.localStorage !== null) {
      return globalThis.localStorage;
    }
  } catch {
    // Access to storage can throw in restricted sandboxes
  }

  // Memory fallback if browser storage is unavailable
  const memory = fallbackMemory[name] ?? fallbackMemory.local;
  return {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, val) {
      memory.set(key, String(val));
    },
    removeItem(key) {
      memory.delete(key);
    },
    clear() {
      memory.clear();
    },
  };
}

/**
 * Serializes and optionally encrypts a credential payload.
 */
async function serializeCredential(value, bridge) {
  const json = JSON.stringify(value);
  if (bridge && typeof bridge.isAvailable === "function") {
    try {
      const isAvailable = await bridge.isAvailable();
      if (isAvailable && typeof bridge.encryptString === "function") {
        const encryptedBase64 = await bridge.encryptString(json);
        return JSON.stringify({ __voo_encrypted: true, data: encryptedBase64 });
      }
    } catch {
      // Fall back to unencrypted JSON if safeStorage encryption fails
    }
  }
  return json;
}

/**
 * Deserializes and optionally decrypts a raw credential string.
 */
async function deserializeCredential(raw, bridge) {
  if (raw === null || raw === undefined) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    parsed.__voo_encrypted === true &&
    typeof parsed.data === "string"
  ) {
    if (bridge && typeof bridge.decryptString === "function") {
      try {
        const decryptedJson = await bridge.decryptString(parsed.data);
        return JSON.parse(decryptedJson);
      } catch {
        throw new Error("Failed to decrypt stored credential payload");
      }
    }
    return undefined;
  }
  return parsed;
}

/**
 * The named credential area, providing chrome.storage-like interface with
 * persistence, safeStorage encryption, and readback verification.
 *
 * @param {"local" | "session"} name
 */
export function credentialArea(name) {
  const area = areaFactory(name);
  if (area) return area;

  const storage = resolveStorage(name);
  if (!storage) return null;

  return {
    async get(key) {
      const bridge = getSafeStorageBridge();
      if (Array.isArray(key)) {
        const result = {};
        for (const k of key) {
          const raw = storage.getItem(k);
          result[k] = await deserializeCredential(raw, bridge);
        }
        return result;
      }
      if (typeof key === "string") {
        const raw = storage.getItem(key);
        return { [key]: await deserializeCredential(raw, bridge) };
      }
      if (key && typeof key === "object") {
        const result = {};
        for (const [k, fallback] of Object.entries(key)) {
          const raw = storage.getItem(k);
          const val = await deserializeCredential(raw, bridge);
          result[k] = val !== undefined ? val : fallback;
        }
        return result;
      }
      return {};
    },

    async set(values) {
      if (!values || typeof values !== "object") return;
      const bridge = getSafeStorageBridge();

      for (const [key, value] of Object.entries(values)) {
        const serialized = await serializeCredential(value, bridge);
        storage.setItem(key, serialized);

        // Readback verification: immediately read back and verify the written value
        const readBackRaw = storage.getItem(key);
        if (readBackRaw === null || readBackRaw === undefined) {
          const error = new Error(`Storage readback verification failed: key "${key}" not stored`);
          error.code = "providerStorageUnavailable";
          throw error;
        }

        const verified = await deserializeCredential(readBackRaw, bridge);
        if (JSON.stringify(verified) !== JSON.stringify(value)) {
          const error = new Error(`Storage readback verification failed: value mismatch for key "${key}"`);
          error.code = "providerStorageUnavailable";
          throw error;
        }
      }
    },

    async remove(key) {
      const keys = Array.isArray(key) ? key : [key];
      for (const k of keys) {
        storage.removeItem(k);
      }
    },
  };
}
