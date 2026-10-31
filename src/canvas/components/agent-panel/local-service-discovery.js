import { CLI_BRIDGE_SERVICE_ID } from "../../../shared/cli_bridge_protocol.js";
import { CLI_TRANSPORT } from "../../../shared/cli-agents.js";
import { CLI_BRIDGE_URL, LOCAL_CLI_STATE_EVENT, ensureLocalCliBridge, resolveCliTransport } from "./local_cli_bridge.js";

const PROBE_TIMEOUT_MS = 1200;
const REFRESH_INTERVAL_MS = 30000;
const EMPTY = Object.freeze({ available: false, native: false, phase: "unavailable", statuses: null });

/** Probe identity only. Never send credentials or register a writable canvas. */
export async function probeLocalService({ url = CLI_BRIDGE_URL, fetchImpl = globalThis.fetch, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const health = new URL(url);
    health.protocol = health.protocol === "wss:" ? "https:" : "http:";
    health.pathname = "/health";
    health.search = "";
    health.hash = "";
    const result = await fetchImpl(health.href, { signal: controller.signal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!result.ok) return false;
    const data = await result.json();
    return data?.ok === true && data.service === CLI_BRIDGE_SERVICE_ID;
  } catch {
    // Refusal, browser local-network denial and timeout all mean unavailable,
    // never "not installed". The next focus/online probe can recover.
    return false;
  } finally { clearTimeout(timer); }
}

async function resolveBridge() {
  const current = await resolveCliTransport();
  if (current.transport === CLI_TRANSPORT.RUNNABLE) return current.bridge;
  return ensureLocalCliBridge({ linkCanvas: false });
}

/** One bounded discovery lifecycle shared by welcome, settings and agent UI. */
export function createLocalServiceDiscovery({
  probe = async () => (await resolveCliTransport()).transport === CLI_TRANSPORT.RUNNABLE || await probeLocalService(), resolveBridge: getBridge = resolveBridge,
  native = () => Boolean(globalThis.window?.vooDesktop?.localCli),
  target = globalThis.window, intervalMs = REFRESH_INTERVAL_MS,
} = {}) {
  let snapshot = EMPTY;
  let inFlight = null;
  let timer = null;
  let generation = 0;
  const listeners = new Set();
  const publish = value => {
    snapshot = Object.freeze(value);
    for (const listener of listeners) listener();
  };
  const refresh = () => {
    if (inFlight) return inFlight;
    const currentGeneration = generation;
    inFlight = (async () => {
      let next = { ...EMPTY, native: native() };
      try {
        if (next.native || await probe()) {
          if (generation !== currentGeneration) return snapshot;
          const bridge = await getBridge();
          const statuses = await bridge?.checkAll?.();
          if (statuses && typeof statuses === "object" && !Array.isArray(statuses)) {
            next = { available: true, native: next.native, phase: "done", statuses };
          }
        }
      } catch {
        // Failed capability RPC is unavailable even when /health succeeded.
        // Preserve provider/model settings; a probe must never choose a model.
      }
      if (generation === currentGeneration) publish(next);
      return snapshot;
    })().finally(() => {
      inFlight = null;
      if (listeners.size && currentGeneration !== generation) void refresh();
    });
    return inFlight;
  };
  const wake = () => { if (!target?.document?.hidden) void refresh(); };
  return {
    refresh,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        void refresh();
        timer = setInterval(wake, intervalMs);
        target?.addEventListener("focus", wake);
        target?.addEventListener("online", wake);
        target?.addEventListener(LOCAL_CLI_STATE_EVENT, wake);
        target?.document?.addEventListener("visibilitychange", wake);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        generation += 1;
        clearInterval(timer);
        target?.removeEventListener("focus", wake);
        target?.removeEventListener("online", wake);
        target?.removeEventListener(LOCAL_CLI_STATE_EVENT, wake);
        target?.document?.removeEventListener("visibilitychange", wake);
      };
    },
  };
}

export const localServiceDiscovery = createLocalServiceDiscovery();
