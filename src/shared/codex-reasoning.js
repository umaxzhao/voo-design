import { getSetting, setSetting } from "./settings.js";

export const CODEX_REASONING_STORAGE_KEY = "voo.agent.codexReasoningEffort";

/** Resolve options from the connected CLI, never from the model's display name. */
export function getCodexReasoningSettings(model, models = []) {
  const modelId = String(model ?? "").replace(/^codex:/, "");
  const metadata = models.find((entry) => entry.id === modelId);
  const reasoningEfforts = metadata?.supportedReasoningEfforts ?? [];
  const stored = getSetting(CODEX_REASONING_STORAGE_KEY)?.[modelId];
  // Preferences are per model. A retired effort falls back to the model's
  // advertised default rather than leaking an unsupported value into a turn.
  const reasoningEffort = reasoningEfforts.includes(stored)
    ? stored
    : reasoningEfforts.includes(metadata?.defaultReasoningEffort)
      ? metadata.defaultReasoningEffort
      : null;
  return { reasoningEfforts, reasoningEffort };
}

export async function setStoredCodexReasoningEffort(model, effort) {
  const modelId = String(model ?? "").replace(/^codex:/, "");
  if (!modelId || typeof effort !== "string" || !effort)
    throw new Error("cli.invalidReasoningEffort");
  const stored = getSetting(CODEX_REASONING_STORAGE_KEY);
  await setSetting(CODEX_REASONING_STORAGE_KEY, {
    ...(stored && typeof stored === "object" ? stored : {}),
    [modelId]: effort,
  });
  globalThis.window?.dispatchEvent(new CustomEvent("ciw-agent-llm-changed"));
}
