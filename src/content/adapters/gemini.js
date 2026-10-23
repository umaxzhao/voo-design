/**
 * Gemini (gemini.google.com) page adapter.
 *
 * A signed-in account exposes SignOutOptions. A sign-in link without that
 * control, or a redirect onto accounts.google.com, means the turn cannot
 * start. Generated images live on googleusercontent hosts that are not the
 * account avatar (`/a/`); gstatic assets are chrome, not results.
 */

import { queryFirst } from "../dom-utils.js";
import { PlatformAdapter } from "./base.js";

const BLOCKED_SRC = [
  "gstatic.com",
  "googleusercontent.com/a/",
  "googleusercontent.com/a-/",
];

const BUSY_SELECTORS = [
  "model-response .loading-indicator",
  "model-response mat-progress-bar",
  'message-content[data-streaming="true"]',
  ".response-container.streaming",
];

export const GEMINI_SELECTORS = Object.freeze({
  composer: [
    "rich-textarea .ql-editor",
    'rich-textarea div.ql-editor[contenteditable="true"]',
    'div.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
  ],
  sendButton: [
    "button.send-button",
    'button[aria-label*="Send" i]',
    'button[aria-label*="发送" i]',
    'button[data-test-id*="send" i]',
    ".send-button-container button",
  ],
  stopButton: [
    "button.send-button.stop",
    'button[aria-label*="Stop response"]',
    'button[aria-label*="停止"]',
  ],
  assistantTurn: [
    "model-response",
    "message-content.model-response-text",
    ".model-response-text",
  ],
});

export const GEMINI_URL = "https://gemini.google.com/app";

function sourceOf(element) {
  return element?.currentSrc || element?.src || element?.getAttribute?.("src") || "";
}

export class GeminiAdapter extends PlatformAdapter {
  constructor(options = {}) {
    super({
      platform: "gemini",
      selectors: GEMINI_SELECTORS,
      backgroundFetch: options.backgroundFetch ?? null,
    });
  }

  isLoginRequired() {
    const host = globalThis.window?.location?.hostname ?? "";
    const pathname = globalThis.window?.location?.pathname ?? "";
    if (host.includes("accounts.google.com") || pathname.startsWith("/signin")) return true;
    const document = globalThis.document;
    if (!document?.querySelector) return false;
    if (document.querySelector('a[href*="accounts.google.com/SignOutOptions"]')) return false;
    return Boolean(
      document.querySelector(
        'a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/signin"], [aria-label*="Sign in" i], [aria-label*="登录" i]',
      ),
    );
  }

  isBusy() {
    if (super.isBusy()) return true;
    return BUSY_SELECTORS.some((selector) => queryFirst([selector]));
  }

  isResultCandidate(element) {
    const src = sourceOf(element);
    if (!src) return false;
    return !BLOCKED_SRC.some((fragment) => src.includes(fragment));
  }
}
