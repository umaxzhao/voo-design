/**
 * Content script entry. Injected into ChatGPT and Gemini only.
 * Bundled to extension/dist/content.js — see docs/web-image-extension.md.
 */

import { ChatGptAdapter } from "./adapters/chatgpt.js";
import { GeminiAdapter } from "./adapters/gemini.js";
import { platformFromUrl } from "./platform_router.js";
import { BG, EVENTS, RPC } from "../shared/messages.js";

export function adapterForUrl(url, options = {}) {
  const platform = platformFromUrl(url);
  if (platform === "chatgpt") return new ChatGptAdapter(options);
  if (platform === "gemini") return new GeminiAdapter(options);
  return null;
}

export function attachContentScript({ chrome, adapter }) {
  const runtime = chrome?.runtime;
  if (!runtime?.onMessage || !adapter) return;
  runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.method !== RPC.GENERATE) return undefined;
    const jobId = message.jobId;
    const payload = message.payload ?? {};
    sendResponse({ ok: true });
    const onProgress = (event) => {
      runtime.sendMessage?.({
        type: EVENTS.RUN_PROGRESS,
        jobId,
        stage: event.stage,
        provider: adapter.platform,
      })?.catch?.(() => {});
    };
    adapter.submit({ ...payload, onProgress }).then(
      (result) => {
        runtime.sendMessage?.({
          type: BG.PLATFORM_JOB_DONE,
          jobId,
          ok: true,
          result,
        })?.catch?.(() => {});
      },
      (error) => {
        runtime.sendMessage?.({
          type: BG.PLATFORM_JOB_DONE,
          jobId,
          ok: false,
          error: error?.code || error?.message || "generic",
        })?.catch?.(() => {});
      },
    );
    return true;
  });
}

function backgroundFetch(url) {
  return globalThis.chrome.runtime
    .sendMessage({ type: BG.FETCH_AS_DATA_URL, url })
    .then((response) => {
      if (!response?.ok) throw new Error(response?.error || "background-fetch-failed");
      return response.dataUrl;
    });
}

const pageAdapter = adapterForUrl(globalThis.location?.href ?? "", { backgroundFetch });
if (pageAdapter && globalThis.chrome?.runtime?.onMessage) {
  attachContentScript({ chrome: globalThis.chrome, adapter: pageAdapter });
}
