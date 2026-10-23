/**
 * Clicks send and waits until the page proves the turn started.
 *
 * A bare click is not enough: both composers swallow untrusted clicks unless
 * the pointer sequence lands, and a click that lands on a disabled button
 * leaves the prompt sitting in the composer. The proof is any of: the stop
 * control appears, a new assistant turn mounts, or the composer text changes.
 */

import { composerHasText } from "./dom-utils.js";
import { codedError } from "./errors.js";
import { pressButton } from "./send-control.js";

function composerText(composer) {
  if (!composer) return "";
  if (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") {
    return composer.value ?? "";
  }
  return composer.textContent ?? "";
}

export async function verifiedSubmit(adapter, button, {
  timeoutMs = 15000,
  waitFor,
  sleep,
} = {}) {
  if (!button) throw codedError("sendMissing");
  const composer = adapter.getComposer?.() ?? null;
  const beforeText = composerText(composer);
  const beforeTurns = adapter.getAssistantTurns().length;
  const hadText = beforeText.trim().length > 0;
  pressButton(button);

  const probe = () => {
    if (adapter.isBusy()) return true;
    if (adapter.getAssistantTurns().length > beforeTurns) return true;
    const next = adapter.getComposer?.() ?? composer;
    if (hadText && next && !composerHasText(next, beforeText) && composerText(next) !== beforeText) {
      return true;
    }
    return false;
  };

  if (waitFor) {
    const ok = await waitFor(probe, { timeout: timeoutMs });
    if (!ok) {
      throw codedError("webSubmissionUncertain");
    }
    return;
  }

  const deadline = Date.now() + timeoutMs;
  const pause = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  while (Date.now() < deadline) {
    if (probe()) return;
    await pause(120);
  }
  throw codedError("webSubmissionUncertain");
}
