import React from "react";
import PropTypes from "prop-types";
import EditorResizeHandles from "./editor_resize_handles.jsx";
import EditorTextOverlay from "./editor_text_overlay.jsx";
import EditorOutpaintOverlay from "./editor_outpaint_overlay.jsx";
import EditorRegionLabel from "./editor_region_label.jsx";
import { TOOL } from "../editor/editor_constants.js";
import { effectivePage } from "../editor/scene_model.js";
import { docToScreenRect } from "../editor/scene_renderer.js";

/** Focused editing overlays preserve their keyed text and region lifecycles. */
export default function EditorPageOverlays({ page }) {
  const { editingTextId, editingRegionId, doc, focused, ready, canvasType,
    engine, viewport, free, handleResizeCommit, handleResizeDragStart, tool,
    outpaintNode, onOutpaintSubmit, selected, outpaintPlan, stageRef,
    repaintBusy, setOutpaintNode, setOutpaintPlan, onRegionCutout,
    onAddPoint, onRepaint, cutoutBusy } = page;
  const editingTextNode = editingTextId
    ? doc?.nodes.find((candidate) => candidate.id === editingTextId)
    : null;
  const editingRegionNode = editingRegionId
    ? doc?.nodes.find((candidate) => candidate.id === editingRegionId)
    : null;

  return focused && ready && canvasType !== "3d" ? (
      <>
        <EditorResizeHandles
          engine={engine}
          docRect={doc ? docToScreenRect(effectivePage(doc), viewport) : null}
          onCommit={
            free
              ? handleResizeCommit
              : () => engine?.commit("editor.history.entry.resize")
          }
          onDragStart={free ? handleResizeDragStart : null}
          hidden={
            Boolean(doc?.isCanvasRoot) ||
            tool !== TOOL.SELECT ||
            Boolean(doc?.crop) ||
            Boolean(engine?.getSelectionTransform?.()) ||
            Boolean(outpaintNode)
          }
        />

        {editingTextNode ? (
          <EditorTextOverlay
            key={editingTextNode.id}
            node={editingTextNode}
            viewport={viewport}
            onUpdate={(text) => engine?.updateTextEdit(text)}
            onCommit={(text) => engine?.endTextEdit(text)}
          />
        ) : null}

        {/* The outpaint grow-frame survives past the page edges, so it renders
            fixed-positioned outside the clipping stage. Only while its layer
            is still the selected one under the Select tool. */}
        {outpaintNode &&
        onOutpaintSubmit &&
        tool === TOOL.SELECT &&
        selected?.id === outpaintNode.id ? (
          <EditorOutpaintOverlay
            node={outpaintNode}
            plan={outpaintPlan}
            viewport={viewport}
            stageRef={stageRef}
            busy={repaintBusy}
            onSubmit={(grownRect) => {
              onOutpaintSubmit(outpaintNode, grownRect);
              setOutpaintNode(null);
              setOutpaintPlan(null);
            }}
            onCancel={() => {
              setOutpaintNode(null);
              setOutpaintPlan(null);
            }}
          />
        ) : null}

        {editingRegionNode ? (
          <EditorRegionLabel
            key={editingRegionNode.id}
            node={editingRegionNode}
            viewport={viewport}
            onCommit={(label) => engine?.endRegionLabelEdit(label)}
            onIntent={(intent) => engine?.setRegionIntent(intent)}
            onCutout={onRegionCutout}
            onAddPoint={onAddPoint}
            onRepaint={onRepaint}
            cutoutBusy={cutoutBusy}
            repaintBusy={repaintBusy}
          />
        ) : null}
      </>
    ) : null;

}
EditorPageOverlays.propTypes = { page: PropTypes.object.isRequired };
