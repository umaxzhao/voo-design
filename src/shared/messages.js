/**
 * Message protocol shared by the canvas iframe, the content script and the
 * background service worker.
 *
 * Two transports are in play:
 *  - `window.postMessage` between the canvas iframe and the content script,
 *    because the iframe lives on the extension origin while the content script
 *    lives on the ChatGPT / Gemini origin.
 *  - `chrome.runtime.sendMessage` between the canvas iframe (an extension page)
 *    and the background service worker.
 *
 * A third reaches the service worker from the hosted editor on voo.run:
 * `externally_connectable` external messages (`EXTERNAL_PING`, `DB_OP`,
 * `SETTINGS_*`, `SYNC_ANNOUNCE`) plus a long-lived port for event relays.
 */

/** Identifies our envelopes so we ignore unrelated postMessage traffic. */
export const PROTOCOL = "chat-image-workflow/v1";

/** Requests sent from the canvas to the content script. */
export const RPC = {
  PLATFORM_INFO: "platform.info",
  SESSION_IMAGES: "session.images",
  SESSION_IMAGE_DATA: "session.imageData",
  GENERATION_OPTIONS: "chat.generationOptions",
  NEW_CONVERSATION: "chat.newConversation",
  GENERATE: "chat.generate",
  GENERATE_TEXT: "chat.generateText",
  REVERSE_PROMPT: "chat.reversePrompt",
  GENERATE_VIDEO: "chat.generateVideo",
  /** Tripo Studio web UI → one self-contained GLB result. */
  GENERATE_MODEL_3D: "tripo.generateModel3d",
  STOP_GENERATION: "chat.stopGeneration",
  CLOSE_PANEL: "panel.close",
  /** Fire-and-forget pointer stream that moves the floating window. */
  WINDOW_DRAG: "window.drag",
  WINDOW_MAXIMIZE: "window.maximize",
  WINDOW_STATE: "window.state",
};

/** One-way events pushed from the content script to the canvas. */
export const EVENTS = {
  CANVAS_READY: "canvas.ready",
  PLATFORM_CHANGED: "platform.changed",
  PANEL_VISIBILITY: "panel.visibility",
  RUN_PROGRESS: "run.progress",
  /** A picture imported from an external inspiration site is ready for canvas. */
  IMPORT_IMAGE: "canvas.importImage",
  /** Extension context invalidated / reloaded underneath hosted editor. */
  BRIDGE_INVALIDATED: "bridge.invalidated",
  /** App-served panel page → host: the desktop app cannot be reached. */
  DESKTOP_UNREACHABLE: "desktop.unreachable",
  /**
   * A streaming text job's progress, pushed by whoever owns the API key (the
   * service worker, or the desktop main process) to whichever canvas started
   * it. Payload: `{ jobId, text, reasoning }`, both fields ACCUMULATED rather
   * than deltas so a listener that joins late — or misses a push — still
   * holds the whole answer.
   */
  PROVIDER_STREAM_CHUNK: "provider.stream.chunk",
  /** The same job's outcome: `{ jobId, ok, text, reasoning }` or an error. */
  PROVIDER_STREAM_DONE: "provider.stream.done",
  /** Desktop agent LLM stream chunks relayed from desktop to canvas. */
  DESKTOP_AGENT_STREAM_CHUNK: "desktop.agent.stream.chunk",
  /** Desktop agent LLM stream outcome relayed from desktop to canvas. */
  DESKTOP_AGENT_STREAM_DONE: "desktop.agent.stream.done",
  /** Desktop CLI push events (e.g. voo:codex-text) relayed to canvas. */
  DESKTOP_CLI_EVENT: "desktop.cli.event",
};

/** Requests handled by the background service worker. */
export const BG = {
  FETCH_AS_DATA_URL: "bg.fetchAsDataUrl",
  /** Captures the next GLB export started by the active Tripo adapter. */
  CAPTURE_MODEL_3D_DOWNLOAD: "bg.captureModel3dDownload",
  MEDIA_UPLOAD: "bg.mediaUpload",
  OPEN_WORKFLOW: "bg.openWorkflow",
  IMPORT_PINTEREST_IMAGE: "bg.importPinterestImage",
  CONSUME_PENDING_IMPORT: "bg.consumePendingImport",
  SHOW_FLOAT_PANEL: "bg.showFloatPanel",
  ROUTE_PLATFORM_REQUEST: "bg.routePlatformRequest",
  PROVIDER_CONFIG_GET: "provider.config.get",
  PROVIDER_CONFIG_SAVE: "provider.config.save",
  PROVIDER_CONFIG_CLEAR: "provider.config.clear",
  PROVIDER_TEST: "provider.test",
  PROVIDER_MODELS: "provider.models",
  PROVIDER_SUBMIT: "provider.submit",
  /**
   * Starts a streaming text completion. The reply only says the job was
   * accepted; the tokens arrive as EVENTS.PROVIDER_STREAM_CHUNK and the
   * outcome as EVENTS.PROVIDER_STREAM_DONE, both keyed by `jobId`.
   */
  PROVIDER_STREAM: "provider.stream",
  PROVIDER_FETCH: "provider.fetch",
  /** ASR transcription through DashScope paraformer. */
  ASR_SUBMIT: "provider.asr.submit",
  ASR_FETCH: "provider.asr.fetch",
  /** Target chat tab → whichever canvas asked: a routed request's outcome. */
  PLATFORM_JOB_DONE: "platform.jobDone",
  /** Frozen result addresses survive browser shutdown without replaying generation. */
  WEB_RECEIPT_LOAD: "webReceipt.load",
  WEB_RECEIPT_SAVE: "webReceipt.save",
  /** Hosted editor → service worker: capability probe for the bridge client. */
  EXTERNAL_PING: "bg.externalPing",
  /** Hosted editor → service worker: one IndexedDB operation, executed by the worker. */
  DB_OP: "bg.dbOp",
  /** Hosted editor ↔ service worker: shared UI settings (locale, open workflow…). */
  SETTINGS_GET: "bg.settingsGet",
  SETTINGS_SET: "bg.settingsSet",
  /** Hosted editor → service worker: cancel/discard a pending or running job. */
  CANCEL_JOB: "bg.cancelJob",
  /** Hosted editor → service worker: announce a workflow write to sibling canvases. */
  SYNC_ANNOUNCE: "bg.syncAnnounce",
  /** Content script → service worker: is the desktop app currently linked? */
  DESKTOP_LINKED: "bg.desktopLinked",
  /** Query which platforms currently have open tabs in the browser. */
  LIST_PLATFORM_TABS: "bg.listPlatformTabs",
  /** Group platform tabs that are already open into the VOO.run tab group. */
  GROUP_PLATFORM_TABS: "bg.groupPlatformTabs",
  /** App-served panel page → app: fetch JSON through the main process. */
  FETCH_JSON: "bg.fetchJson",
  /** Canvas → service worker: query desktop Agent configuration summary. */
  DESKTOP_AGENT_CONFIG: "bg.desktopAgentConfig",
  /** App-served loopback editor → app canvas: read its VOO account session. */
  DESKTOP_AUTH_SESSION: "bg.desktopAuthSession",
  /** App-served loopback editor → app canvas: update its VOO account session. */
  DESKTOP_AUTH_SESSION_SET: "bg.desktopAuthSessionSet",
  /** Canvas → service worker: run streaming LLM completion on desktop via proxy. */
  DESKTOP_AGENT_STREAM: "bg.desktopAgentStream",
  /** Canvas → service worker: cancel active desktop LLM stream. */
  DESKTOP_AGENT_STREAM_CANCEL: "bg.desktopAgentStreamCancel",
  /** Canvas → service worker: invoke a CLI bridge channel on desktop. */
  DESKTOP_CLI_INVOKE: "bg.desktopCliInvoke",
};

/** Origins the canvas iframe accepts postMessage traffic from. */
export const HOST_ORIGINS = [
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://gemini.google.com",
  "https://jimeng.jianying.com",
  "https://chat.deepseek.com",
  "https://www.midjourney.com",
  "https://midjourney.com",
  "https://studio.tripo3d.ai",
];

/**
 * Name of the long-lived port the hosted editor opens to the service worker.
 * The worker relays events (job outcomes, sync announcements, tab changes)
 * over it because runtime broadcasts never reach web pages.
 */
export const BRIDGE_PORT_NAME = "ciw-bridge";

/**
 * Loopback port the desktop client listens on for the extension.
 *
 * The desktop app cannot sign in to Google — an embedded browser is refused —
 * but the user's own Chrome already is signed in, and this extension already
 * runs there. So the client hands platform work to the extension over this
 * link instead of driving the pages itself. The extension dials in; nothing
 * outside this machine can reach it, and the server checks the Origin against
 * the known extension ids besides.
 */
export const DESKTOP_LINK_PORT = 17632;

/**
 * Loopback port the desktop app serves its editor on — the page the
 * extension's panel loads while the app is running, so the right-hand canvas
 * and the app are literally the same workflow. The app also accepts the
 * panel's WebSocket on this same port. Binds to loopback only, like the link.
 */
export const DESKTOP_EDITOR_PORT = 17633;

/** Frames carried over the panel link (the app-served editor page ↔ app). */
export const PANEL = {
  /** panel → app: one background call or DB operation. */
  CALL: "panel.call",
  /** app → panel: the call's outcome, correlated by id. */
  ACK: "panel.ack",
  /** app → panel: a pushed event (import, job outcome, sync marker). */
  EVENT: "panel.event",
  /** Either direction: keep the socket honest. */
  PING: "panel.ping",
  PONG: "panel.pong",
};

/** Frames carried over the desktop link. */
export const LINK = {
  /** desktop → extension: run this platform job. */
  JOB: "link.job",
  /** extension → desktop: the job was accepted (or refused outright). */
  ACK: "link.ack",
  /** extension → desktop: a relayed broadcast (job outcome, event envelope). */
  RELAY: "link.relay",
  /** Either direction: keep the MV3 service worker alive. */
  PING: "link.ping",
  PONG: "link.pong",
  /**
   * extension → desktop: which platforms currently have a tab open in Chrome.
   * The client shows this on its launcher row; it has no tabs of its own.
   */
  TABS: "link.tabs",
  /** desktop → extension: open or focus this platform's tab in Chrome. */
  OPEN: "link.open",
  /**
   * extension → desktop: bring the app window to the front. Sent when
   * something from Chrome — a Pinterest import, say — is about to land on
   * the app's canvas and the user should see it arrive.
   */
  FOCUS: "link.focus",
  /** extension → desktop: query desktop Agent configuration summary. */
  AGENT_CONFIG: "link.agentConfig",
  /** extension → desktop: run streaming LLM completion on desktop. */
  AGENT_STREAM: "link.agentStream",
  /** extension → desktop: cancel active LLM completion stream. */
  AGENT_STREAM_CANCEL: "link.agentStreamCancel",
  /** desktop → extension: streaming chunk for active LLM turn. */
  AGENT_STREAM_CHUNK: "link.agentStreamChunk",
  /** desktop → extension: stream outcome for active LLM turn. */
  AGENT_STREAM_DONE: "link.agentStreamDone",
  /** extension → desktop: invoke a CLI channel on desktop (CLI_BRIDGE_CHANNEL). */
  CLI_INVOKE: "link.cliInvoke",
  /** desktop → extension: push a CLI event (e.g. voo:codex-text). */
  CLI_EVENT: "link.cliEvent",
};

let requestCounter = 0;

/** Builds a correlation id that is unique within one page session. */
export function nextRequestId() {
  requestCounter += 1;
  return `${Date.now().toString(36)}-${requestCounter}`;
}

/**
 * Type guard for envelopes arriving over `window.postMessage`. Anything that
 * does not carry our protocol tag is unrelated page traffic and is dropped.
 */
export function isEnvelope(value) {
  return (
    Boolean(value) && typeof value === "object" && value.protocol === PROTOCOL
  );
}

export function makeRequest(method, payload) {
  return {
    protocol: PROTOCOL,
    kind: "request",
    id: nextRequestId(),
    method,
    payload,
  };
}

export function makeResponse(id, { result, error }) {
  return { protocol: PROTOCOL, kind: "response", id, result, error };
}

export function makeEvent(name, payload) {
  return { protocol: PROTOCOL, kind: "event", name, payload };
}

/**
 * A request that expects no reply. Used for high-frequency traffic such as the
 * drag pointer stream, where a response per pointermove would be pure overhead.
 */
export function makeSignal(method, payload) {
  return { protocol: PROTOCOL, kind: "signal", method, payload };
}
