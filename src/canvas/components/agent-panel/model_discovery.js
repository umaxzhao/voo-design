import { latestModelVersions } from "../../../shared/agent-defaults.js";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const discovered = new Map();
const listeners = new Set();
const refreshes = new WeakMap();
let revision = 0;

export const modelCatalogRevision = () => revision;
export const getDiscoveredModels = (cliId) => discovered.get(cliId);
export function subscribeModelCatalog(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function updateModels(cliId, entries) {
  if (!Array.isArray(entries) || !entries.length)
    throw new Error("cli.modelCapabilitiesUnavailable");
  const models = new Map();
  for (const entry of entries) {
    if (typeof entry?.id !== "string" || !entry.id.trim())
      throw new Error("cli.modelCapabilitiesUnavailable");
    if (entry.hidden) continue;
    const id = `${cliId}:${entry.id}`;
    const model = { id, label: entry.label?.trim() || entry.id };
    if (
      cliId === "codex" &&
      Array.isArray(entry.supportedReasoningEfforts) &&
      entry.supportedReasoningEfforts.every((effort) => typeof effort === "string")
    ) {
      model.supportedReasoningEfforts = [...entry.supportedReasoningEfforts];
      if (
        typeof entry.defaultReasoningEffort === "string" &&
        model.supportedReasoningEfforts.includes(entry.defaultReasoningEffort)
      ) model.defaultReasoningEffort = entry.defaultReasoningEffort;
    }
    models.set(id, model);
  }
  discovered.set(cliId, latestModelVersions([...models.values()]));
  revision += 1;
  for (const listener of listeners) listener();
}

/** Refresh metadata only; never run a prompt or change the selected model. */
export function refreshModelCatalog(bridge) {
  if (!bridge) return Promise.resolve([]);
  const previous = refreshes.get(bridge);
  if (previous && Date.now() < previous.expiresAt) return previous.promise;
  const tasks = [];
  if (bridge.connect) tasks.push(["codex", () => bridge.connect()]);
  if (bridge.checkStatus)
    tasks.push([
      "antigravity",
      () => bridge.checkStatus("antigravity", { includeModels: true }),
    ]);
  const entry = { expiresAt: Infinity, promise: null };
  entry.promise = Promise.all(
    tasks.map(async ([cliId, load]) => {
      try {
        const result = await load();
        if (result?.modelsError) throw new Error(result.modelsError);
        // Older bridges and uninstalled CLIs have no model discovery support.
        if (result?.models) updateModels(cliId, result.models);
        return null;
      } catch {
        // Keep the last successful list and surface a safe diagnostic to callers.
        return { cliId, error: "cli.modelCapabilitiesUnavailable" };
      }
    }),
  ).then((results) => {
    entry.expiresAt = Date.now() + REFRESH_INTERVAL_MS;
    return results.filter(Boolean);
  });
  refreshes.set(bridge, entry);
  return entry.promise;
}
