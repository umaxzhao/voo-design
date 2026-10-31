import { getSetting, setSetting } from "./settings.js";

export const CODEX_REASONING_STORAGE_KEY = "voo.agent.codexReasoningEffort";

/** Resolve options from the connected CLI, never from the model's display name. */
export function getCodexReasoningSettings(model, models = []) {
  const modelId = String(model ?? "").replace(/^codex:/, "");
  const metadata = models.find(
    (entry) => entry.id === modelId || entry.id === `codex:${modelId}`,
  );
  const reasoningEfforts = metadata?.supportedReasoningEfforts ?? [];
  const stored = getSetting(CODEX_REASONING_STORAGE_KEY)?.[modelId];
  // Default leaves the provider in control; never send an inferred effort.
  const reasoningEffort = reasoningEfforts.includes(stored) ? stored : null;
  return { reasoningEfforts, reasoningEffort };
}

export async function setStoredCodexReasoningEffort(model, effort) {
  const modelId = String(model ?? "").replace(/^codex:/, "");
  if (!modelId || (effort !== null && (typeof effort !== "string" || !effort)))
    throw new Error("cli.invalidReasoningEffort");
  const stored = getSetting(CODEX_REASONING_STORAGE_KEY);
  const next = { ...(stored && typeof stored === "object" ? stored : {}) };
  if (effort === null) delete next[modelId];
  else next[modelId] = effort;
  await setSetting(CODEX_REASONING_STORAGE_KEY, next);
  globalThis.window?.dispatchEvent(new CustomEvent("ciw-agent-llm-changed"));
}
