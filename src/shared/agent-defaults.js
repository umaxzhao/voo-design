/** Shared defaults for the main agent and Design Editor generation. */
export const DEFAULT_CODEX_MODEL = "gpt-6-astra";
export const DEFAULT_AGENT_MODEL = "claude:claude-opus-5-5";
export const DEFAULT_IMAGE_PLATFORM = "chatgpt";

export const CODEX_MODELS = [
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
  { id: DEFAULT_CODEX_MODEL, label: "GPT-6 Astra" },
  { id: "gpt-6.1-terra", label: "GPT-6.1 Terra" },
  { id: "gpt-6-sol", label: "GPT-6 Sol" },
  { id: "gpt-6-luna", label: "GPT-6 Luna" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol" },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna" },
];

/**
 * Claude Code aliases and pinned ids. Stable aliases resolve inside the CLI,
 * while pinned versions stay explicit for reproducible model selection.
 */
export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
  { id: "claude-fable-5-1", label: "Fable 5.1" },
  { id: "default", label: "Default" },
  { id: "best", label: "Best" },
  { id: "fable", label: "Fable" },
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
];
