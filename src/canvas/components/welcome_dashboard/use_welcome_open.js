import { useState } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { openVooProject } from "../../store/open-project.js";
import { isBitmapSourceName } from "../../store/pick-project-source.js";
import { openBitmapAsProject } from "./open_bitmap.js";
import { openRecentItem, OPEN_FAILED_KEY } from "./open_recent.js";

/** Handlers that open an existing project: file picker, recent item, or dropped file. */
export function useWelcomeOpen({ setWelcomeOpen, setIsDragOver }) {
  // { key, reason } of the last failed open from Recents, or null.
  const [openNotice, setOpenNotice] = useState(null);

  const openBitmap = (source) => openBitmapAsProject({
    store: useDesignStore.getState(),
    bytes: source.bytes,
    name: source.name,
    setWelcomeOpen,
  });

  const handleOpenLocal = async (source = null) => {
    // Existing button callbacks pass a click event; only file-like inputs are sources.
    const fileOrPath =
      typeof source?.arrayBuffer === "function" ? source : null;
    setOpenNotice(null);
    try {
      const res = await openVooProject({
        store: useDesignStore.getState(),
        fileOrPath,
        onImageSource: openBitmap,
      });
      if (res?.success) {
        setWelcomeOpen(false);
      }
    } catch (err) {
      console.error("[VOO] Failed to open project:", err);
      setOpenNotice({
        key: OPEN_FAILED_KEY,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Opens a recent item; a failure is shown to the user and never opens the file picker.
  const handleOpenRecent = async (item) => {
    const result = await openRecentItem(item);
    if (result.ok) {
      setOpenNotice(null);
      setWelcomeOpen(false);
    } else {
      setOpenNotice({ key: result.key, reason: result.reason });
    }
  };

  // Drag & drop a project or bitmap onto the dashboard.
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    const sourceFile = files.find((f) =>
      isBitmapSourceName(f.name) ||
      /\.(voo|zip|json|psd|fig|pen|svg)$/i.test(f.name ?? ""),
    );
    if (sourceFile) {
      const res = await openVooProject({
        store: useDesignStore.getState(),
        fileOrPath: sourceFile,
        onImageSource: openBitmap,
      });
      if (res?.success) {
        setWelcomeOpen(false);
      }
    }
  };

  return {
    handleOpenLocal,
    handleOpenRecent,
    handleDrop,
    openNotice,
    dismissOpenNotice: () => setOpenNotice(null),
  };
}
