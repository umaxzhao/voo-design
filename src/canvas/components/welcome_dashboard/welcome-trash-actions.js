import { workspaceStorage } from "../../../services/workspace_storage.js";
import {
  getRecentFiles,
  moveToTrash,
  restoreFromTrash,
  deletePermanently,
  removeRecentFile,
} from "../../store/recent_files.js";

const recentActions = { moveToTrash, restoreFromTrash, deletePermanently };
const matches = (item, id) => item.id === id || item.path === id;

/** Local drafts/history have no workspace file; never send their IDs to disk APIs. */
export async function changeWelcomeTrash(action, id) {
  const files = await workspaceStorage.scanFiles({ includeTrashed: true });
  const file = files.find((item) => matches(item, id));
  const recent = getRecentFiles({ includeTrashed: true }).find((item) =>
    matches(item, id),
  );
  if (file) {
    const result = await workspaceStorage[action](file.id);
    if (!result?.ok) throw new Error(result?.error || "operation_failed");
  } else if (!recent) {
    throw new Error("file_not_found");
  }
  // A recent entry outside the current workspace only removes/restores its reference.
  recentActions[action](recent?.id ?? id);
}

/** Folder contents return through the disk scan after restoration, not stale recent paths. */
export function forgetDeletedFolderRecents(folderPath) {
  if (!folderPath) return;
  const prefix = `${folderPath.replace(/\\/g, "/").replace(/\/$/, "")}/`;
  for (const item of getRecentFiles({ includeTrashed: true })) {
    if (item.path?.replace(/\\/g, "/").startsWith(prefix))
      removeRecentFile(item.id);
  }
}
