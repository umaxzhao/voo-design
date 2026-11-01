/**
 * Shared UI settings with a synchronous read cache.
 *
 * Three stores are kept in agreement:
 *  - `chrome.storage.local` is authoritative — the content scripts read
 *    selector overrides from it, and the service worker serves the same keys
 *    to hosted pages over the external bridge;
 *  - a `localStorage` mirror keeps module-load readers synchronous (the
 *    locale detector above all cannot await);
 *  - an in-memory cache on top of the mirror, so reads never touch storage.
 *
 * Hosted pages without chrome APIs plug a bridge transport in via
 * `setSettingsTransport`; without one, the mirror is all there is
 * (standalone mode's acceptable degradation).
 */

const STORAGE_KEYS = [
  // Canvas agent settings are read synchronously when the panel mounts.
  // Keep these in sync with AGENT_SETTING without importing the canvas engine.
  "agent.apiKey",
  "agent.baseUrl",
  "agent.model",
  "agent.imageProviderId",
  "agent.imageModelId",
  "agent.text.providerId",
  "agent.text.modelId",
  "agent.llm.providerId",
  "agent.llm.modelId",
  "agent.confirmBeforeImage",
  "agent.useSelectionByDefault",
  "agent.defaultImageSize",
  "agent.maxSteps",
  "agent.styleNote",
  "agent.mcpServers",
  "ciw.currentWorkflowId",
  "ciw.locale",
  "ciw.selectorOverrides",
  "ciw.disabledSitePlatforms",
  "voo.webSidebarCollapsed",
  "voo.agent.llmProvider",
  "voo.agent.llmModel",
  "voo.agent.codexReasoningEffort",
  "voo.agent.nameTheme",
  "voo.agent.defaultName",
  "voo.agent.customNames",
  "voo.agent.activePersonaId",
  "voo.agent.customPersonas",
  "voo.modelRoutes",
  // The performance tier decides which default a new node gets, so both halves
  // are read synchronously while a node is built (contract §1.2): the user's
  // override and the cache the probe writes at startup.
  "voo.performanceTier",
  "voo.performanceTierDetected",
  "voo.errorReporting.enabled",
  "voo.globalMemory.brands",
  "voo.globalMemory.preferences",
  "voo.onboarding.completedVersion",
  "voo.firstRun.status",
  "voo.agent.experimental.antigravity",
  "voo.workspace.path",
  "voo.workspace.type",
  "voo.workspace.name",
  "voo.workspace.lastScannedAt",
  // Canvas view aids: the ruler overlay, its guides, and whether dragging
  // snaps to the document grid. Read synchronously by the pointer handlers.
  "voo.editor.showRulers",
  "voo.editor.showGuides",
  "voo.editor.snapToGrid",
  "voo.editor.panelLayout",
  "voo.editor.layersWidth",
  "voo.editor.panelSections",
  // Editor chrome theme (dark by default): read synchronously before first paint.
  "voo.editor.theme",
  // Optional background draft saver for saved documents (crash recovery).
  "voo.editor.autoSaveDrafts",
  // User-created design systems; built-in presets are code, not settings.
  "voo.designSystems.custom",
];

const cache = new Map();
const listeners = new Map();
let transport = null;

function readMirror(key) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Values written before the mirror existed are plain strings.
      return raw;
    }
  } catch {
    return null;
  }
}

function writeMirror(key, value) {
  try {
    if (value === null || value === undefined) {
      globalThis.localStorage?.removeItem(key);
    } else {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
    }
  } catch {
    // The mirror is a convenience; storage denial only costs sync reads.
  }
}

// Seed the cache synchronously so module-load readers see last session's values.
for (const key of STORAGE_KEYS) {
  const mirrored = readMirror(key);
  if (mirrored !== null) cache.set(key, mirrored);
}

function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function updateCache(key, value) {
  if (sameValue(cache.get(key) ?? null, value ?? null)) return false;
  if (value === null || value === undefined) cache.delete(key);
  else cache.set(key, value);
  writeMirror(key, value);
  listeners.get(key)?.forEach((listener) => listener(value ?? null));
  return true;
}

function storageArea() {
  return globalThis.chrome?.storage?.local ?? null;
}

/** Installs the hosted page's bridge transport: `{get(keys), set(key, value)}`. */
export function setSettingsTransport(next) {
  transport = next;
}

/** Synchronous read from the cache — safe at module load, may be one write behind. */
export function getSetting(key) {
  return cache.get(key) ?? null;
}

/** Authoritative read: storage when reachable, cache otherwise. */
export async function getSettingAsync(key) {
  const area = storageArea();
  if (area) {
    const stored = await area.get(key);
    if (stored[key] !== undefined) {
      updateCache(key, stored[key]);
      return stored[key];
    }
  } else if (transport) {
    const values = await transport.get([key]);
    if (values?.[key] !== undefined && values[key] !== null) {
      updateCache(key, values[key]);
      return values[key];
    }
  }
  return cache.get(key) ?? null;
}

/** Writes through every store, notifying listeners once. */
export async function setSetting(key, value) {
  updateCache(key, value);
  const area = storageArea();
  if (area) {
    await area.set({ [key]: value ?? null });
  } else if (transport) {
    await transport.set(key, value ?? null);
  }
}

/**
 * Pulls the authoritative values into the cache at startup, so a preference
 * changed on another surface (a hosted tab vs a local panel) applies here.
 */
export async function hydrateSettings() {
  const area = storageArea();
  let values = null;
  if (area) {
    values = await area.get(STORAGE_KEYS);
  } else if (transport) {
    values = await transport.get(STORAGE_KEYS);
  }
  if (!values) return;
  for (const key of STORAGE_KEYS) {
    if (values[key] !== undefined && values[key] !== null) {
      updateCache(key, values[key]);
    }
  }
}

/**
 * Subscribes to changes of one key — from local writes and from hydration.
 * @returns {() => void} unsubscribe
 */
export function onSettingChange(key, listener) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(listener);
  return () => listeners.get(key)?.delete(listener);
}
