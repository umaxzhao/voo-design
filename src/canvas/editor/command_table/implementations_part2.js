import { editorCommandError } from "./errors.js";
import { downscaleDataUrl, hasPixelSelection } from "./helpers.js";
import { COMMAND_DEFINITIONS } from "./definitions.js";
import { marqueeItemForMode } from "../tool_families.js";
import { assertPatchAllowed } from "../../agent-runtime/content-constraints.js";

/**
 * Command implementations part 2 (zone split).
 */
export const IMPLEMENTATIONS_PART2 = {
  async export_canvas_png({ engine }, args) {
    const { maxEdge = 768 } = args;
    const source = engine?.exportPng?.();
    if (!source) {
      throw editorCommandError(
        "BITMAP_MISSING",
        "The page could not be rendered — nothing to look at.",
        { bitmap: ["page"] },
      );
    }
    const doc = engine?.getDocument?.();
    return {
      dataUrl: await downscaleDataUrl(source, maxEdge),
      page: {
        width: doc?.width ?? null,
        height: doc?.height ?? null,
        layerCount: doc?.nodes?.length ?? 0,
      },
    };
  },

  async export_node_png({ engine }, args) {
    const { nodeId, maxEdge = 1024 } = args;
    const host = nodeId ?? engine?.getSelectedId?.() ?? null;
    const node = host
      ? engine?.getDocument?.()?.nodes?.find((entry) => entry.id === host)
      : null;
    const source = host ? engine?.exportNodePng?.(host) : null;
    if (!node || !source) {
      throw editorCommandError(
        "BITMAP_MISSING",
        "No image layer to export — pass nodeId or select an image first.",
        { bitmap: ["image"] },
        {
          tool: "get_editor_context",
          args: {},
          note: "Read the editor context for the image layer's id.",
        },
      );
    }
    const rect = {
      x: node.x ?? 0,
      y: node.y ?? 0,
      width: node.width ?? 0,
      height: node.height ?? 0,
    };
    return {
      nodeId: host,
      rect,
      dataUrl: await downscaleDataUrl(source, maxEdge),
    };
  },

  get_selection({ engine }) {
    const selectedNodes = engine?.getSelectedNodes?.() ?? [];
    return {
      selectedIds: selectedNodes.map((n) => n.id),
      objectCount: selectedNodes.length,
      objects: selectedNodes.map((n) => ({
        id: n.id,
        name: n.name || "Layer",
        // Native Design layers use kind; type is a legacy compatibility field.
        type: n.kind ?? n.type ?? null,
      })),
      hasPixelSelection: hasPixelSelection(engine),
    };
  },

  add_pen_node({ engine }, args) {
    const { svgD, anchors, x, y, stroke, strokeWidth, fill } = args;
    const hasAnchors = Array.isArray(anchors) && anchors.length > 0;
    const hasSvgD = typeof svgD === "string" && svgD.trim().length > 0;
    if (!hasAnchors && !hasSvgD) {
      throw editorCommandError(
        "ARGS_INVALID",
        "add_pen_node needs either an svgD path string (M/L/C/Z) or an anchors array (bezier anchors).",
        { args: ["svgD", "anchors"] },
        {
          tool: "add_pen_node",
          args: { svgD: "M 10 10 L 50 10 L 50 50 Z" },
        },
      );
    }
    if (typeof engine?.addPenNode !== "function") {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "add_pen_node is registered but the editor engine does not expose an addPenNode operation yet.",
        { engine: ["addPenNode"] },
        {
          tool: "get_editor_context",
          args: {},
          note: "Read the editor context; vector drawing is wired in a follow-up.",
        },
      );
    }
    const result = engine.addPenNode({
      svgD,
      anchors,
      x,
      y,
      stroke,
      strokeWidth,
      fill,
    });
    engine?.commit?.(COMMAND_DEFINITIONS.add_pen_node.historyLabel);
    return result;
  },

  apply_copy_structure({ engine }, args) {
    const { structure, prompt, nodeId, x, y, gap } = args;
    const hasStructure =
      (structure && typeof structure === "object") || Array.isArray(structure);
    if (!hasStructure) {
      throw editorCommandError(
        "ARGS_INVALID",
        "apply_copy_structure needs a structure (an array of text blocks, or { blocks: [...] }).",
        { args: ["structure"] },
        {
          tool: "apply_copy_structure",
          args: {
            structure: {
              blocks: [{ text: "Heading" }, { text: "Body" }],
            },
          },
        },
      );
    }
    if (typeof engine?.applyCopyStructure !== "function") {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "apply_copy_structure is registered but the editor engine does not expose an applyCopyStructure operation yet.",
        { engine: ["applyCopyStructure"] },
        {
          tool: "get_editor_context",
          args: {},
          note: "Read the editor context; copy-structure wiring is in a follow-up.",
        },
      );
    }
    const result = engine.applyCopyStructure({
      structure,
      prompt,
      nodeId,
      x,
      y,
      gap,
    });
    engine?.commit?.(COMMAND_DEFINITIONS.apply_copy_structure.historyLabel);
    return result;
  },

  /**
   * Lands the deterministic auto-fix patches of the design tools on the open
   * design document. This is the engine edge of `iterate_design` /
   * `auto_fix_design`: those tools hold no document of their own, they patch
   * the layers the design editor has open.
   *
   * The whole batch is resolved before anything is written, so a patch whose
   * target is not in the open document is refused with nothing half-applied.
   * Applying the rest and reporting success is how the agent ends up believing
   * a layout was fixed when nothing moved; applying the rest and reporting
   * failure leaves layers moved with no way to say by which call.
   */
  apply_design_patches({ engine }, args) {
    const patches = Array.isArray(args?.patches) ? args.patches : null;
    if (!patches || patches.length === 0) {
      throw editorCommandError(
        "ARGS_INVALID",
        "apply_design_patches needs a non-empty patches array.",
        { args: ["patches"] },
      );
    }
    if (
      typeof engine?.updateNode !== "function" ||
      typeof engine?.commit !== "function"
    ) {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "The editor cannot apply layer patches.",
        { engine: ["updateNode", "commit"] },
      );
    }
    const document = engine.getDocument?.();
    if (!document) {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "No design document is open to patch.",
        { document: ["open"] },
        {
          tool: "get_editor_context",
          args: {},
          note: "Open the design editor (or generate the layout) before fixing it.",
        },
      );
    }
    const nodes = Array.isArray(document.nodes) ? document.nodes : [];
    const documentIds = new Set(["document", String(document.id ?? "")]);

    // Pass 1 — resolve every target, write nothing yet.
    const plan = patches.map((entry) => {
      const targetId = String(entry?.targetId ?? "");
      const patch = entry?.patch;
      if (
        !targetId ||
        !patch ||
        typeof patch !== "object" ||
        Array.isArray(patch)
      ) {
        throw editorCommandError(
          "ARGS_INVALID",
          "Each design patch needs a targetId and a patch object.",
          { args: ["patches"] },
        );
      }
      if (documentIds.has(targetId)) {
        const width = Number(patch.width);
        const height = Number(patch.height);
        if (
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0
        ) {
          throw editorCommandError(
            "ARGS_INVALID",
            "A document patch needs positive width and height values.",
            { args: ["patches"] },
          );
        }
        if (typeof engine.setDocumentSize !== "function") {
          throw editorCommandError(
            "CAPABILITY_MISSING",
            "The editor does not expose document resizing.",
            { engine: ["setDocumentSize"] },
          );
        }
        return { kind: "document", targetId, width, height };
      }
      const targetNode = nodes.find((node) => node?.id === targetId);
      if (!targetNode) {
        throw editorCommandError(
          "NODE_NOT_FOUND",
          `Design patch targets layer "${targetId}", which is not part of the open document.`,
          { nodes: [targetId] },
          {
            tool: "get_editor_context",
            args: {},
            note: "Re-read the open design document before patching it.",
          },
        );
      }
      assertPatchAllowed(targetNode, patch, document);
      return { kind: "layer", targetId, patch };
    });

    // Pass 2 — write. Node writes stay out of history until the batch is
    // complete, so the fix is one undo step rather than one per layer; the
    // `finally` keeps whatever landed undoable if a later write throws.
    const applied = [];
    const patchedLayerIds = [];
    try {
      for (const step of plan) {
        if (step.kind === "document") {
          engine.setDocumentSize(step.width, step.height, {
            scaleMode: "none",
          });
        } else {
          engine.updateNode(step.targetId, step.patch, { commit: false });
          patchedLayerIds.push(step.targetId);
        }
        applied.push(step.targetId);
      }
    } finally {
      if (patchedLayerIds.length > 0) {
        engine.commit(COMMAND_DEFINITIONS.apply_design_patches.historyLabel);
      }
    }
    return { ok: true, applied, patchedLayerIds };
  },

  duplicate_selected({ engine }) {
    engine?.duplicateSelected?.();
    return { ok: true };
  },

  delete_selected({ engine }) {
    engine?.deleteSelected?.();
    return { ok: true };
  },

  async delete_selection_pixels({ engine }) {
    await engine?.deleteSelectionPixels?.();
    return { ok: true };
  },

  group_selection({ engine }) {
    engine?.groupSelection?.();
    return { ok: true };
  },

  ungroup_selection({ engine }) {
    engine?.ungroupSelection?.();
    return { ok: true };
  },

  create_clipping_mask({ engine }) {
    engine?.createClippingMask?.();
    return { ok: true };
  },

  release_clipping_mask({ engine }) {
    engine?.releaseClippingMask?.();
    return { ok: true };
  },

  bring_to_front({ engine }) {
    engine?.moveToFront?.(engine?.getSelectedIds?.() ?? []);
    return { ok: true };
  },

  send_to_back({ engine }) {
    engine?.moveToBack?.(engine?.getSelectedIds?.() ?? []);
    return { ok: true };
  },

  select_all({ engine }) {
    engine?.selectAll?.();
    return { ok: true };
  },

  set_document_size({ engine }, args) {
    const width = Number(args?.width);
    const height = Number(args?.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw editorCommandError(
        "ARGS_INVALID",
        "set_document_size needs positive width and height values.",
        { args: ["width", "height"] },
      );
    }
    if (typeof engine?.setDocumentSize !== "function") {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "The editor does not expose document resizing.",
        { engine: ["setDocumentSize"] },
      );
    }
    engine.setDocumentSize(width, height, {
      scaleMode: args?.scaleMode ?? "none",
    });
    const document = engine.getDocument?.();
    return {
      ok: true,
      width: document?.width ?? Math.round(width),
      height: document?.height ?? Math.round(height),
    };
  },

  resize_document_edges({ engine }, args) {
    const deltaX = Number(args?.deltaX);
    const deltaY = Number(args?.deltaY);
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      throw editorCommandError(
        "ARGS_INVALID",
        "resize_document_edges needs finite deltaX and deltaY values.",
        { args: ["deltaX", "deltaY"] },
      );
    }
    if (!args?.edges || typeof args.edges !== "object") {
      throw editorCommandError(
        "ARGS_INVALID",
        "resize_document_edges needs an edges object.",
        { args: ["edges"] },
      );
    }
    if (typeof engine?.resizeDocumentEdges !== "function") {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "The editor does not expose edge resizing.",
        { engine: ["resizeDocumentEdges"] },
      );
    }
    engine.resizeDocumentEdges(args.edges, deltaX, deltaY, {
      fromCentre: Boolean(args.fromCentre),
    });
    const document = engine.getDocument?.();
    return {
      ok: true,
      width: document?.width ?? null,
      height: document?.height ?? null,
    };
  },

  select_all_pixels({ engine }) {
    if (typeof engine?.selectAllPixels !== "function") {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "The editor does not expose pixel selection.",
        { engine: ["selectAllPixels"] },
      );
    }
    if (!engine.selectAllPixels()) {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "No editable image layer is available for pixel selection.",
        { selection: ["editable-image"] },
      );
    }
    return { ok: true, selectedAllPixels: true };
  },

  async stroke_selection({ engine }) {
    await engine?.strokeSelection?.(4);
    return { ok: true };
  },

  set_tool({ engine }, args) {
    const { tool, submode } = args;
    if (!tool || typeof tool !== "string") {
      throw editorCommandError(
        "ARGS_INVALID",
        "set_tool needs a valid tool identifier string.",
        { args: ["tool"] },
      );
    }
    if (submode && typeof submode === "string") {
      if (
        typeof engine?.setMarqueeMode === "function" &&
        marqueeItemForMode(submode)
      ) {
        engine.setMarqueeMode(submode);
      } else if (
        typeof engine?.setBrushMode === "function" &&
        [
          "normal",
          "smudge",
          "blur",
          "sharpen",
          "dodge",
          "burn",
          "sponge",
        ].includes(submode)
      ) {
        engine.setBrushMode(submode);
      } else if (
        typeof engine?.setHealingMode === "function" &&
        ["aiRepair", "spot", "patch", "clone"].includes(submode)
      ) {
        engine.setHealingMode(submode);
      }
    }
    if (typeof engine?.setTool !== "function") {
      throw editorCommandError(
        "CAPABILITY_MISSING",
        "The editor engine does not expose setTool.",
        { engine: ["setTool"] },
      );
    }
    engine.setTool(tool);
    return {
      tool: engine.getTool?.() ?? tool,
      submode: submode ?? null,
      ok: true,
    };
  },

  select_within({ engine }, args) {
    const rect = {
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
    };
    if (typeof engine?.selectWithin === "function") {
      engine.selectWithin(rect);
    }
    const selectedIds =
      engine?.getSelectedIds?.() ??
      (engine?.getSelectedId?.() ? [engine.getSelectedId()] : []);
    return {
      ok: true,
      selectedIds,
      bounds: rect,
    };
  },
};
