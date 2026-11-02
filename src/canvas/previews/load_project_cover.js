import { workspaceStorage } from "../../services/workspace_storage.js";
import { loadDraftBytes } from "../store/draft_store.js";
import { getRecentFiles } from "../store/recent_files.js";

const caches = new WeakMap();
const MAX_CACHED_COVERS = 64;
const pending = [];
let active = 0;

/** Limit decoding to visible cards and two concurrent readers. */
function schedule(work) {
  return new Promise((resolve, reject) => {
    pending.push({ work, resolve, reject });
    drain();
  });
}
function drain() {
  while (active < 2 && pending.length) {
    const task = pending.shift();
    active += 1;
    Promise.resolve().then(task.work).then(task.resolve, task.reject).finally(() => { active -= 1; drain(); });
  }
}

export function loadProjectCover(item, { ignoreEmbedded = false } = {}) {
  const driver = workspaceStorage.getDriver();
  return schedule(() => readCover(item, driver, ignoreEmbedded));
}

async function readCover(item, driver, ignoreEmbedded) {
  // Check before reading recovery copies too, since their bytes can be large.
  if (workspaceStorage.getDriver() !== driver) return null;
  if (item.size > 100 * 1024 * 1024) return ignoreEmbedded ? null : item.preview || null;
  const recent = !item.path ? getRecentFiles({ includeTrashed: true }).find(entry => !entry.path && entry.name === item.name) : null;
  const draft = !item.path ? await loadDraftBytes(recent?.id ?? item.id) : null;
  const useDraft = draft?.savedAt && draft.savedAt >= (item.updatedAt ?? 0);
  if (!useDraft && !ignoreEmbedded && item.preview) return item.preview;
  const key = JSON.stringify([item.path || item.id, item.updatedAt, item.size, useDraft ? draft.savedAt : null, ignoreEmbedded]);
  let cache = caches.get(driver);
  if (!cache) { cache = new Map(); caches.set(driver, cache); }
  if (cache.has(key)) return cache.get(key);
  const result = (async () => {
    // A workspace switch invalidates queued paths before any disk access.
    if (workspaceStorage.getDriver() !== driver) return null;
    const raw = useDraft ? draft.bytes : await workspaceStorage.readFileBytes(item.path || item.id);
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("COVER_FILE_TOO_LARGE");
    let file;
    if (/\.svg$/i.test(item.name ?? "")) {
      const { svgBytesToVooFile } = await import("../store/svg_document_io.js");
      file = svgBytesToVooFile(bytes);
    } else {
      const { isVooBinary, decodeVooBinary } = await import("../store/voo_binary.js");
      file = isVooBinary(bytes) ? decodeVooBinary(bytes) : JSON.parse(new TextDecoder().decode(bytes));
    }
    const { createProjectCover } = await import("./project_cover.js");
    return createProjectCover(file, { preferEmbedded: !ignoreEmbedded });
  })();
  cache.set(key, result);
  if (cache.size > MAX_CACHED_COVERS) cache.delete(cache.keys().next().value);
  try { return await result; }
  catch (error) { cache.delete(key); throw error; }
}
