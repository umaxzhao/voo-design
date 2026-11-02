/**
 * Renderer client for web image generation.
 *
 * The browser build has no loopback bridge and no Chrome launcher. It reports
 * that plainly instead of pretending a provider call failed.
 */

import { abortable } from "./abortable.js";

export const DESKTOP_REQUIRED_MESSAGE =
  "Web image generation needs the VOO Design desktop app (Electron); it is not available in the browser build.";

const PROVIDER_NAME = { chatgpt: "ChatGPT", gemini: "Gemini" };

/** Status line shown on the in-progress tool card. */
export function webImageStatusLine(provider, stage) {
  const name = PROVIDER_NAME[provider] || "Chrome";
  switch (stage) {
    case "launching":
      return "Opening Chrome…";
    case "opening":
      return `Connecting the ${name} extension…`;
    case "login_required":
      return `Please sign in to ${name} in the Chrome window`;
    case "submitting":
      return `${name}: submitting…`;
    case "generating":
      return `${name}: generating…`;
    case "downloading":
      return `${name}: downloading…`;
    case "done":
      return `${name}: done`;
    case "error":
      return `${name}: failed`;
    default:
      return `${name}: ${stage || "working"}…`;
  }
}

export async function generateImageWeb(
  { provider, prompt, count },
  { bridge = globalThis.window?.vooDesktop, onProgress, jobId, signal } = {},
) {
  if (!bridge?.webImageGenerate) {
    return { ok: false, code: "needsDesktopApp", error: DESKTOP_REQUIRED_MESSAGE };
  }
  const id = jobId || `webimg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let unsubscribe = () => {};
  if (onProgress && typeof bridge.onWebImageProgress === "function") {
    unsubscribe = bridge.onWebImageProgress((event) => {
      if (!event?.jobId || event.jobId === id) onProgress(event);
    }) ?? (() => {});
  }
  try {
    const result = await abortable(() => bridge.webImageGenerate({ provider, prompt, count, jobId: id }), signal);
    if (result?.ok === false) {
      return {
        ok: false,
        code: result.code || "generic",
        error: result.error || result.code || "generic",
        jobId: id,
      };
    }
    return { ...result, jobId: id };
  } finally {
    unsubscribe();
  }
}
