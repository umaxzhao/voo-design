/**
 * Service worker: dial the desktop app and forward LINK.JOB to the page.
 *
 * The socket is outbound only. Origin is chrome-extension://<id>, which is
 * the only origin the desktop bridge accepts.
 */

import { BG, DESKTOP_LINK_PORT, EVENTS, LINK } from "../src/shared/messages.js";
import { handleLinkFrame, relayJobProgress } from "../src/content/desktop_link.js";
import { ensurePlatformTab, routePlatformJob } from "../src/content/platform_router.js";

const PING_MS = 20000;
const RETRY_MS = 4000;

let socket = null;
let pingTimer = null;
let retryTimer = null;

function send(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const size = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += size) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + size));
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

function connect() {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  try {
    socket = new WebSocket(`ws://127.0.0.1:${DESKTOP_LINK_PORT}/`);
  } catch {
    scheduleRetry();
    return;
  }
  socket.addEventListener("open", () => {
    clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ type: LINK.PING }), PING_MS);
  });
  socket.addEventListener("message", (event) => {
    let frame;
    try {
      frame = JSON.parse(event.data);
    } catch {
      return;
    }
    handleLinkFrame(frame, {
      send,
      openPlatform: (platform) => ensurePlatformTab(chrome.tabs, platform),
      routeJob: (job) => routePlatformJob(job, chrome.tabs),
    });
  });
  const drop = () => {
    clearInterval(pingTimer);
    socket = null;
    scheduleRetry();
  };
  socket.addEventListener("close", drop);
  socket.addEventListener("error", drop);
}

function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, RETRY_MS);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === BG.FETCH_AS_DATA_URL) {
    fetch(message.url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        sendResponse({ ok: true, dataUrl: await blobToDataUrl(await response.blob()) });
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === BG.PLATFORM_JOB_DONE || message?.type === EVENTS.RUN_PROGRESS) {
    relayJobProgress(send, message);
  }
  return undefined;
});

connect();
