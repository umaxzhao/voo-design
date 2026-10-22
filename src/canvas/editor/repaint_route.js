import { CANVAS_MODE } from "../environment.js";
import { EXECUTION_MODE } from "../generation_routes.js";

/**
 * Route decision for the layer Repaint action.
 *
 * The API path uses the image provider/model resolved by the caller, including
 * the built-in 302.AI route. An explicit chat selection uses the host page's
 * content-script adapter and requires a reachable chat session. Output alpha
 * depends on the selected model and returned image on either path.
 *
 * Strategy: respect the execution mode chosen in the Design Editor. The
 * default is API. Missing API credentials must surface configuration feedback
 * instead of silently sending the edit to a different provider on a chat page.
 */

/**
 * Modes where no content script can reach a chat page, so the chat-page route
 * must never be chosen regardless of provider state.
 *
 * `standalone` is voo.run/editor with no extension — the hosted page that
 * cannot inject. `frame`/`bridge`/`extension`/`desktop` all pair with a
 * host page (or the extension worker) that can drive a chat tab.
 */
export function chatAvailable(mode) {
  return mode !== CANVAS_MODE.STANDALONE;
}

/**
 * Decides which execution mode and, when chat is needed, the platform the
 * Repaint should run through.
 *
 * @param {{
 *   hasApiProvider: boolean,
 *   environment?: { mode?: string },
 *   providerId?: string,
 *   modelId?: string,
 *   platform?: string,
 *   executionMode?: string,
 * }} input
 * @returns {{
 *   route: "api" | "chat" | "unavailable",
 *   executionMode: string,
 *   platform: string,
 *   providerId?: string,
 *   modelId?: string,
 *   chatUnavailable?: boolean,
 * }}
 */
export function resolveRepaintRoute({
  hasApiProvider,
  environment = {},
  providerId,
  modelId,
  platform,
  executionMode = EXECUTION_MODE.API,
}) {
  const mode = environment.mode;
  const canChat = chatAvailable(mode);

  // Explicit chat preferences remain usable even when API credentials exist.
  if (executionMode !== EXECUTION_MODE.API && canChat) {
    return {
      route: "chat",
      executionMode: EXECUTION_MODE.CHAT,
      platform,
    };
  }

  // API is the default, or the existing fallback for an unreachable chat page.
  if (hasApiProvider) {
    return {
      route: "api",
      executionMode: EXECUTION_MODE.API,
      platform,
      providerId,
      modelId,
    };
  }

  // No configured API for the selected/default route. Do not substitute a
  // reachable chat session: the caller must surface the missing configuration.
  return {
    route: "unavailable",
    executionMode: EXECUTION_MODE.API,
    platform: null,
    chatUnavailable: true,
  };
}
