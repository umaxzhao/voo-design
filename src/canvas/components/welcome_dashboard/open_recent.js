import { useDesignStore } from "../../../store/design_store.js";
import { openVooProject } from "../../store/project_io.js";
import { loadDraftBytes } from "../../store/draft_store.js";
import { workspaceStorage } from "../../../services/workspace_storage.js";

export const OPEN_FAILED_KEY = "welcome.recent.openFailed";
export const DRAFT_MISSING_KEY = "welcome.recent.draftMissing";

const toFile = (bytes, name) => new File([bytes], name, { type: "application/octet-stream" });

/** Turns anything thrown or returned into a short, user-readable reason. */
function reasonOf(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.message || value.error || value.reason || "";
}

async function openFile(file, name) {
  const store = useDesignStore.getState();
  const res = await openVooProject({ store, fileOrPath: file });
  if (res?.success) store.setFileName?.(name);
  return res;
}

/** Reads a pathless item from the workspace first, then from its local draft copy. */
async function openPathless(item) {
  const name = item.name || "Untitled.voo";
  if (item.id) {
    try {
      const bytes = await workspaceStorage.readFileBytes(item.id);
      if (bytes?.byteLength) return await openFile(toFile(bytes, name), name);
    } catch (err) {
      console.warn("[VOO] Recent item is not in the workspace, trying its draft copy:", err);
    }
  }
  const draft = await loadDraftBytes(item.id);
  if (!draft) return { missing: true };
  return openFile(toFile(draft.bytes, name), name);
}

/**
 * Opens a recent item without ever falling back to the file picker.
 * Resolves { ok: true } on success, otherwise { ok: false, key, reason } where
 * `key` is the i18n key of the message the user must see.
 */
export async function openRecentItem(item) {
  try {
    const res = item?.path
      ? await openVooProject({ store: useDesignStore.getState(), fileOrPath: item.path })
      : await openPathless(item || {});
    if (res?.missing) return { ok: false, key: DRAFT_MISSING_KEY, reason: "" };
    if (res?.success) return { ok: true };
    return { ok: false, key: OPEN_FAILED_KEY, reason: reasonOf(res) };
  } catch (err) {
    console.error("[VOO] Failed to open recent item:", err);
    return { ok: false, key: OPEN_FAILED_KEY, reason: reasonOf(err) };
  }
}
