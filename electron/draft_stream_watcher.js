import fs from "node:fs";
import path from "node:path";
import { CLI_BRIDGE_EVENT as E } from "../src/shared/cli_bridge_protocol.js";

export const DEFAULT_DRAFT_FILES = Object.freeze(["voo-draft.html", ".voo-stream.html"]);

/**
 * Watches the workspace directory for draft HTML/Pen files.
 * Streams changes to the connected canvas in real-time with debouncing.
 */
export function startDraftStreamWatcher({
  sendToCanvas,
  watchDir = process.cwd(),
  streamFile = process.env.VOO_STREAM_FILE,
  debounceMs = 50,
} = {}) {
  if (typeof sendToCanvas !== "function") return { close: () => {} };

  const targetFiles = new Set(
    streamFile ? [path.basename(streamFile)] : DEFAULT_DRAFT_FILES
  );
  const targetDir = streamFile ? path.dirname(path.resolve(streamFile)) : path.resolve(watchDir);

  let timer = null;
  let watcher = null;
  let closed = false;

  const trigger = (filename) => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (closed) return;
      const filePath = path.join(targetDir, filename);
      try {
        if (!fs.existsSync(filePath)) {
          sendToCanvas(E.STREAM_LAYOUT_UPDATE, { html: "", clear: true, file: filename });
          return;
        }
        const content = await fs.promises.readFile(filePath, "utf-8");
        sendToCanvas(E.STREAM_LAYOUT_UPDATE, { html: content, file: filename });
      } catch {
        // File may be locked mid-write; ignore and wait for next tick
      }
    }, debounceMs);
  };

  try {
    if (fs.existsSync(targetDir)) {
      watcher = fs.watch(targetDir, { persistent: false }, (_eventType, filename) => {
        if (!filename) return;
        if (targetFiles.has(filename)) {
          trigger(filename);
        }
      });
      watcher.on("error", () => {});
    }
  } catch {
    // Non-fatal if watch cannot be started
  }

  return {
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      try {
        watcher?.close();
      } catch {}
    },
    triggerManually: (filename = "voo-draft.html") => trigger(filename),
  };
}
