import { useState } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import { openVooProject } from "../../store/project_io.js";
import { openRecentItem } from "./open_recent.js";

/** Handlers that open an existing project: file picker, recent item, or dropped file. */
export function useWelcomeOpen({ setWelcomeOpen, setIsDragOver }) {
  // { key, reason } of the last failed open from Recents, or null.
  const [openNotice, setOpenNotice] = useState(null);

  const handleOpenLocal = async () => {
    try {
      const res = await openVooProject({ store: useDesignStore.getState() });
      if (res?.success) {
        setWelcomeOpen(false);
      }
    } catch (err) {
      console.error("[VOO] Failed to open project:", err);
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

  // Drag & drop .voo project file onto dashboard
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    const vooFile = files.find((f) =>
      /\.(voo|json|psd|fig|pen|svg)$/i.test(f.name ?? ""),
    );
    if (vooFile) {
      const res = await openVooProject({
        store: useDesignStore.getState(),
        fileOrPath: vooFile,
      });
      if (res?.success) {
        setWelcomeOpen(false);
      }
    }
  };

  return { handleOpenLocal, handleOpenRecent, handleDrop, openNotice, dismissOpenNotice: () => setOpenNotice(null) };
}
