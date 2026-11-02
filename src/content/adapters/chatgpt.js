/**
 * ChatGPT (chatgpt.com) page adapter.
 *
 * Selectors are the chains the VOO extension already runs against the live
 * composer. Login is the auth path or the logged-out welcome button, not the
 * absence of a cookie. Result images drop the static chrome (sprites, avatars,
 * favicons) that shares the assistant turn.
 */

import { PlatformAdapter, collectTurns } from "./base.js";

export const CHATGPT_USER_TURN =
  '[data-turn="user"], [data-message-author-role="user"]';

const BLOCKED_SRC = [
  "cdn.oaistatic.com/assets",
  "cdn.oaistatic.com/_next",
  "/_next",
  "/avatar",
  "persistent.oaistatic.com",
  "favicon",
];

export const CHATGPT_SELECTORS = Object.freeze({
  composer: [
    "#prompt-textarea",
    'div[contenteditable="true"][id="prompt-textarea"]',
    'form div[contenteditable="true"]',
    "textarea[data-id]",
  ],
  sendButton: [
    'button[data-testid="send-button"]',
    'button[class*="composer-submit-btn"]',
    'button[aria-label*="发送提示"]',
    'button[aria-label*="Send prompt"]',
    'form button[type="submit"]',
  ],
  stopButton: [
    'button[data-testid="stop-button"]',
    'button[aria-label*="Stop streaming"]',
    'button[aria-label*="停止"]',
  ],
  assistantTurn: [
    '[data-chatgpt-search-unit-key$=":assistant"]',
    '[data-turn="assistant"]',
    '[data-message-author-role="assistant"]',
    '[data-testid^="conversation-turn-"]',
  ],
});

export const CHATGPT_URL = "https://chatgpt.com/";

function sourceOf(element) {
  return element?.currentSrc || element?.src || element?.getAttribute?.("src") || "";
}

export class ChatGptAdapter extends PlatformAdapter {
  constructor(options = {}) {
    super({
      platform: "chatgpt",
      selectors: CHATGPT_SELECTORS,
      backgroundFetch: options.backgroundFetch ?? null,
    });
  }

  isLoginRequired() {
    const pathname = globalThis.window?.location?.pathname ?? "";
    if (pathname.startsWith("/auth") || pathname.startsWith("/login")) return true;
    return Boolean(
      globalThis.document?.querySelector?.(
        '[data-testid="login-button"], button[data-testid="welcome-login-button"], a[href*="/auth/login"], [data-testid="auth-page"]',
      ),
    );
  }

  isResultCandidate(element) {
    const src = sourceOf(element);
    if (!src) return false;
    return !BLOCKED_SRC.some((fragment) => src.includes(fragment));
  }

  getAssistantTurns() {
    return collectTurns(this.selectors.assistantTurn, { userSelector: CHATGPT_USER_TURN });
  }
}
