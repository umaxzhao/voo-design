/**
 * Real detection and state resolution for the Chrome web image extension.
 *
 * Distinguishes finely between:
 * - READY: Extension is connected, operational, and supports the generation protocol.
 * - MISSING: Extension has never been detected or installed.
 * - UNREACHABLE: Extension was previously detected/installed, but is currently not responding
 *   (e.g. Chrome is closed, profile inactive, or extension toggled off).
 * - OUTDATED: Extension is connected, but running an obsolete build lacking web image capabilities.
 * - CHECKING: Probe currently in progress.
 * - UNKNOWN: Probe timed out or ambiguous without conclusive result.
 *
 * NOTE: App version (1.0.0-beta.x) and Extension version (0.1.x) are distinct version lines!
 * Compatibility is determined by protocol capability, NOT string equality with package.json.
 */

export const EXTENSION_STATUS = Object.freeze({
  READY: "ready",
  MISSING: "missing",
  UNREACHABLE: "unreachable",
  OUTDATED: "outdated",
  TIMEOUT: "timeout",
  CHECKING: "checking",
  UNKNOWN: "unknown",
});

export const EXTENSION_SEEN_KEY = "voo.extension.lastSeenVersion";
export const EXTENSION_EVER_SEEN_KEY = "voo.extension.everInstalled";

/** Returns true if a previous extension install was recorded on this client. */
export function hasSeenExtension() {
  try {
    if (typeof localStorage === "undefined") return false;
    return Boolean(
      localStorage.getItem(EXTENSION_EVER_SEEN_KEY) ||
      localStorage.getItem(EXTENSION_SEEN_KEY)
    );
  } catch {
    return false;
  }
}

/** Record successful extension detection. */
export function recordExtensionSeen(version = "0.1.0") {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(EXTENSION_EVER_SEEN_KEY, "true");
      if (version) {
        localStorage.setItem(EXTENSION_SEEN_KEY, String(version));
      }
    }
  } catch {
    // Ignore storage issues in sandbox
  }
}

/**
 * Checks if the reported extension version is protocol-compatible.
 * VOO Design extension line starts at 0.1.0.
 */
export function isExtensionCompatible(extensionVersion) {
  if (!extensionVersion) return true; // Default to compatible if protocol ping succeeds
  const trimmed = String(extensionVersion).trim();
  if (trimmed === "") return true;

  // Simple semver check: 0.1.0 and up are valid for VOO Design
  const match = trimmed.match(/^(\d+)\.(\d+)/);
  if (!match) return true;
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);

  // If someone installed a legacy pre-0.1 prototype
  if (major === 0 && minor < 1) {
    return false;
  }
  return true;
}

/**
 * Probes the current Chrome extension availability.
 * Safe for both Electron desktop and browser environments.
 *
 * @param {object} [options]
 * @param {number} [options.timeoutMs=1500]
 * @param {string} [options.mockStatus] Injected status for testing
 * @returns {Promise<{ status: string, version: string | null, error?: string }>}
 */
export async function probeExtensionStatus(options = {}) {
  const opts = typeof options === "number" ? { timeoutMs: options } : (options || {});
  const { timeoutMs = 1500, mockStatus = null } = opts;

  // Test hook override
  if (mockStatus) {
    if (mockStatus === EXTENSION_STATUS.READY) {
      recordExtensionSeen("0.1.0");
      return { status: EXTENSION_STATUS.READY, version: "0.1.0" };
    }
    return { status: mockStatus, version: null };
  }
  if (typeof globalThis !== "undefined" && globalThis.__VOO_TEST_EXTENSION_STATUS__) {
    const status = globalThis.__VOO_TEST_EXTENSION_STATUS__;
    if (status === EXTENSION_STATUS.READY) {
      recordExtensionSeen("0.1.0");
      return { status: EXTENSION_STATUS.READY, version: "0.1.0" };
    }
    return { status, version: null };
  }

  // 1. Electron Desktop Environment
  if (typeof window !== "undefined" && window.vooDesktop) {
    // If desktop exposes an explicit extension status/probe API:
    if (typeof window.vooDesktop.extensionStatus === "function") {
      try {
        const res = await Promise.race([
          window.vooDesktop.extensionStatus(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
        ]);
        if (res?.connected) {
          const version = res.version || "0.1.0";
          recordExtensionSeen(version);
          return isExtensionCompatible(version)
            ? { status: EXTENSION_STATUS.READY, version }
            : { status: EXTENSION_STATUS.OUTDATED, version };
        }
      } catch (err) {
        if (err?.message === "timeout") {
          return { status: EXTENSION_STATUS.TIMEOUT, version: null };
        }
        return { status: EXTENSION_STATUS.UNKNOWN, version: null, error: err?.message };
      }
    }

    // Notice: preload exposes webImageGenerate unconditionally, but that does NOT mean
    // a real Chrome extension is currently installed or connected. Do NOT call webImageGenerate
    // (which triggers inference/launch) and do NOT fake ready or write everInstalled.
    if (hasSeenExtension()) {
      return { status: EXTENSION_STATUS.UNREACHABLE, version: null };
    }
    return { status: EXTENSION_STATUS.MISSING, version: null };
  }

  // 2. Web Browser Environment with Chrome messaging
  if (typeof chrome !== "undefined" && typeof chrome.runtime?.sendMessage === "function") {
    try {
      const { detectBridge } = await import("../bridge.js");
      const timer = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      );

      const bridge = await Promise.race([detectBridge({ timeoutMs }), timer]);

      if (bridge) {
        const version = bridge.extensionVersion || "0.1.0";
        recordExtensionSeen(version);
        if (!isExtensionCompatible(version)) {
          return { status: EXTENSION_STATUS.OUTDATED, version };
        }
        return { status: EXTENSION_STATUS.READY, version };
      }
    } catch (err) {
      if (err?.message === "timeout") {
        return { status: EXTENSION_STATUS.TIMEOUT, version: null };
      }
      return { status: EXTENSION_STATUS.UNKNOWN, version: null, error: err?.message };
    }
  }

  // 3. Fallback: Missing vs Unreachable
  if (hasSeenExtension()) {
    return { status: EXTENSION_STATUS.UNREACHABLE, version: null };
  }
  return { status: EXTENSION_STATUS.MISSING, version: null };
}
