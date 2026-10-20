import { NODE_KIND } from "../scene_model.js";
import { editorCommandError, noSelection, bitmapMissing } from "./errors.js";
import {
  assertRepaintableTarget,
  hasPixelSelection,
  layerDisplayName,
} from "./helpers.js";
import { COMMAND_DEFINITIONS, listCommandCapabilities } from "./definitions.js";
import { extractEditorConstraintsSummary } from "../../agent-runtime/content-constraints.js";
import {
  COMMAND_DOMAIN,
  createExecutionReceipt,
} from "../../../shared/command-protocol.js";

/**
 * Command implementations part 1 (zone split).
 */
export const IMPLEMENTATIONS_PART1 = {
  async fill_selection({ engine }) {
    if (!hasPixelSelection(engine)) throw noSelection();
    // Names a locked or missing target before the engine's bare `false` can
    // collapse every cause into BITMAP_MISSING.
    assertRepaintableTarget(engine);
    const ok = await engine?.fillPixelSelection?.();
    if (!ok) {
      throw bitmapMissing(
        "Content-aware fill could not run — the layer's image is not loaded, or the fill produced no result.",
        "The target layer is unlocked and editable, so what failed is the bitmap: the image may still be loading, or the inpainter returned nothing.",
      );
    }
    return { ok: true };
  },

  async refine_selection({ engine }, args) {
    if (!hasPixelSelection(engine)) throw noSelection();
    const { operation, amount = 4 } = args;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw editorCommandError(
        "ARGS_INVALID",
        "refine amount must be a positive number.",
      );
    }
    let ok = false;
    if (operation === "feather") {
      ok = await engine?.featherPixelSelection?.(numeric);
    } else if (operation === "expand") {
      ok = await engine?.modifyPixelSelection?.(numeric, { expand: true });
    } else if (operation === "contract") {
      ok = await engine?.modifyPixelSelection?.(numeric, { expand: false });
    } else if (operation === "smooth") {
      ok = await engine?.smoothPixelSelection?.(numeric);
    } else {
      throw editorCommandError(
        "ARGS_INVALID",
        `Unknown refine operation: ${operation}`,
        { args: ["operation"] },
        {
          tool: "refine_selection",
          args: { operation: "feather", amount: 4 },
          note: "operation is one of feather | expand | contract | smooth.",
        },
      );
    }
    if (!ok) {
      throw bitmapMissing(
        "The image bitmap is unavailable — the refine could not run.",
      );
    }
    // Selection edits are chrome in the engine but user-visible work; a single
    // post-mutation commit makes one refine = one undoable history entry.
    engine?.commit?.(COMMAND_DEFINITIONS.refine_selection.historyLabel);
    return { operation, amount: numeric, ok: true };
  },

  get_editor_context({ engine }) {
    const doc = engine?.getDocument?.() ?? null;
    const nodeKinds = doc?.nodes
      ? [...new Set(doc.nodes.map((n) => n.kind).filter(Boolean))]
      : [];
    const selectedNodes = engine?.getSelectedNodes?.() ?? [];
    const objects = selectedNodes.map((n) => ({
      id: n.id,
      name: layerDisplayName(n),
      kind: n.kind ?? null,
      pen: n.pen === true,
    }));
    const pixelSelection = engine?.getPixelSelection?.() ?? null;
    const hasPixelSelection = Boolean(pixelSelection?.contours?.length);
    const hasPen = objects.some((o) => o.kind === NODE_KIND.PATH);
    const hasText = objects.some((o) => o.kind === NODE_KIND.TEXT);
    const hasImage = nodeKinds.includes(NODE_KIND.IMAGE);
    const actions = [
      { command: "select_region", available: true },
      { command: "get_selection", available: true },
      { command: "get_editor_context", available: true },
      ...(hasImage
        ? [
            { command: "locate_object", available: true },
            { command: "select_object", available: true },
          ]
        : []),
      ...(hasPixelSelection
        ? [
            { command: "refine_selection", available: true },
            { command: "fill_selection", available: true },
            { command: "repaint_selection", available: true },
            { command: "layer_via_copy", available: true },
          ]
        : []),
      ...(hasPen ? [{ command: "add_pen_node", available: true }] : []),
      ...(hasText
        ? [{ command: "apply_copy_structure", available: true }]
        : []),
    ];
    return {
      nodeKinds,
      selectedIds: selectedNodes.map((n) => n.id),
      objectCount: objects.length,
      objects,
      hasPixelSelection,
      pixelSelection: pixelSelection
        ? {
            nodeId: pixelSelection.nodeId ?? null,
            bounds: pixelSelection.bounds ?? null,
            contourCount: pixelSelection.contours?.length ?? 0,
          }
        : null,
      actions,
      constraints: extractEditorConstraintsSummary(doc),
      // Model-facing capability descriptions are generated from the command
      // table. `actions` remains the selection-driven availability list for
      // the agent loop; `commandCatalog` is the full table-derived catalog.
      commandCatalog: listCommandCapabilities(),
    };
  },

  async repaint_selection({ engine }, args) {
    if (!hasPixelSelection(engine)) throw noSelection();
    const prompt = args.prompt?.trim?.();
    if (!prompt) {
      throw editorCommandError(
        "ARGS_INVALID",
        "repaint_selection needs a prompt.",
        { args: ["prompt"] },
        {
          tool: "repaint_selection",
          args: { prompt: "a description of what to paint" },
        },
      );
    }
    // Names a locked or missing target before the engine's bare `false` can
    // collapse every cause into BITMAP_MISSING.
    assertRepaintableTarget(engine);
    try {
      // No `paint` injection: the chat-page route is built by
      // use_editor_raster.js, a React module, which this React-free table
      // cannot import. The agent therefore paints through the engine's
      // configured-provider route, and the command description says so.
      const ok = await engine?.aiRepaintPixelSelection?.({ prompt });
      if (!ok) {
        throw bitmapMissing(
          "AI repaint produced no composite — the layer's image is not loaded, or the painted result could not be used.",
          "The target layer is unlocked and editable, so what failed is the bitmap or the painted result: the image may still be loading, or the repaint route returned nothing that could be decoded.",
        );
      }
      return { ok: true };
    } catch (err) {
      if (
        err?.code === "providerNotConfigured" ||
        err?.code === "PROVIDER_NOT_CONFIGURED"
      ) {
        throw editorCommandError(
          "PROVIDER_NOT_CONFIGURED",
          "AI repaint needs an image provider key — configure one in settings first.",
          { provider: ["image"] },
          {
            tool: "fill_selection",
            args: {},
            note: "Use content-aware fill (no key needed) or configure a provider key.",
          },
        );
      }
      throw err;
    }
  },

  async select_region({ engine }, args) {
    const { nodeId, x, y, width, height } = args;
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw editorCommandError(
        "ARGS_INVALID",
        "select_region needs a positive width and height.",
        { args: ["width", "height"] },
        {
          tool: "list_nodes",
          args: {},
          note: "Region size must be > 0 in document pixels.",
        },
      );
    }
    const { rectContour } = await import("../pixel_selection.js");
    const contours = rectContour({ x, y, width, height });
    if (!contours.length) {
      throw editorCommandError(
        "ARGS_INVALID",
        "The region produced no contour.",
      );
    }
    const host = nodeId ?? engine?.getSelectedId?.() ?? null;
    if (!host) {
      throw editorCommandError(
        "NODE_NOT_FOUND",
        "No image node to select on — pass nodeId or select an image first.",
        { nodes: ["image"] },
        {
          tool: "list_nodes",
          args: {},
          note: "Find an image node id and pass it as nodeId.",
        },
      );
    }
    const bounds = { x, y, width, height };
    engine?.combinePixelSelection?.(
      null,
      { nodeId: host, contours, bounds },
      "replace",
    );
    return { nodeId: host, bounds };
  },

  async layer_via_copy({ engine }) {
    if (!hasPixelSelection(engine)) throw noSelection();
    if (typeof engine?.layerFromSelection !== "function") {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "This editor build cannot copy a selection to its own layer.",
        { engine: ["layerFromSelection"] },
      );
    }
    const saved = engine.getPixelSelection();
    const ok = await engine.layerFromSelection();
    if (!ok) {
      throw bitmapMissing(
        "Layer via copy could not run — the selection is not on a loaded image layer.",
      );
    }
    // The engine deselects after the copy and makes the new layer the active
    // one. Restore the source marquee so a following fill_selection patches
    // the original rather than the copy.
    if (saved) engine.setPixelSelection?.(saved);
    const newNodeId = engine.getSelectedId?.() ?? null;
    return createExecutionReceipt({
      ok: true,
      commandId: "layer_via_copy",
      domain: COMMAND_DOMAIN.EDITOR,
      actionId: "editor.command.layer_via_copy",
      affectedIds: newNodeId ? [newNodeId] : [],
      undoEntries: 1,
      nodeId: newNodeId,
      sourceNodeId: saved?.nodeId ?? null,
      selectionRestored: Boolean(saved),
      data: {
        nodeId: newNodeId,
        sourceNodeId: saved?.nodeId ?? null,
        selectionRestored: Boolean(saved),
      },
    });
  },

  async select_object({ engine }, args) {
    const { nodeId, x, y, width, height, mode = "replace" } = args;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw editorCommandError(
        "ARGS_INVALID",
        "select_object needs a document-space box (x, y, width, height) around the object.",
        { args: ["x", "y", "width", "height"] },
        {
          tool: "locate_object",
          args: { description: "the object to select" },
          note: "locate_object returns the box; pass it straight through.",
        },
      );
    }
    const host = nodeId ?? engine?.getSelectedId?.() ?? null;
    const node = host
      ? engine?.getDocument?.()?.nodes?.find((entry) => entry.id === host)
      : null;
    if (!node) {
      throw editorCommandError(
        "NODE_NOT_FOUND",
        "No image layer to select on — pass nodeId or select an image first.",
        { nodes: ["image"] },
        {
          tool: "get_editor_context",
          args: {},
          note: "Read the editor context for the image layer's id.",
        },
      );
    }

    const matting = await import("../local_matting.js");
    if (!matting.isLocalMattingSupported()) {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "This device cannot run the local matting model, so object selection is unavailable.",
        { engine: ["matting"] },
        {
          tool: "select_region",
          args: { x, y, width, height },
          note: "Fall back to the rectangular selection.",
        },
      );
    }
    if (!(await matting.isModelCached())) {
      throw editorCommandError(
        "MODEL_NOT_READY",
        "The object-selection model is not downloaded yet — the user has to allow the download once (toolbar object select, W).",
        { model: ["matting"] },
        {
          tool: "select_region",
          args: { x, y, width, height },
          note: "Use the rectangular selection, or ask the user to run object select once so the model is cached.",
        },
      );
    }

    const source = engine?.exportNodePng?.(host);
    if (!source) {
      throw editorCommandError(
        "BITMAP_MISSING",
        "The layer's bitmap is unavailable — object selection could not run.",
        { bitmap: ["image"] },
      );
    }
    const { dataUrlToBlob } = await import("../../../shared/db_wire.js");
    const bitmap = await createImageBitmap(dataUrlToBlob(source));
    try {
      const scaleX = bitmap.width / (node.width || bitmap.width);
      const scaleY = bitmap.height / (node.height || bitmap.height);
      // The matting result carries what the edge refinement did as well as the
      // matte; this command only needs the matte, so it takes that and leaves
      // the outcome with the caller that shows it.
      const { blob: matte } = await matting.runRegionMatting(bitmap, {
        x: (x - node.x) * scaleX,
        y: (y - node.y) * scaleY,
        width: width * scaleX,
        height: height * scaleY,
      });
      const { selectionFromMatte } = await import("../pixel_selection.js");
      const selection = await selectionFromMatte(matte, node);
      if (!selection) {
        throw editorCommandError(
          "NOTHING_FOUND",
          "The model found no object inside that box.",
          {},
          {
            tool: "select_object",
            args: { nodeId: host },
            note: "Try a tighter box around the object, or select_region for a plain rectangle.",
          },
        );
      }
      if (mode !== "replace" && engine?.getPixelSelection?.()) {
        engine.combinePixelSelection(
          engine.getPixelSelection(),
          selection,
          mode,
        );
      } else {
        engine?.setPixelSelection?.(selection);
      }
      engine?.commit?.(COMMAND_DEFINITIONS.select_object.historyLabel);
      return { nodeId: host, bounds: selection.bounds };
    } finally {
      bitmap.close?.();
    }
  },
};
