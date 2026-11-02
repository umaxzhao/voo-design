/**
 * Finds or opens the ChatGPT / Gemini tab and hands it one job.
 *
 * The extension owns the tabs. The desktop app only names a platform. A
 * missing content script (tab still loading, or the extension just installed)
 * is retried; a login or composer error from the page is returned as-is.
 */

import { codedError } from "./errors.js";
import { CHATGPT_URL } from "./adapters/chatgpt.js";
import { GEMINI_URL } from "./adapters/gemini.js";

export const PLATFORM_URLS = Object.freeze({
  chatgpt: CHATGPT_URL,
  gemini: GEMINI_URL,
});

const RECEIVER_MISSING = /Receiving end does not exist|Could not establish connection/i;

export function platformFromUrl(url) {
  try {
    const { hostname } = new URL(url ?? "");
    if (hostname === "chatgpt.com" || hostname === "chat.openai.com") return "chatgpt";
    if (hostname === "gemini.google.com") return "gemini";
    return null;
  } catch {
    return null;
  }
}

function matchesPattern(url, pattern) {
  if (!url || !pattern) return false;
  const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
  return url.startsWith(prefix);
}

export async function ensurePlatformTab(tabs, platform, {
  allowCreate = true,
  activate = true,
} = {}) {
  const home = PLATFORM_URLS[platform];
  if (!home) throw codedError("noPlatform");
  const origin = new URL(home).origin;
  const existing = (await tabs.query({ url: `${origin}/*` }))?.find((tab) => tab?.id);
  if (existing) {
    if (activate) await tabs.update(existing.id, { active: true });
    return { tabId: existing.id, created: false };
  }
  if (!allowCreate) throw codedError("platformTabMissing");
  const created = await tabs.create({ url: home, active: true });
  if (!created?.id) throw codedError("platformTabMissing");
  return { tabId: created.id, created: true };
}

/**
 * A freshly opened chat page is not scriptable until document_end. Waiting
 * here keeps the desktop ack (15s) from firing while Chrome is still loading.
 */
export async function waitForTabLoad(tabs, tabId, {
  timeoutMs = 10000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) {
  if (typeof tabs?.get !== "function") return;
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const tab = await tabs.get(tabId);
    if (!tab || tab.status == null || tab.status === "complete") return;
    await sleep(200);
  }
}

export async function deliverJob(tabs, tabId, message, {
  attempts = 12,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const reply = await tabs.sendMessage(tabId, message);
      if (reply?.error) {
        const code = reply.error.code || reply.error.message || "generic";
        throw codedError(code);
      }
      return reply ?? { ok: true };
    } catch (error) {
      if (error?.code && !RECEIVER_MISSING.test(error.message || "")) throw error;
      last = error;
      if (attempt + 1 < attempts) await sleep(200);
    }
  }
  throw last?.code ? last : codedError("platformTabNotReady");
}

/**
 * Opens the platform tab and asks its content script to accept the job.
 * Acceptance is the ack; the pictures arrive later as platform.jobDone.
 */
export async function routePlatformJob({ platform, envelope, jobId, activate = true, allowCreate = true }, tabs, {
  sleep,
} = {}) {
  if (!platform || !envelope?.method || !jobId) throw codedError("invalidPlatformRequest");
  const { tabId } = await ensurePlatformTab(tabs, platform, { allowCreate, activate });
  await waitForTabLoad(tabs, tabId, { sleep });
  return deliverJob(tabs, tabId, { ...envelope, jobId }, { sleep });
}
