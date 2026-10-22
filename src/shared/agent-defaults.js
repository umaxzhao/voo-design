/** Shared defaults for the main agent and Design Editor generation. */
export const DEFAULT_CODEX_MODEL = "gpt-6-astra";
export const DEFAULT_AGENT_MODEL = "claude:claude-opus-5-5";
export const DEFAULT_IMAGE_PLATFORM = "chatgpt";

export const CODEX_MODELS = [
  { id: DEFAULT_CODEX_MODEL, label: "GPT-6 Astra" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
];

/**
 * Claude Code aliases and pinned ids. Stable aliases resolve inside the CLI,
 * so only the pinned id is verified; the rest are passed through as written.
 */
export const CLAUDE_MODELS = [
  { id: "default", label: "Default" },
  { id: "best", label: "Best" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "fable", label: "Fable" },
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
];
