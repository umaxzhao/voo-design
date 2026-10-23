/**
 * Desktop side of "generate an image in the user's Chrome".
 *
 * Chrome is launched with no automation flags. The extension dials the
 * loopback bridge, accepts a LINK.JOB, and later relays run.progress /
 * platform.jobDone. This service only sequences those steps and reports
 * the stages the Agent panel shows.
 */

import { BG, EVENTS, PROTOCOL, RPC } from "../src/shared/messages.js";
import { CHATGPT_URL } from "../src/content/adapters/chatgpt.js";
import { GEMINI_URL } from "../src/content/adapters/gemini.js";
import { codedError } from "../src/content/errors.js";

export const PROVIDER_URLS = Object.freeze({
  chatgpt: CHATGPT_URL,
  gemini: GEMINI_URL,
});

const STAGE_ALIAS = Object.freeze({
  typing: "submitting",
  sending: "submitting",
  waiting: "generating",
  collecting: "downloading",
});

function normalizeStage(stage) {
  return STAGE_ALIAS[stage] || stage;
}

function clampCount(count) {
  const value = Number(count);
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(1, Math.round(value)));
}

/**
 * @param {object} deps
 * @param {(args: {url: string}) => Promise<unknown>|unknown} deps.ensureChrome
 * @param {{ linked: boolean, route: Function }} deps.bridge
 * @param {(listener: (name: string, payload: object) => void) => () => void} deps.subscribeRelay
 */
export function createWebImageService({
  ensureChrome,
  bridge,
  subscribeRelay,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  onProgress = () => {},
  linkWaitMs = 20000,
  loginWaitMs = 5 * 60 * 1000,
} = {}) {
  const controllers = new Map();

  async function waitUntil(predicate, timeoutMs) {
    const deadline = now() + timeoutMs;
    while (!predicate()) {
      if (now() >= deadline) return false;
      await sleep(50);
    }
    return true;
  }

  function cancel(jobId) {
    const controller = controllers.get(jobId);
    if (controller) controller.abort();
    return { ok: true };
  }

  async function generate({
    provider,
    prompt,
    count = 1,
    timeoutMs = 240000,
    jobId,
  } = {}) {
    if (!PROVIDER_URLS[provider]) throw codedError("invalidProvider");
    if (!prompt || !String(prompt).trim()) throw codedError("promptRequired");
    const id = jobId || `webimg-${now().toString(36)}`;
    const imagesWanted = clampCount(count);
    const controller = new AbortController();
    controllers.set(id, controller);
    const progress = (stage, extra = {}) => {
      onProgress({
        jobId: id,
        provider,
        stage: normalizeStage(stage),
        ...extra,
      });
    };
    const fail = (code) => {
      progress("error", { error: code });
      throw codedError(code);
    };

    const inbox = new Map();
    const unsubscribe = subscribeRelay((name, payload) => {
      if (!payload || payload.jobId !== id) return;
      if (name === EVENTS.RUN_PROGRESS && payload.stage) progress(payload.stage);
      if (name === BG.PLATFORM_JOB_DONE) inbox.set(id, payload);
    });

    try {
      progress("launching");
      try {
        await ensureChrome({ url: PROVIDER_URLS[provider] });
      } catch (error) {
        fail(error?.code === "chromeLaunchFailed" ? "chromeLaunchFailed" : "chromeLaunchFailed");
      }

      progress("opening");
      const linked = await waitUntil(() => bridge.linked, linkWaitMs);
      if (!linked) fail("extensionNotLinked");
      if (controller.signal.aborted) fail("cancelled");

      progress("submitting");
      try {
        await bridge.route({
          platform: provider,
          jobId: id,
          activate: true,
          allowCreate: true,
          envelope: {
            protocol: PROTOCOL,
            kind: "request",
            id,
            method: RPC.GENERATE,
            payload: {
              prompt: String(prompt),
              count: imagesWanted,
              medium: "image",
              timeoutMs,
              settleMs: 3000,
              loginWaitMs,
            },
          },
        });
      } catch (error) {
        const code = error?.code || error?.message;
        if (code === "extensionNotLinked" || code === "extensionDisconnected") {
          fail("extensionNotLinked");
        }
        if (code === "extensionAckTimeout" || code === "platformTabNotReady") fail("timeout");
        if (code === "loginRequired" || code === "composerMissing" || code === "noImages") {
          fail(code);
        }
        fail(code || "timeout");
      }

      progress("generating");
      const deadline = now() + timeoutMs + loginWaitMs;
      while (!inbox.has(id)) {
        if (controller.signal.aborted) fail("cancelled");
        if (now() >= deadline) fail("timeout");
        await sleep(20);
      }

      const outcome = inbox.get(id);
      if (!outcome.ok) {
        const code = outcome.error || "timeout";
        fail(code === "loginRequired" ? "loginRequired" : code);
      }
      const images = Array.isArray(outcome.result?.images) ? outcome.result.images.slice(0, imagesWanted) : [];
      if (images.length === 0) fail("noImages");
      progress("done");
      return { ok: true, provider, jobId: id, images };
    } finally {
      unsubscribe();
      controllers.delete(id);
    }
  }

  return { generate, cancel };
}
