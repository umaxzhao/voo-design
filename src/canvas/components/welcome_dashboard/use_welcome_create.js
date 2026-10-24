import { useDesignStore } from "../../../store/design_store.js";
import { addRecentFile } from "../../store/recent_files.js";
import { createDocument, CANVAS_TYPE } from "../../editor/scene_doc_factory.js";
import { encodeVooBinary } from "../../store/voo_binary.js";
import { workspaceStorage, guessCategory } from "../../../services/workspace_storage.js";

/** Handlers that create a new design file: blank/preset or community template. */
export function useWelcomeCreate({
  t,
  fileList,
  reloadFiles,
  setWelcomeOpen,
}) {
  const handleCreateNew = async (preset = null) => {
    let baseLabel = "Design 1";
    let width = 1200;
    let height = 800;
    let canvasType = CANVAS_TYPE.DESIGN;
    let category = "web";

    if (preset) {
      baseLabel = preset.label ? t(preset.label) : preset.name || "Untitled";
      width = preset.width || 1200;
      height = preset.height || 800;
      canvasType = preset.type || CANVAS_TYPE.DESIGN;
      category = preset.category || guessCategory(baseLabel);
    }

    // Ensure unique file name
    const existingNames = new Set(fileList.map((f) => f.name));
    let uniqueName = `${baseLabel}.voo`;
    let counter = 1;
    while (existingNames.has(uniqueName)) {
      counter += 1;
      uniqueName = `${baseLabel} ${counter}.voo`;
    }

    const pageId = `page-${Date.now().toString(36)}`;
    const doc = createDocument(width, height, "#171717", { canvasType, canvasId: pageId });
    const vooFile = {
      format: "voo",
      version: 2,
      kind: "design",
      document: doc,
      assets: {},
    };
    const bytes = encodeVooBinary(vooFile);

    try {
      const saved = await workspaceStorage.writeFileBytes(uniqueName, bytes, { category });
      addRecentFile({
        name: saved?.name || uniqueName,
        path: saved?.path || null,
        category,
        isDraft: false,
      });
      useDesignStore.getState().loadVooProject({
        vooData: vooFile,
        filePath: saved?.path || null,
        fileName: saved?.name || uniqueName,
        fileHandle: saved?.handle || null,
      });
      await reloadFiles();
      setWelcomeOpen(false);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.writeFileBytes failed, fallback to memory project:", err);
      useDesignStore.getState().newVooProject({ label: baseLabel, width, height, canvasType });
      addRecentFile({
        name: uniqueName,
        path: null,
        isDraft: true,
        category,
      });
      await reloadFiles();
      setWelcomeOpen(false);
    }
  };

  const handleUseTemplate = async (template) => {
    try {
      const doc = template.createDoc();
      const pageId = `page-${Date.now().toString(36)}`;
      doc.id = pageId;

      const vooFile = {
        format: "voo",
        version: 2,
        kind: "design",
        document: doc,
        assets: {},
      };

      const bytes = encodeVooBinary(vooFile);
      const baseName = template.title || "Community Template";
      const existingNames = new Set(fileList.map((f) => f.name));
      let uniqueName = `${baseName}.voo`;
      let counter = 1;
      while (existingNames.has(uniqueName)) {
        counter += 1;
        uniqueName = `${baseName} (${counter}).voo`;
      }

      let saved = null;
      try {
        saved = await workspaceStorage.writeFileBytes(uniqueName, bytes, {
          category: template.category || "web",
        });
      } catch (err) {
        console.warn("[VOO] workspaceStorage.writeFileBytes error, continuing in-memory:", err);
      }

      addRecentFile({
        name: saved?.name || uniqueName,
        path: saved?.path || null,
        category: template.category || "web",
        isDraft: false,
      });

      useDesignStore.getState().loadVooProject({
        vooData: vooFile,
        filePath: saved?.path || null,
        fileName: saved?.name || uniqueName,
        fileHandle: saved?.handle || null,
      });

      await reloadFiles();
      setWelcomeOpen(false);
    } catch (err) {
      console.error("[VOO] Failed to instantiate community template:", err);
    }
  };

  return { handleCreateNew, handleUseTemplate };
}
