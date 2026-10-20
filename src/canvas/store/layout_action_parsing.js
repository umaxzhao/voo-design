// Layout parsing action seam: HTML materialization, editor sync, and reference palettes.
import {
  resolveCanvasSize,
  resolveLayoutImages,
  flattenDocument,
} from "./layout_action_helpers.js";
import { RUN_STATUS } from "../nodes/types.js";
import { dataUrlToBlob, getImageBlobMap, putImage } from "./db.js";
import { mergeBlobsAsUrls } from "./image_cache.js";
import { layoutHtmlOf } from "./layout_versions.js";
import { LAYOUT_EVENT, emitAgentPanelEvent } from "./agent_panel_bus.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";
import { extractPaletteFromPixels } from "../layout_palette.js";
import { DESIGN_SYSTEMS } from "../design_systems.js";
import { seedDesignSystemColorVariables } from "../editor/scene_color_variables.js";

export function createLayoutParsingActions(set, get) {
  return {
    /**
     * Parses the node's stored HTML into an editor document, flattens a
     * preview, and opens the editor on the resulting layers. Runs without a
     * model round-trip, so the user can re-parse or re-apply a version.
     */
    async parseLayoutHtml(
      nodeId,
      {
        requireLayers = false,
        preserveSurfaceChoice = false,
        canvasSize = null,
      } = {},
    ) {
      if (isWorkflowReadOnly(get())) return false;
      const node = get().nodes.find((candidate) => candidate.id === nodeId);
      const html = layoutHtmlOf(node);
      if (!html) {
        get().updateNodeData(nodeId, {
          status: RUN_STATUS.ERROR,
          stage: null,
          error: { code: "layoutNoHtml" },
        });
        return false;
      }

      const { width, height } = canvasSize ?? (await resolveCanvasSize(node));

      get().updateNodeData(nodeId, {
        status: RUN_STATUS.RUNNING,
        stage: "parsing",
        error: null,
      });
      try {
        const { htmlToDocument } = await import("../editor/html_import.js");
        const { doc: parsedDoc, pendingImages } = htmlToDocument(html, {
          width,
          height,
          preserveHierarchy: true,
        });
        const designSystem =
          DESIGN_SYSTEMS[node.data?.layoutResolvedDesignSystem];
        const doc = designSystem
          ? seedDesignSystemColorVariables(parsedDoc, designSystem)
          : parsedDoc;
        if (requireLayers && !doc.nodes?.length) {
          throw new Error("layout-parse-empty");
        }
        const resolvedImages = await resolveLayoutImages(doc, pendingImages);
        const imageUrls = mergeBlobsAsUrls(
          get().images,
          new Map(resolvedImages),
        );
        const preview = await flattenDocument(doc, imageUrls);

        const imageId = `img-${crypto.randomUUID()}`;
        const blob = dataUrlToBlob(preview);
        await putImage(imageId, blob);
        set({
          images: mergeBlobsAsUrls(get().images, new Map([[imageId, blob]])),
        });

        get().updateNodeData(nodeId, {
          imageId,
          editorDoc: doc,
          filename: "",
          status: RUN_STATUS.SUCCESS,
          stage: null,
          error: null,
        });
        // A page generated inside a multi-page Design Editor must not replace
        // the free canvas with a single-page session after materialization.
        // Generation opened the editor before streaming. If the user switched
        // back to the workflow meanwhile, materialization must not reopen it.
        if (!preserveSurfaceChoice || get().editorSurface !== "workflow") {
          if (!(get().editingNodeIds ?? []).includes(nodeId)) {
            get().openImageEditor(nodeId);
          }
          get().setEditorSurface("editor");
        }

        try {
          // Keep this dynamic import to avoid a store/editor bridge cycle.
          const { resolveTargetEditorBridge } =
            await import("../editor/editor_target_resolver.js");
          const bridge = resolveTargetEditorBridge(get(), {
            targetNodeId: nodeId,
          });
          if (bridge?.engine && typeof bridge.engine.open === "function") {
            await bridge.engine.open({
              src: get().images[imageId] ?? null,
              imageId,
              savedDoc: doc,
            });
          }
        } catch (error) {
          // Ignore only the resolver's expected no-mounted-editor state.
          if (error?.code !== "EDITOR_NOT_OPEN") throw error;
        }
        return true;
      } catch (error) {
        get().updateNodeData(nodeId, {
          status: RUN_STATUS.ERROR,
          stage: null,
          error: { code: "layoutParse", message: error?.message },
        });
        return false;
      }
    },

    /**
     * Analyses a reference image and pins its extracted palette to the node.
     * The palette becomes the generation brief's locked colour scheme, so
     * the design picks up the reference's look without any vision model.
     */
    async analyzeReferenceImage(nodeId, imageId) {
      const node = get().nodes.find((candidate) => candidate.id === nodeId);
      if (!node || !imageId) return null;
      try {
        const blobs = await getImageBlobMap([imageId]);
        const blob = blobs.get(imageId);
        if (!blob) return null;
        const { decodeImageSource } = await import("../editor/bitmap_cache.js");
        const img = await decodeImageSource(blob);
        const maxEdge = 256;
        const scale = Math.min(
          1,
          maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
        canvas.height = Math.max(
          1,
          Math.round((img.naturalHeight || 1) * scale),
        );
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const palette = extractPaletteFromPixels({
          data: imageData.data,
          width: canvas.width,
          height: canvas.height,
        });
        get().updateNodeData(nodeId, {
          layoutReferenceImage: imageId,
          layoutReferencePalette: {
            colors: palette.colors,
            background: palette.background,
            ink: palette.ink,
            accent: palette.accent,
            analyzedAt: Date.now(),
          },
        });
        emitAgentPanelEvent(LAYOUT_EVENT.PALETTE, {
          nodeId,
          palette: {
            colors: palette.colors,
            background: palette.background,
            ink: palette.ink,
            accent: palette.accent,
          },
        });
        return palette;
      } catch {
        return null;
      }
    },

    /** Stores a reference image and analyses it in one step. */
    async setLayoutReferenceImage(nodeId, file) {
      if (isWorkflowReadOnly(get())) return false;
      if (!file || !file.type?.startsWith("image/")) return false;
      const imageId = `img-${crypto.randomUUID()}`;
      await putImage(imageId, file);
      set({
        images: mergeBlobsAsUrls(get().images, new Map([[imageId, file]])),
      });
      await get().analyzeReferenceImage(nodeId, imageId);
      return true;
    },

    /** Drops the reference image and its extracted palette. */
    clearLayoutReferenceImage(nodeId) {
      if (isWorkflowReadOnly(get())) return;
      get().updateNodeData(nodeId, {
        layoutReferenceImage: null,
        layoutReferencePalette: null,
      });
    },
  };
}
