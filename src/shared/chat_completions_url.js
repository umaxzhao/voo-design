/**
 * Turns a provider base URL into its OpenAI-compatible completions endpoint.
 *
 * Shared because both the renderer's chat client and the desktop main process
 * (which proxies completions with the desktop's own key) need it, and only
 * `src/shared/**` is packaged into the desktop asar.
 */
export function resolveChatCompletionsUrl(baseUrl) {
  const base = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) return "https://api.deepseek.com/v1/chat/completions";
  if (base.endsWith("/chat/completions")) return base;
  if (base.endsWith("/v1") || base.endsWith("/v4") || base.includes("/ai/"))
    return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}
