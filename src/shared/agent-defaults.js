/** Shared defaults for the main agent and Design Editor generation. */
export const DEFAULT_CODEX_MODEL = "gpt-6-astra";
export const DEFAULT_AGENT_MODEL = `codex:${DEFAULT_CODEX_MODEL}`;
export const DEFAULT_IMAGE_PLATFORM = "chatgpt";

export const CODEX_MODELS = [
  { id: DEFAULT_CODEX_MODEL, label: "GPT-6 Astra" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
];
