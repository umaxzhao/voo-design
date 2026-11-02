/**
 * Shared ChatGPT / Gemini page adapter.
 *
 * The adapter runs in the page, where the user's cookies already exist. It
 * only knows how to find the composer, tell whether a turn is in flight, and
 * hand a prompt to `verifiedSubmit`. Platform files supply selectors and the
 * login / image filters that differ.
 */

import { queryFirst, setComposerText, waitFor } from "../dom-utils.js";
import { codedError } from "../errors.js";
import { imagePrompt, collectGeneratedImages } from "../result_collection.js";
import { findSendButton, isEnabled } from "../send-control.js";
import { verifiedSubmit } from "../verified-submit.js";

const FOLLOWING = globalThis.Node?.DOCUMENT_POSITION_FOLLOWING ?? 4;

export function collectTurns(selectors, { userSelector, root = globalThis.document } = {}) {
  const seen = new Set();
  const turns = [];
  for (const selector of selectors ?? []) {
    const found = root?.querySelectorAll?.(selector);
    if (!found) continue;
    for (const element of found) {
      if (seen.has(element)) continue;
      if (userSelector && element.closest?.(userSelector)) continue;
      seen.add(element);
      turns.push(element);
    }
  }
  const top = turns.filter((element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (seen.has(parent)) return false;
    }
    return true;
  });
  return top.sort((a, b) => {
    if (typeof a.compareDocumentPosition !== "function") return 0;
    return a.compareDocumentPosition(b) & FOLLOWING ? -1 : 1;
  });
}

export class PlatformAdapter {
  constructor({ platform, selectors, backgroundFetch = null }) {
    this.platform = platform;
    this.selectors = selectors;
    this.backgroundFetch = backgroundFetch;
  }

  getComposer() {
    return queryFirst(this.selectors.composer);
  }

  getSendButton() {
    return findSendButton(this.selectors.sendButton);
  }

  isBusy() {
    const stop = queryFirst(this.selectors.stopButton);
    if (!stop) return false;
    if (typeof stop.getClientRects === "function") return stop.getClientRects().length > 0;
    return stop.offsetParent != null;
  }

  isLoginRequired() {
    return false;
  }

  isResultCandidate() {
    return true;
  }

  getAssistantTurns() {
    return collectTurns(this.selectors.assistantTurn);
  }

  collectImageElements(root = globalThis.document) {
    const found = root?.querySelectorAll?.("img");
    if (!found) return [];
    return [...found].filter((element) => this.isResultCandidate(element));
  }

  snapshotSources() {
    return new Set(
      this.collectImageElements(globalThis.document)
        .map((element) => element.currentSrc || element.src || "")
        .filter(Boolean),
    );
  }

  async waitForComposerReady(timeoutMs = 15000) {
    return waitFor(() => {
      const button = this.getSendButton();
      return button && isEnabled(button) ? button : null;
    }, { timeout: timeoutMs });
  }

  async triggerSend(button) {
    await verifiedSubmit(this, button, { waitFor });
  }

  /**
   * Writes the prompt, proves the send landed, and returns settled images.
   * Login is polled first so the Chrome tab can stay open while the user
   * signs in.
   */
  async submit({
    prompt,
    count = 1,
    timeoutMs = 240000,
    settleMs = 3000,
    loginWaitMs = 5 * 60 * 1000,
    onProgress = () => {},
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
  } = {}) {
    const loginDeadline = now() + loginWaitMs;
    let announced = false;
    while (this.isLoginRequired()) {
      if (!announced) {
        announced = true;
        onProgress({ stage: "login_required" });
      }
      if (now() >= loginDeadline) throw codedError("loginRequired");
      await sleep(250);
    }

    const composer = this.getComposer();
    if (!composer) throw codedError("composerMissing");
    onProgress({ stage: "submitting" });
    await setComposerText(composer, imagePrompt(prompt));
    const known = this.snapshotSources();
    const baselineTurns = this.getAssistantTurns().length;
    const button = await this.waitForComposerReady(15000);
    if (!button) throw codedError("composerMissing");
    await this.triggerSend(button);
    onProgress({ stage: "generating" });
    return collectGeneratedImages(this, {
      known,
      baselineTurns,
      count,
      timeoutMs,
      settleMs,
      onProgress,
      sleep,
      now,
    });
  }
}
