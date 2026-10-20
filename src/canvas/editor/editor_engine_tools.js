/**
 * Tool switching state machine and tool mode controller.
 *
 * Extracted from editor_engine.js to isolate tool transition lifecycle,
 * cleanups, and warp mode resolution.
 */

import { TOOL } from "./editor_constants.js";
import { findNode, NODE_KIND } from "./scene_model.js";
import { getNodeWarpTool } from "./perspective_geometry.js";
import { warpPatchForTool } from "./editor_engine_warp.js";

export function createEngineToolsController({
  getDoc,
  setDoc,
  selection,
  selectNode,
  crop,
  maskTools,
  annotations,
  penTools,
  selectionController,
  paintTools,
  onLeavePatch,
  notify,
}) {
  let tool = TOOL.SELECT;
  let toolBeforeDropper = TOOL.SELECT;
  let regionMode = "object";
  let regionTarget = "all";
  let healingMode = "aiRepair";
  let aiRepairDownload = null;
  let regionHint = null;
  let regionHintTone = null;

  function setTool(next) {
    const doc = getDoc();
    const previousTool = tool;
    let targetTool = next;
    if (targetTool === TOOL.AI_SELECT) {
      regionMode = "object";
      targetTool = TOOL.REGION;
    }
    const isWarpTool = (t) =>
      t === TOOL.PERSPECTIVE || t === TOOL.DISTORT || t === TOOL.PUPPET_WARP;

    let activeWarpNode = null;
    if (isWarpTool(targetTool)) {
      activeWarpNode = selection.getId()
        ? findNode(doc, selection.getId())
        : null;
      if (!activeWarpNode) {
        const firstImage =
          doc.nodes.find(
            (n) => n.kind === NODE_KIND.IMAGE && n.visible !== false,
          ) || doc.nodes[0];
        if (firstImage) {
          selectNode?.(firstImage.id);
          activeWarpNode = firstImage;
        }
      }
      if (activeWarpNode && !isWarpTool(previousTool)) {
        const existing = getNodeWarpTool(activeWarpNode, targetTool);
        if (existing && existing !== targetTool) targetTool = existing;
      }
    }

    if (previousTool === TOOL.CROP && targetTool !== TOOL.CROP) {
      crop.cancelCrop();
    }
    if (targetTool !== TOOL.LASSO) {
      maskTools.api.cancelLasso();
    }
    if (
      targetTool !== TOOL.MARQUEE ||
      selectionController.getMarqueeMode() !== "poly"
    ) {
      selectionController.cancelPolygonLasso();
    }
    if (
      targetTool !== TOOL.MARQUEE ||
      selectionController.getMarqueeMode() !== "magnetic"
    ) {
      selectionController.cancelMagneticLasso();
    }
    if (annotations.getEditingTextId?.()) {
      annotations.api.endTextEdit?.();
    }
    if (annotations.getEditingRegionId?.()) {
      annotations.api.endRegionLabelEdit?.();
    }
    if (![TOOL.PEN, TOOL.CURVATURE_PEN, TOOL.FREE_PEN].includes(targetTool)) {
      if (penTools.api.getDraft?.()) penTools.api.commitDraftPath?.();
      if (penTools.api.getEdit?.()) penTools.api.endEdit?.();
    }
    if (
      selectionController.getSelectionTransform() &&
      targetTool !== TOOL.SELECT &&
      targetTool !== TOOL.SELECT_REGION
    ) {
      selectionController.setSelectionTransform(null);
    }
    if (targetTool !== TOOL.ERASER && maskTools.api.getMaskEdit()?.implicit) {
      maskTools.api.endMaskEdit();
    }
    if (targetTool === TOOL.REGION || targetTool === TOOL.LASSO) {
      maskTools.api.endMaskEdit();
    }
    regionHint = null;
    regionHintTone = null;
    if (targetTool === TOOL.DROPPER && previousTool !== TOOL.DROPPER) {
      toolBeforeDropper = previousTool;
    }
    if (
      targetTool === TOOL.SELECT &&
      selectionController.getSelectionTransform()
    ) {
      selectionController.setSelectionTransform(null);
    }
    if (isWarpTool(targetTool) && activeWarpNode) {
      const currentDoc = getDoc();
      const targetInDoc = findNode(currentDoc, activeWarpNode.id);
      if (targetInDoc) {
        setDoc(
          {
            ...currentDoc,
            nodes: currentDoc.nodes.map((n) =>
              n.id === activeWarpNode.id
                ? {
                    ...n,
                    ...warpPatchForTool(
                      activeWarpNode,
                      targetTool,
                      previousTool,
                      paintTools.bitmapSourceOf,
                    ),
                  }
                : n,
            ),
          },
          { commit: false },
        );
      }
    }
    tool = targetTool;
    if (targetTool === TOOL.CROP && previousTool !== TOOL.CROP) {
      crop.beginCrop();
    }
    notify();
  }

  return {
    getTool: () => tool,
    setTool,
    getToolBeforeDropper: () => toolBeforeDropper,
    getRegionMode: () => regionMode,
    setRegionMode(mode) {
      regionMode = ["ellipse", "free", "remove", "object"].includes(mode)
        ? mode
        : "object";
      notify();
    },
    getRegionTarget: () => regionTarget,
    setRegionTarget(mode) {
      regionTarget = mode === "layer" ? "layer" : "all";
      notify();
    },
    getHealingMode: () => healingMode,
    setHealingMode(mode) {
      healingMode = ["spot", "aiRepair", "patch", "clone"].includes(mode)
        ? mode
        : "aiRepair";
      if (healingMode !== "patch") {
        onLeavePatch?.();
      }
      notify();
    },
    getAiRepairDownload: () => aiRepairDownload,
    setAiRepairDownload(next) {
      aiRepairDownload = next;
    },
    cancelAiRepairDownload() {
      if (!aiRepairDownload) return;
      aiRepairDownload.abort?.();
      aiRepairDownload = null;
      notify();
    },
    getRegionHint: () => regionHint,
    getRegionHintTone: () => regionHintTone,
    setRegionHint(next, tone = null) {
      regionHint = next;
      regionHintTone = next ? tone : null;
      notify();
    },
  };
}
