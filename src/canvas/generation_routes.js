/**
 * Generation route vocabulary: which platform serves a request and whether it
 * runs as a website chat or an API call. Shared by editor generation paths.
 */

export const PLATFORM_TARGET = Object.freeze({
  AUTO: "auto",
  CHATGPT: "chatgpt",
  GEMINI: "gemini",
  JIMENG: "jimeng",
  MIDJOURNEY: "midjourney",
  TRIPO: "tripo",
  DEEPSEEK: "deepseek",
});

export const EXECUTION_MODE = Object.freeze({
  CHAT: "chat",
  API: "api",
});
