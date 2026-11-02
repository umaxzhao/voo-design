/**
 * Low-level DOM helpers used by the platform adapters. Everything here runs in
 * the ChatGPT / Gemini page context.
 */

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The anchor-chain tiers (ROADMAP §三·2, selector fallback chains).
 *
 * A chain may be either a plain ordered array (existing behaviour, exact order
 * preserved) or a tiered object whose candidates are queried tier by tier in
 * this order:
 *
 *   1. `semantic`    — what the control is for, in the platform's own words
 *                      (`[aria-label="…"]`, `[role="textbox"]`, `[title="…"]`)
 *   2. `data`        — stable test hooks (`[data-testid="…"]`,
 *                      `[data-test-id="…"]`, `[data-element="…"]`)
 *   3. `structural`  — where the control sits (`form button[type="submit"]`,
 *                      class fragments) — last, because markup moves
 *
 * Semantic labels outrank test hooks so a redesigned page whose testid was
 * dropped (ChatGPT 2026) still resolves through the aria-label it kept.
 * Missing or empty tiers are skipped; a missing chain is not an error — see
 * queryFirst.
 */
const CHAIN_TIERS = ["semantic", "data", "structural"];

/** Flattens a tiered chain object into spec order; arrays pass through. */
export function chainSelectors(selectors) {
  if (Array.isArray(selectors)) return selectors;
  const flat = [];
  for (const tier of CHAIN_TIERS) {
    flat.push(...(Array.isArray(selectors?.[tier]) ? selectors[tier] : []));
  }
  return flat;
}

/**
 * Returns the first element matching any selector in the chain.
 *
 * A missing chain is not a programming error: an adapter for a page that has
 * no send button, no scroll container or no new-chat button simply leaves the
 * key out, and "there is no such element" is exactly what null means here.
 * Iterating undefined instead turned that into a crash surfacing on the node
 * as the unreadable minified `t is not iterable`.
 */
export function queryFirst(selectors, root = document) {
  for (const selector of chainSelectors(selectors)) {
    const element = root.querySelector(selector);
    if (element) return element;
  }
  return null;
}

/** Returns matches for the first selector in the chain that matches anything. */
export function queryAllFirstMatch(selectors, root = document) {
  for (const selector of chainSelectors(selectors)) {
    const elements = root.querySelectorAll(selector);
    if (elements.length > 0) return Array.from(elements);
  }
  return [];
}

/**
 * Polls `probe` until it returns a truthy value or the timeout elapses.
 * Returns `null` on timeout rather than throwing, so callers can decide.
 */
export async function waitFor(probe, { timeout = 10000, interval = 120 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await sleep(interval);
  }
}

function isEditable(element) {
  return (
    element.isContentEditable ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "INPUT"
  );
}

function normalizedEditorText(element) {
  const value =
    element.tagName === "TEXTAREA" || element.tagName === "INPUT"
      ? element.value
      : element.textContent;
  return (value ?? "").replace(/[\s\u200b]+/g, "");
}

function composerContainsText(composer, text) {
  const expected = (text ?? "").replace(/[\s\u200b]+/g, "");
  return expected.length > 0 && normalizedEditorText(composer) === expected;
}

/** True when the composer holds exactly `text` (whitespace-insensitive). */
export function composerHasText(composer, text) {
  return composerContainsText(composer, text);
}

/**
 * Writes `text` into a composer, replacing whatever is there.
 *
 * Both ChatGPT (ProseMirror) and Gemini (Quill) ignore direct `textContent`
 * assignment because their internal model would go out of sync. Simulating a
 * paste is the one path both editors handle correctly, with `insertText` as a
 * fallback for plain textareas and older builds.
 */
export async function setComposerText(composer, text) {
  if (!composer || !isEditable(composer)) {
    throw new Error("composer-not-editable");
  }

  composer.focus();
  await sleep(30);

  if (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") {
    const setter = Object.getOwnPropertyDescriptor(
      composer.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(composer, text);
    try {
      composer.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text,
        }),
      );
    } catch {
      // Best-effort for environments without InputEvent
    }
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
    composer.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "a" }),
    );
    composer.dispatchEvent(
      new KeyboardEvent("keyup", { bubbles: true, key: "a" }),
    );
    if (!composerContainsText(composer, text)) {
      throw new Error("composer-write-failed");
    }
    return;
  }

  // Clear existing content first.
  document.execCommand("selectAll", false, undefined);
  document.execCommand("delete", false, undefined);

  const transfer = new DataTransfer();
  transfer.setData("text/plain", text);
  composer.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true,
    }),
  );

  await sleep(60);
  if (!composerContainsText(composer, text)) {
    // The editor swallowed the paste (some builds require a trusted event).
    document.execCommand("insertText", false, text);
    await sleep(60);
  }

  if (!composerContainsText(composer, text)) {
    // Modern ProseMirror builds can reject both untrusted paste and
    // execCommand. Updating the DOM followed by a native input event gives the
    // editor one final opportunity to reconcile its internal document.
    composer.textContent = text;
    composer.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }),
    );
    await sleep(60);
  }

  if (!composerContainsText(composer, text)) {
    throw new Error("composer-write-failed");
  }
}

/** Converts a data URL produced by the canvas back into a `File` for upload. */
export function dataUrlToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const extension = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  return new File([bytes], `${filename}.${extension}`, { type: mime });
}

/** Attaches files through a hidden `<input type="file">`. */
export function setFilesOnInput(input, files) {
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  try {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "files",
    );
    descriptor?.set?.call(input, transfer.files);
  } catch {
    // fallback
  }
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Drops files onto a specific element, as a drag from the desktop would.
 *
 * Some pages do not have one attachment slot but several labelled drop zones,
 * and which zone receives the file decides what the file *means* — Midjourney
 * turns a picture dropped on "Start Frame" into a video job and one dropped on
 * "Image Prompts" into a reference. A file input cannot express that choice;
 * the drop target is the choice.
 *
 * The full enter/over/drop sequence is sent because React drop handlers
 * commonly ignore a drop that was never preceded by a dragover they could
 * cancel.
 */
export function dropFilesOnto(target, files) {
  if (
    typeof DragEvent === "undefined" ||
    !target ||
    !files ||
    files.length === 0
  )
    return;
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  // Real coordinates, not the (0,0) a bare synthetic event carries: a handler
  // that hit-tests the pointer would otherwise see the drop land in the far
  // corner of the viewport rather than on this element.
  const box = target.getBoundingClientRect?.() ?? {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  };
  const clientX = Math.round(box.left + box.width / 2);
  const clientY = Math.round(box.top + box.height / 2);
  for (const type of ["dragenter", "dragover", "drop"]) {
    target.dispatchEvent(
      new DragEvent(type, {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX,
        clientY,
      }),
    );
  }
}

/** Fallback attachment path: paste the files straight into the composer. */
export function pasteFilesInto(target, files) {
  if (typeof ClipboardEvent === "undefined" || !target) return;
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  target.focus?.();
  target.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true,
    }),
  );
}

export function imageElementToDataUrl(element) {
  if (
    !element ||
    (typeof element.getContext !== "function" && element.tagName !== "IMG")
  ) {
    return null;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = element.naturalWidth || element.clientWidth || 512;
    canvas.height = element.naturalHeight || element.clientHeight || 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(element, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * Reads a media URL as a data URL. Tried in the page context first because
 * `blob:` and cookie-scoped URLs are only readable here; canvas drawing and the
 * background worker are fallbacks for cross-origin or restricted CDN URLs.
 */
export async function mediaUrlToDataUrl(url, backgroundFetch, element = null) {
  if (!url) {
    if (element) {
      const canvasUrl = imageElementToDataUrl(element);
      if (canvasUrl) return canvasUrl;
    }
    throw new Error("missing-url");
  }

  if (url.startsWith("data:")) return url;

  // Credentials first: conversation assets on the chat platforms live behind
  // the session, and an anonymous request for one gets a login page.
  const attempt = async (init) => {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return blobToDataUrl(await response.blob());
  };

  try {
    return await attempt({ credentials: "include" });
  } catch {
    // A CDN answering with a wildcard `Access-Control-Allow-Origin` cannot be
    // asked for credentials at all — the browser refuses the combination
    // before anything is sent, so the request above fails without the server
    // ever seeing it. Such assets are public, and a plain request gets them.
    // Midjourney's CDN is one of these, and skipping this attempt is why its
    // finished pictures never made it back to the canvas.
    try {
      return await attempt(undefined);
    } catch {
      // Both network paths are out; fall through to the local copies below.
    }
    if (element) {
      const canvasUrl = imageElementToDataUrl(element);
      if (canvasUrl) return canvasUrl;
    }
    return backgroundFetch(url);
  }
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("blob-read-failed"));
    reader.readAsDataURL(blob);
  });
}

/** A cheap fingerprint of a subtree, used to detect that streaming has settled. */
export function subtreeSignature(element) {
  if (!element) return "";
  const images = Array.from(element.querySelectorAll("img"))
    .map((img) => `${img.currentSrc || img.src}|${img.naturalWidth}`)
    .join(",");
  return `${element.textContent.length}#${images}`;
}

/**
 * The text of a reply the way a reader sees it.
 *
 * `textContent` concatenates every descendant text node with nothing in
 * between, so an answer written as several paragraphs — or a numbered list —
 * arrives as one run-on line and the structure the model was asked for is gone
 * before it reaches the canvas. `innerText` follows the rendered layout, which
 * is where the paragraph breaks actually are. It only exists on rendered
 * elements, so the flat reading stays as the fallback.
 */
export function readableText(element) {
  if (!element) return "";
  if (typeof element.innerText === "string") return element.innerText;
  return element.textContent ?? "";
}

/**
 * Cleans a reply harvested from a turn container.
 *
 * `textContent` sweeps up the platform's own chrome along with the answer —
 * screen-reader speaker labels ("Gemini 说", "ChatGPT said") and the action
 * buttons rendered inside the same element. None of that belongs in text that
 * gets pasted into a downstream prompt.
 */
const SPEAKER_LABEL =
  /^\s*(ChatGPT|Gemini|即梦|Assistant)\s*(说|said|表示)?\s*[:：]?\s*/i;

/** Action buttons render inside the turn, so their labels bracket the answer. */
const UI_LABEL =
  "编辑|复制|重新生成|分享|好评|差评|朗读|Edit|Copy|Regenerate|Share";
const LEADING_UI = new RegExp(`^\\s*(?:${UI_LABEL})\\s*`);
const TRAILING_UI = new RegExp(`\\s*(?:${UI_LABEL})\\s*$`);

/**
 * Progress lines a platform paints inside the turn while a tool runs.
 *
 * ChatGPT shows "正在分析 3 幅图片" while its vision tool reads an attachment,
 * and drops the stop button for the duration. The turn is then mounted, holds
 * text, and sits perfectly still — indistinguishable from a finished reply by
 * every signal the settle loop has. Harvested as an answer, this is what ends
 * up on the canvas instead of the prompt the user asked for.
 */
const WORKING_STATUS =
  /^(正在[一-龥]{0,8}|已?思考[一-龥]{0,4}|(?:生成|创建|绘制|制作|撰写|优化)(?:初稿|内容|文本|图像|图片)?(?:中|进度)\s*\d{0,3}%?|Analy[sz]ing|Thinking|Reasoning|Reading|Searching|Working on|Generating|Drafting)/i;

/** Longest a progress line runs. A real answer that opens the same way does not. */
const MAX_STATUS_LENGTH = 40;

/** True when the turn holds a progress line and nothing else yet. */
export function isWorkingStatus(text) {
  const trimmed = (text ?? "").trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_STATUS_LENGTH &&
    WORKING_STATUS.test(trimmed)
  );
}

export function cleanReplyText(raw) {
  let text = (raw ?? "").trim();
  text = text.replace(SPEAKER_LABEL, "");

  // Labels stack on both ends, so peel until nothing more comes off.
  let previous;
  do {
    previous = text;
    text = text.replace(LEADING_UI, "").replace(TRAILING_UI, "");
  } while (text !== previous);

  // Rendered text keeps the blank rows the platform puts between an answer and
  // its toolbar. One empty line between paragraphs is the most that carries
  // meaning downstream.
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  // Strip DeepSeek / reasoning model thinking headers if present
  text = text.replace(/^已?思考[（(]用时.*?秒[）)]\s*/, "");
  // Strip code block backticks if the model wrapped its entire text output in a codeblock
  if (text.startsWith("```") && text.endsWith("```")) {
    text = text
      .replace(/^```[a-z]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
  }
  return text;
}
