import { useDesignStore } from "../../../store/design_store.js";
import { openVooProject } from "../../store/project_io.js";
import { workspaceStorage } from "../../../services/workspace_storage.js";

/** Handlers that open an existing project: file picker, recent item, or dropped file. */
export function useWelcomeOpen({ setWelcomeOpen, setIsDragOver }) {
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

  const handleOpenRecent = async (item) => {
    try {
      if (item.path) {
        const res = await openVooProject({
          store: useDesignStore.getState(),
          fileOrPath: item.path,
        });
        if (res?.success) {
          setWelcomeOpen(false);
        }
      } else if (item.id) {
        // Read file bytes from workspaceStorage (for Web FSA or Virtual IndexedDB)
        try {
          const bytes = await workspaceStorage.readFileBytes(item.id);
          const file = new File([bytes], item.name, {
            type: "application/octet-stream",
          });
          const res = await openVooProject({
            store: useDesignStore.getState(),
            fileOrPath: file,
          });
          if (res?.success) {
            useDesignStore.getState().setFileName?.(item.name);
            setWelcomeOpen(false);
          }
        } catch {
          handleOpenLocal();
        }
      } else {
        handleOpenLocal();
      }
    } catch (err) {
      console.error("[VOO] Failed to open project:", err);
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

  return { handleOpenLocal, handleOpenRecent, handleDrop };
}
